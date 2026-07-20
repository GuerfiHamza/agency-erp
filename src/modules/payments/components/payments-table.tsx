'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownLeft, ArrowUpRight, Download, MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DataTable, DataTableColumnHeader, useTableParams } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/states';

import {
  deletePaymentAction,
  exportPaymentsAction,
  markPaymentCompletedAction,
  markPaymentFailedAction,
  refundPaymentAction,
} from '../payments.actions';
import type { PayableInvoiceOption, PayablePurchaseOrderOption } from '../payments.repository';
import type { PaymentListItem } from '../payments.service';
import { PAYMENT_DIRECTIONS, type PAYMENT_STATUSES } from '../payments.validation';

import { PaymentEditDialog } from './payment-edit-dialog';
import { PaymentFormDialog } from './payment-form-dialog';

interface Props {
  payments: PaymentListItem[];
  totalItems: number;
  payableInvoices: PayableInvoiceOption[];
  payablePurchaseOrders: PayablePurchaseOrderOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExport: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; payment: PaymentListItem }
  | { kind: 'delete'; payment: PaymentListItem }
  | { kind: 'fail'; payment: PaymentListItem }
  | { kind: 'refund'; payment: PaymentListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const moneyFormatter = (currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });

const STATUS_VARIANT: Record<
  (typeof PAYMENT_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'secondary',
  completed: 'default',
  failed: 'destructive',
  refunded: 'outline',
};

export function PaymentsTable({
  payments,
  totalItems,
  payableInvoices,
  payablePurchaseOrders,
  canCreate,
  canUpdate,
  canDelete,
  canExport,
}: Props) {
  const { params, hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [isExporting, startExport] = useTransition();
  const [isCompleting, startComplete] = useTransition();

  const close = () => setDialog({ kind: 'none' });

  function onExport() {
    startExport(async () => {
      const result = await exportPaymentsAction({
        q: params.q,
        sort: params.sort,
        order: params.order,
        status: params.status,
      });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.data.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  function onComplete(payment: PaymentListItem) {
    startComplete(async () => {
      const result = await markPaymentCompletedAction({ paymentId: payment.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Payment marked completed.');
    });
  }

  const columns = useMemo<ColumnDef<PaymentListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'direction',
        header: () => <DataTableColumnHeader columnId="direction" title="Direction" />,
        cell: ({ row }) => {
          const isInbound = row.original.direction === 'inbound';
          return (
            <span className="inline-flex items-center gap-1.5 text-sm">
              {isInbound ? (
                <ArrowDownLeft className="size-3.5 text-emerald-500" aria-hidden />
              ) : (
                <ArrowUpRight className="size-3.5 text-amber-500" aria-hidden />
              )}
              {isInbound ? 'Inbound' : 'Outbound'}
            </span>
          );
        },
      },
      {
        id: 'document',
        header: 'Document',
        cell: ({ row }) => {
          const isInbound = row.original.direction === 'inbound';
          const number = isInbound ? row.original.invoiceNumber : row.original.purchaseOrderNumber;
          const counterparty = isInbound ? row.original.clientName : row.original.supplierName;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">{number ?? '—'}</p>
              <p className="truncate text-xs text-muted-foreground">{counterparty ?? '—'}</p>
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: () => <DataTableColumnHeader columnId="status" title="Status" />,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'amount',
        header: () => <DataTableColumnHeader columnId="amount" title="Amount" />,
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {moneyFormatter(row.original.currency).format(Number(row.original.amount))}
          </span>
        ),
      },
      {
        accessorKey: 'paidAt',
        header: () => <DataTableColumnHeader columnId="paidAt" title="Paid at" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{dateFormatter.format(row.original.paidAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const payment = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for this payment</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && payment.status === 'pending' && (
                    <DropdownMenuItem disabled={isCompleting} onSelect={() => onComplete(payment)}>
                      Mark completed
                    </DropdownMenuItem>
                  )}
                  {canUpdate && payment.status === 'pending' && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'fail', payment })}>
                      Mark failed
                    </DropdownMenuItem>
                  )}
                  {canUpdate && payment.status === 'completed' && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'refund', payment })}>
                      Refund
                    </DropdownMenuItem>
                  )}
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', payment })}>
                      Edit details
                    </DropdownMenuItem>
                  )}
                  {canDelete && payment.status !== 'completed' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', payment })}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canDelete, canUpdate, isCompleting],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={payments}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search reference, document, or counterparty..."
        statusOptions={PAYMENT_DIRECTIONS.map((value) => ({
          label: value === 'inbound' ? 'Inbound' : 'Outbound',
          value,
        }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          <>
            {canExport && (
              <Button variant="outline" size="sm" onClick={onExport} disabled={isExporting}>
                <Download aria-hidden />
                Export
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
                <Plus aria-hidden />
                Record payment
              </Button>
            )}
          </>
        }
        emptyState={
          <EmptyState
            title="No payments yet"
            description="Record money received from a client or paid to a supplier."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  Record payment
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <PaymentFormDialog
          payableInvoices={payableInvoices}
          payablePurchaseOrders={payablePurchaseOrders}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && <PaymentEditDialog payment={dialog.payment} open onOpenChange={close} />}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title="Delete this payment?"
          description="The payment is removed from your lists."
          confirmLabel="Delete"
          successMessage="Payment deleted."
          onConfirm={() => deletePaymentAction({ paymentId: dialog.payment.id })}
        />
      )}

      {dialog.kind === 'fail' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title="Mark this payment failed?"
          description="It never cleared and is kept on record as failed."
          confirmLabel="Mark failed"
          successMessage="Payment marked failed."
          onConfirm={() => markPaymentFailedAction({ paymentId: dialog.payment.id })}
        />
      )}

      {dialog.kind === 'refund' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title="Refund this payment?"
          description="Reverses its effect on the invoice's paid amount. This cannot be undone."
          confirmLabel="Refund"
          successMessage="Payment refunded."
          onConfirm={() => refundPaymentAction({ paymentId: dialog.payment.id })}
        />
      )}
    </>
  );
}
