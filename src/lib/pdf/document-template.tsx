import { Document, Image, Page, Text, View } from '@react-pdf/renderer';

import { amountToFrenchWords } from './amount-to-words';
import { formatDocumentDate, formatMoney, formatPercent, formatQuantity } from './format';
import { pdfStyles } from './theme';

/**
 * The shared template for every commercial document.
 *
 * Quotes, proforma invoices, invoices, and purchase orders are the same object
 * on paper — a header, a party, line items, totals — differing only in title,
 * dates, and wording. One template with a `title` beats four near-identical
 * files that drift apart the first time a tax rule changes.
 *
 * The layout follows a French-language Algerian invoice convention (RC/NIF/
 * Article legal identifiers, a "Réf N°" line, the total spelled out in words)
 * rather than the generic English layout this template started as — every
 * label here is French on purpose, not just the ones that happened to change.
 * Visually it favours soft tinted panels and light rules over hard-ruled
 * boxes — a deliberate choice after an early bordered-table pass read as too
 * heavy (see the theme file's own comments for the specific reasoning).
 *
 * Phase 5 renders this per module; nothing here knows what an invoice is.
 */

export interface DocumentParty {
  name: string;
  addressLines?: string[];
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Legal identifiers below are issuer-only in practice — a client/supplier party never sets them. */
  registrationNumber?: string | null;
  nif?: string | null;
  articleNumber?: string | null;
  activity?: string | null;
  managerName?: string | null;
  /** Issuer-only: printed top-left, and folded into the "Réf N°" line. */
  logoUrl?: string | null;
  documentReferenceCode?: string | null;
  /** Issuer-only: "{city}, le {date}" above the info box. */
  city?: string | null;
}

export interface DocumentLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
  lineTotal: string;
}

export interface DocumentMetaField {
  label: string;
  value: string;
}

export interface CommercialDocumentProps {
  /** "Facture", "Devis", "Bon de commande", "Facture proforma" — already French. */
  title: string;
  number: string;
  issuer: DocumentParty;
  recipient: DocumentParty;
  /** "Facturé à" by default; a purchase order's recipient is a supplier, not a billed client. */
  recipientLabel?: string;
  /** The date printed next to the issuer's city and folded into the reference year. */
  issueDate: Date;
  /** Due date, validity, status — whatever module-specific field the fixed layout has no slot for. */
  meta: DocumentMetaField[];
  items: DocumentLineItem[];
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  /** Shown under the totals. */
  notes?: string | null;
  terms?: string | null;
  /** Printed in the footer, e.g. "Payée" or "Brouillon — document non contractuel". */
  footerNote?: string;
  locale?: string;
}

function LegalLines({ party }: { party: DocumentParty }) {
  return (
    <>
      {party.activity && <Text>Activité : {party.activity}</Text>}
      {party.registrationNumber && <Text>N° Immatriculation : {party.registrationNumber}</Text>}
      {party.nif && <Text>NIF : {party.nif}</Text>}
      {party.articleNumber && <Text>N° Article : {party.articleNumber}</Text>}
      {!party.nif && party.taxId && <Text>NIF : {party.taxId}</Text>}
    </>
  );
}

function InfoColumn({ label, party }: { label: string; party: DocumentParty }) {
  return (
    <View style={pdfStyles.infoBoxColumn}>
      <Text style={pdfStyles.label}>{label}</Text>
      <Text style={pdfStyles.strong}>{party.name}</Text>
      {party.managerName && <Text>{party.managerName}</Text>}
      {party.addressLines?.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
      <LegalLines party={party} />
      {party.email && <Text>{party.email}</Text>}
      {party.phone && <Text>{party.phone}</Text>}
    </View>
  );
}

export function CommercialDocument({
  title,
  number,
  issuer,
  recipient,
  recipientLabel = 'Facturé à',
  issueDate,
  meta,
  items,
  currency,
  subtotal,
  discountTotal,
  taxTotal,
  total,
  notes,
  terms,
  footerNote,
  locale = 'fr-FR',
}: CommercialDocumentProps) {
  const money = (value: string) => formatMoney(value, currency, locale);
  const issueDateLabel = formatDocumentDate(issueDate, locale);
  const yearSuffix = String(issueDate.getFullYear()).slice(-2);
  const reference = issuer.documentReferenceCode
    ? `Réf N°${issuer.documentReferenceCode}/${number}/${yearSuffix}`
    : `Réf N°${number}`;
  const wordsAmount = amountToFrenchWords(total, currency);

  return (
    <Document title={`${title} ${number}`} author={issuer.name}>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          {issuer.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop.
            <Image src={issuer.logoUrl} style={pdfStyles.logo} />
          ) : (
            <View />
          )}
          <View style={pdfStyles.headerRight}>
            <Text style={pdfStyles.headerRightLine}>
              {issuer.city ? `${issuer.city}, le ${issueDateLabel}` : issueDateLabel}
            </Text>
            <Text style={pdfStyles.headerRightLine}>{reference}</Text>
          </View>
        </View>

        <View style={pdfStyles.infoBox}>
          <InfoColumn label="Émetteur" party={issuer} />
          <InfoColumn label={recipientLabel} party={recipient} />
        </View>

        <Text style={pdfStyles.documentTitleCentered}>
          {title} N° {number}
        </Text>

        {/* A plain caption line, not a second boxed table — "Statut : Envoyé   ·   Validité : ..." */}
        {meta.length > 0 && (
          <Text style={pdfStyles.metaLine}>
            {meta.map((field, index) => (
              <Text key={field.label}>
                {index > 0 ? '   ·   ' : ''}
                {field.label} : <Text style={pdfStyles.metaLineValue}>{field.value}</Text>
              </Text>
            ))}
          </Text>
        )}

        <View style={pdfStyles.tableHeader}>
          <Text style={[pdfStyles.cellCenter, pdfStyles.tableHeaderLabel, { flex: 0.6 }]}>N°</Text>
          <Text style={[pdfStyles.tableHeaderLabel, { flex: 4 }]}>Désignation</Text>
          <Text style={[pdfStyles.cellCenter, pdfStyles.tableHeaderLabel, { flex: 1 }]}>Qté</Text>
          <Text style={[pdfStyles.cellRight, pdfStyles.tableHeaderLabel, { flex: 1.4 }]}>Prix unitaire</Text>
          <Text style={[pdfStyles.cellCenter, pdfStyles.tableHeaderLabel, { flex: 1 }]}>TVA</Text>
          <Text style={[pdfStyles.cellRight, pdfStyles.tableHeaderLabel, { flex: 1.6 }]}>Montant HT</Text>
        </View>

        {items.map((item, index) => (
          // Line items have no stable id here and their order *is* their
          // identity on a printed page, so the index is the honest key.
          <View
            key={`${item.description}-${index}`}
            style={[pdfStyles.tableRow, index % 2 === 1 ? pdfStyles.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={[pdfStyles.cellCenter, { flex: 0.6 }]}>{index + 1}</Text>
            <Text style={{ flex: 4 }}>{item.description}</Text>
            <Text style={[pdfStyles.cellCenter, { flex: 1 }]}>{formatQuantity(item.quantity)}</Text>
            <Text style={[pdfStyles.cellRight, { flex: 1.4 }]}>{money(item.unitPrice)}</Text>
            <Text style={[pdfStyles.cellCenter, { flex: 1 }]}>{formatPercent(item.taxRate)}</Text>
            <Text style={[pdfStyles.cellRight, { flex: 1.6 }]}>{money(item.lineTotal)}</Text>
          </View>
        ))}

        <View style={pdfStyles.totals}>
          <View style={pdfStyles.totalsRow}>
            <Text>MONTANT TOTAL EN HT</Text>
            <Text>{money(subtotal)}</Text>
          </View>
          {/* Zero rows are hidden: a "Remise : 0,00" line invites the question
              "quelle remise ?" on a document sent to a client. */}
          {Number(discountTotal) !== 0 && (
            <View style={pdfStyles.totalsRow}>
              <Text>REMISE</Text>
              <Text>-{money(discountTotal)}</Text>
            </View>
          )}
          {Number(taxTotal) !== 0 && (
            <View style={pdfStyles.totalsRow}>
              <Text>TVA</Text>
              <Text>{money(taxTotal)}</Text>
            </View>
          )}
          <View style={pdfStyles.grandTotal}>
            <Text>MONTANT TOTAL EN TTC</Text>
            <Text>{money(total)}</Text>
          </View>
        </View>

        {/* Only ever printed for DZD — see `amountToFrenchWords`. */}
        {wordsAmount && (
          <View style={pdfStyles.amountWords}>
            <Text>
              <Text style={pdfStyles.amountWordsPrefix}>Somme arrêtée à </Text>
              <Text style={pdfStyles.amountWordsValue}>{wordsAmount}</Text>
            </Text>
          </View>
        )}

        {notes && (
          <View style={pdfStyles.notes}>
            <Text style={pdfStyles.label}>Notes</Text>
            <Text>{notes}</Text>
          </View>
        )}

        {terms && (
          <View style={pdfStyles.notes}>
            <Text style={pdfStyles.label}>Conditions</Text>
            <Text>{terms}</Text>
          </View>
        )}

        <View style={pdfStyles.signature}>
          <Text style={pdfStyles.signatureLabel}>Le prestataire :</Text>
        </View>

        <View style={pdfStyles.footer} fixed>
          <Text>{footerNote ?? `${title} ${number} · ${issueDateLabel}`}</Text>
          {/* `fixed` + render callback: evaluated per page, so multi-page
              documents number correctly instead of repeating "1 sur 1". */}
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} sur ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
