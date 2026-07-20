import { NextResponse } from 'next/server';

import { can, requireTenantSession } from '@/lib/auth/session';
import * as clients from '@/modules/clients/clients.service';
import * as companies from '@/modules/companies/companies.service';
import { isAppError } from '@/lib/errors';
import { CommercialDocument, type DocumentLineItem } from '@/lib/pdf/document-template';
import { translateStatus } from '@/lib/pdf/french-labels';
import { renderPdfResponse } from '@/lib/pdf';
import { logger } from '@/lib/logger';
import * as invoices from '@/modules/invoices/invoices.service';

/**
 * Renders an invoice as a PDF, on demand — nothing is stored. Same
 * session-authed, render-fresh pattern as the Quotes/Proforma PDF routes.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/invoices/[id]/pdf'>,
): Promise<Response> {
  try {
    const { companyId } = await requireTenantSession();

    if (!(await can('invoices:read'))) {
      return NextResponse.json(
        { error: 'You do not have permission to view this invoice.' },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    const [invoice, company] = await Promise.all([
      invoices.getInvoice(companyId, id),
      companies.getCompany(companyId),
    ]);
    const client = await clients.getClient(companyId, invoice.clientId);

    const items: DocumentLineItem[] = invoice.items.map((item) => ({
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
        title="Facture"
        number={invoice.number}
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
        }}
        issueDate={invoice.issueDate}
        meta={[
          { label: 'Échéance', value: invoice.dueDate.toLocaleDateString('fr-FR') },
          { label: 'Statut', value: translateStatus(invoice.status) },
        ]}
        items={items}
        currency={invoice.currency}
        subtotal={invoice.subtotal}
        discountTotal={invoice.discountTotal}
        taxTotal={invoice.taxTotal}
        total={invoice.total}
        notes={invoice.notes}
        terms={invoice.terms}
        footerNote={
          invoice.status === 'void'
            ? `Facture ${invoice.number} · ANNULÉE`
            : `Facture ${invoice.number} · Échéance ${invoice.dueDate.toLocaleDateString('fr-FR')}`
        }
      />
    );

    return renderPdfResponse(pdf, `${invoice.number}.pdf`, { download: false });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: error.isExposable ? error.message : 'Failed to render.' },
        { status: error.statusCode },
      );
    }

    logger.error('Failed to render invoice PDF', { error });
    return NextResponse.json({ error: 'Failed to render the document.' }, { status: 500 });
  }
}
