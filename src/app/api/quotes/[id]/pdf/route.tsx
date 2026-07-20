import { NextResponse } from 'next/server';

import { can, requireTenantSession } from '@/lib/auth/session';
import * as companies from '@/modules/companies/companies.service';
import { CommercialDocument, type DocumentLineItem } from '@/lib/pdf/document-template';
import { translateStatus } from '@/lib/pdf/french-labels';
import { renderPdfResponse } from '@/lib/pdf';
import * as clients from '@/modules/clients/clients.service';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as quotes from '@/modules/quotes/quotes.service';

/**
 * Renders a quote as a PDF, on demand — nothing is stored. Auth is a normal
 * session check (not a signed URL) because this is a same-origin app page
 * link, not a link handed to a client outside a session.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/quotes/[id]/pdf'>,
): Promise<Response> {
  try {
    const { companyId } = await requireTenantSession();

    if (!(await can('quotes:read'))) {
      return NextResponse.json({ error: 'You do not have permission to view this quote.' }, { status: 403 });
    }

    const { id } = await context.params;

    const [quote, company] = await Promise.all([
      quotes.getQuote(companyId, id),
      companies.getCompany(companyId),
    ]);
    const client = await clients.getClient(companyId, quote.clientId);

    const items: DocumentLineItem[] = quote.items.map((item) => ({
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
        title="Devis"
        number={quote.number}
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
        issueDate={quote.issueDate}
        meta={[
          ...(quote.validUntil
            ? [{ label: 'Validité jusqu’au', value: quote.validUntil.toLocaleDateString('fr-FR') }]
            : []),
          { label: 'Statut', value: translateStatus(quote.status) },
        ]}
        items={items}
        currency={quote.currency}
        subtotal={quote.subtotal}
        discountTotal={quote.discountTotal}
        taxTotal={quote.taxTotal}
        total={quote.total}
        notes={quote.notes}
        terms={quote.terms}
      />
    );

    return renderPdfResponse(pdf, `${quote.number}.pdf`, { download: false });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: error.isExposable ? error.message : 'Failed to render.' },
        { status: error.statusCode },
      );
    }

    logger.error('Failed to render quote PDF', { error });
    return NextResponse.json({ error: 'Failed to render the document.' }, { status: 500 });
  }
}
