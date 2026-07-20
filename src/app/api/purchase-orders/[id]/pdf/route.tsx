import { NextResponse } from 'next/server';

import { can, requireTenantSession } from '@/lib/auth/session';
import { isAppError } from '@/lib/errors';
import { CommercialDocument, type DocumentLineItem } from '@/lib/pdf/document-template';
import { translateStatus } from '@/lib/pdf/french-labels';
import { renderPdfResponse } from '@/lib/pdf';
import { logger } from '@/lib/logger';
import * as companies from '@/modules/companies/companies.service';
import * as purchaseOrders from '@/modules/purchase-orders/purchase-orders.service';

/**
 * Renders a purchase order as a PDF, on demand — nothing is stored. Same
 * session-authed, render-fresh pattern as the Quotes/Proforma/Invoices PDF
 * routes. The "recipient" here is the supplier, not a client — we are
 * sending them the order, not billing them.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/purchase-orders/[id]/pdf'>,
): Promise<Response> {
  try {
    const { companyId } = await requireTenantSession();

    if (!(await can('purchase_orders:read'))) {
      return NextResponse.json(
        { error: 'You do not have permission to view this purchase order.' },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    const [purchaseOrder, company] = await Promise.all([
      purchaseOrders.getPurchaseOrder(companyId, id),
      companies.getCompany(companyId),
    ]);
    const supplier = await purchaseOrders.getSupplierDetail(companyId, purchaseOrder.supplierId);

    const items: DocumentLineItem[] = purchaseOrder.items.map((item) => ({
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

    const supplierAddressLines = [
      supplier.addressLine1,
      supplier.addressLine2,
      [supplier.city, supplier.state, supplier.postalCode].filter(Boolean).join(', '),
      supplier.country,
    ].filter((line): line is string => Boolean(line));

    const pdf = (
      <CommercialDocument
        title="Bon de commande"
        number={purchaseOrder.number}
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
          name: supplier.name,
          addressLines: supplierAddressLines,
          taxId: supplier.taxId,
          email: supplier.email,
        }}
        recipientLabel="Fournisseur"
        issueDate={purchaseOrder.issueDate}
        meta={[
          ...(purchaseOrder.expectedDate
            ? [{ label: 'Livraison prévue', value: purchaseOrder.expectedDate.toLocaleDateString('fr-FR') }]
            : []),
          { label: 'Statut', value: translateStatus(purchaseOrder.status) },
        ]}
        items={items}
        currency={purchaseOrder.currency}
        subtotal={purchaseOrder.subtotal}
        discountTotal={purchaseOrder.discountTotal}
        taxTotal={purchaseOrder.taxTotal}
        total={purchaseOrder.total}
        notes={purchaseOrder.notes}
        terms={purchaseOrder.terms}
        footerNote={
          purchaseOrder.status === 'cancelled'
            ? `Bon de commande ${purchaseOrder.number} · ANNULÉ`
            : `Bon de commande ${purchaseOrder.number}`
        }
      />
    );

    return renderPdfResponse(pdf, `${purchaseOrder.number}.pdf`, { download: false });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: error.isExposable ? error.message : 'Failed to render.' },
        { status: error.statusCode },
      );
    }

    logger.error('Failed to render purchase order PDF', { error });
    return NextResponse.json({ error: 'Failed to render the document.' }, { status: 500 });
  }
}
