import { NextResponse } from 'next/server';

import { can, requireTenantSession } from '@/lib/auth/session';
import * as clients from '@/modules/clients/clients.service';
import * as companies from '@/modules/companies/companies.service';
import { isAppError } from '@/lib/errors';
import { CommercialDocument, type DocumentLineItem } from '@/lib/pdf/document-template';
import { translateStatus } from '@/lib/pdf/french-labels';
import { renderPdfResponse } from '@/lib/pdf';
import { logger } from '@/lib/logger';
import * as proformas from '@/modules/proforma-invoices/proforma-invoices.service';

/**
 * Renders a proforma invoice as a PDF, on demand — nothing is stored. Same
 * session-authed, render-fresh pattern as the Quotes PDF route.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/proforma-invoices/[id]/pdf'>,
): Promise<Response> {
  try {
    const { companyId } = await requireTenantSession();

    if (!(await can('proforma_invoices:read'))) {
      return NextResponse.json(
        { error: 'You do not have permission to view this proforma invoice.' },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    const [proforma, company] = await Promise.all([
      proformas.getProforma(companyId, id),
      companies.getCompany(companyId),
    ]);
    const client = await clients.getClient(companyId, proforma.clientId);

    const items: DocumentLineItem[] = proforma.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxRate: item.taxRate,
      lineTotal: item.lineTotal,
    }));

    const addressLines = [
      company.addressLine1,
      company.addressLine2,
      [company.city, company.state, company.postalCode].filter(Boolean).join(', '),
      company.country,
    ].filter((line): line is string => Boolean(line));

    const clientAddressLines = [
      client.addressLine1,
      client.addressLine2,
      [client.city, client.state, client.postalCode].filter(Boolean).join(', '),
      client.country,
    ].filter((line): line is string => Boolean(line));

    const pdf = (
      <CommercialDocument
        title="Facture proforma"
        number={proforma.number}
        issuer={{
          name: company.name,
          addressLines,
          taxId: company.taxId,
          email: company.email,
          registrationNumber: company.registrationNumber,
          nif: company.nif,
          articleNumber: company.articleNumber,
          activity: company.activity,
          managerName: company.managerName,
          logoUrl: company.logoUrl,
          documentReferenceCode: company.documentReferenceCode,
          city: company.city,
        }}
        recipient={{
          name: client.name,
          addressLines: clientAddressLines,
          taxId: client.taxId,
          email: client.email,
          registrationNumber: client.registrationNumber,
          nif: client.nif,
          nis: client.nis,
          articleNumber: client.articleNumber,
        }}
        issueDate={proforma.issueDate}
        meta={[
          ...(proforma.validUntil
            ? [{ label: 'Validité jusqu’au', value: proforma.validUntil.toLocaleDateString('fr-FR') }]
            : []),
          { label: 'Statut', value: translateStatus(proforma.status) },
        ]}
        items={items}
        currency={proforma.currency}
        subtotal={proforma.subtotal}
        discountTotal={proforma.discountTotal}
        taxTotal={proforma.taxTotal}
        total={proforma.total}
        notes={proforma.notes}
        terms={proforma.terms}
        footerNote={`Facture proforma ${proforma.number} · Document non contractuel`}
      />
    );

    return renderPdfResponse(pdf, `${proforma.number}.pdf`, { download: false });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: error.isExposable ? error.message : 'Failed to render.' },
        { status: error.statusCode },
      );
    }

    logger.error('Failed to render proforma invoice PDF', { error });
    return NextResponse.json({ error: 'Failed to render the document.' }, { status: 500 });
  }
}
