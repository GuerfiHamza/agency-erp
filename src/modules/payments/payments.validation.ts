import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Payment input schemas.
 *
 * A payment settles exactly one document — an invoice when `direction` is
 * `inbound`, a purchase order when `outbound` — never both. The form only
 * ever collects a single `documentId`; the service resolves which table it
 * belongs to from `direction` and derives `currency`/`clientId`/`supplierId`
 * from the document itself. None of those three are form fields: trusting a
 * posted `clientId` that doesn't match the invoice's real client would be a
 * silent data-integrity hole, the same class of bug the tenant guards on
 * every other document module exist to prevent.
 *
 * `status` here is deliberately narrower than the full `payments.status`
 * enum: a payment can only ever be *created* as `pending` or `completed`
 * (the schema's own default). `failed` and `refunded` are unreachable except
 * through the dedicated `markPaymentFailedAction`/`refundPaymentAction`
 * transitions — you don't create a payment that arrives pre-refunded.
 */

const optionalText = (max: number = DB_LIMITS.shortText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

/** Free-text on the schema (not `numeric`), so validation stays loose — informational, never used in arithmetic here. */
const optionalExchangeRate = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, { error: 'Enter a positive number, e.g. 1.0842.' })
  .or(z.literal(''))
  .transform((value) => value || null)
  .nullable();

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, { error: 'Enter an amount like 100 or 100.00.' })
  .refine((value) => Number(value) > 0, { error: 'Enter an amount greater than zero.' });

export const PAYMENT_DIRECTIONS = ['inbound', 'outbound'] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];

export const PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'credit_card',
  'debit_card',
  'check',
  'paypal',
  'stripe',
  'other',
] as const;

/** The full column enum — used for display and the delete/refund/fail guards, not all of it is creatable. */
export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Statuses a payment may be *created* with. */
export const CREATABLE_PAYMENT_STATUSES = ['pending', 'completed'] as const;

export const paymentFormSchema = z.object({
  direction: z.enum(PAYMENT_DIRECTIONS),
  documentId: z.uuid({ error: 'Choose what this payment settles.' }),
  status: z.enum(CREATABLE_PAYMENT_STATUSES),
  method: z.enum(PAYMENT_METHODS),

  amount: moneyString,
  exchangeRate: optionalExchangeRate,

  paidAt: z.coerce.date({ error: 'Enter a valid date.' }),

  reference: optionalText(),
  notes: optionalText(DB_LIMITS.longText),
});

export type PaymentFormValues = z.input<typeof paymentFormSchema>;
export type PaymentInput = z.output<typeof paymentFormSchema>;

/** The update form only ever touches non-financial fields — amount, direction, and the settled document are locked for life. */
export const paymentUpdateSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.coerce.date({ error: 'Enter a valid date.' }),
  reference: optionalText(),
  notes: optionalText(DB_LIMITS.longText),
});

export type PaymentUpdateFormValues = z.input<typeof paymentUpdateSchema>;
export type PaymentUpdateInput = z.output<typeof paymentUpdateSchema>;

export const PAYMENT_SORT_FIELDS = ['paidAt', 'amount', 'status', 'createdAt'] as const;

export type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

export function isPaymentSortField(value: string | null): value is PaymentSortField {
  return value !== null && (PAYMENT_SORT_FIELDS as readonly string[]).includes(value);
}

export function toPaymentStatusFilters(values: string[]): PaymentStatus[] {
  return values.filter((value): value is PaymentStatus =>
    (PAYMENT_STATUSES as readonly string[]).includes(value),
  );
}

/**
 * The DataTable toolbar has one generic filter slot (`?status=`), already
 * repurposed once by Documents for its `type` facet. Payments repurposes it
 * for `direction` — cash-in vs cash-out is the split a ledger view is
 * actually filtered by; `status` stays visible as a column badge without a
 * second URL param. Extending the shared toolbar to a real second facet is
 * infrastructure work touching every module that uses it, not a Payments
 * change.
 */
export function toPaymentDirectionFilters(values: string[]): PaymentDirection[] {
  return values.filter((value): value is PaymentDirection =>
    (PAYMENT_DIRECTIONS as readonly string[]).includes(value),
  );
}
