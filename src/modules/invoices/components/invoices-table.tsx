'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Download, FileText, MoreHorizontal, Plus, Send } from 'lucide-react';
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
  cancelInvoiceAction,
  deleteInvoiceAction,
  exportInvoicesAction,
  getInvoiceAction,
  sendInvoiceAction,
  voidInvoiceAction,
} from '../invoices.actions';
import type { InvoiceListItem, InvoiceWithItems } from '../invoices.service';
import { INVOICE_STATUSES } from '../invoices.validation';

import { InvoiceFormDialog } from './invoice-form-dialog';

interface Props {
  invoices: InvoiceListItem[];
  totalItems: number;
  clientOptions: { id: string; name: string; paymentTermsDays: number | null }[];
  projectOptions: { id: string; name: string }[];
  contactsByClient: Record<string, { id: string; name: string }[]>;
  defaultCurrency: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSend: boolean;
  canExport: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; invoice: InvoiceWithItems }
  | { kind: 'delete'; invoice: InvoiceListItem }
  | { kind: 'void'; invoice: InvoiceListItem }
  | { kind: 'cancel'; invoice: InvoiceListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const moneyFormatter = (currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });

const STATUS_VARIANT: Record<
  (typeof INVOICE_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  sent: 'default',
  partially_paid: 'default',
  paid: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
  void: 'outline',
};

export function InvoicesTable({
  invoices,
  totalItems,
  clientOptions,
  projectOptions,
  contactsByClient,
  defaultCurrency,
  canCreate,
  canUpdate,
  canDelete,
  canSend,
  canExport,
}: Props) {
  const { params, hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [isExporting, startExport] = useTransition();
  const [isSending, startSend] = useTransition();
  const [isOpeningEdit, startOpenEdit] = useTransition();

  const close = () => setDialog({ kind: 'none' });

  function onExport() {
    startExport(async () => {
      const result = await exportInvoicesAction({
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

  function onSend(invoice: InvoiceListItem) {
    startSend(async () => {
      const result = await sendInvoiceAction({ invoiceId: invoice.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Invoice sent.');
    });
  }

  function onEdit(invoice: InvoiceListItem) {
    startOpenEdit(async () => {
      const result = await getInvoiceAction({ invoiceId: invoice.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setDialog({ kind: 'edit', invoice: result.data });
    });
  }

  const columns = useMemo<ColumnDef<InvoiceListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'number',
        header: () => <DataTableColumnHeader columnId="number" title="Number" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.number}</p>
            {row.original.title && (
              <p className="truncate text-xs text-muted-foreground">{row.original.title}</p>
            )}
          </div>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        cell: ({ row }) => row.original.clientName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'status',
        header: () => <DataTableColumnHeader columnId="status" title="Status" />,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
            {row.original.status.replace('_', ' ')}
          </Badge>
        ),
      },
      {
        accessorKey: 'dueDate',
        header: () => <DataTableColumnHeader columnId="dueDate" title="Due" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{dateFormatter.format(row.original.dueDate)}</span>
        ),
      },
      {
        accessorKey: 'total',
        header: () => <DataTableColumnHeader columnId="total" title="Total" />,
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {moneyFormatter(row.original.currency).format(Number(row.original.total))}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const invoice = row.original;
          const isDraft = invoice.status === 'draft';
          const canVoid = ['sent', 'partially_paid', 'overdue'].includes(invoice.status);

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {invoice.number}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                      <FileText aria-hidden />
                      View PDF
                    </a>
                  </DropdownMenuItem>
                  {canSend && isDraft && (
                    <DropdownMenuItem disabled={isSending} onSelect={() => onSend(invoice)}>
                      <Send aria-hidden />
                      Send
                    </DropdownMenuItem>
                  )}
                  {canUpdate && isDraft && (
                    <DropdownMenuItem disabled={isOpeningEdit} onSelect={() => onEdit(invoice)}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canUpdate && canVoid && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'void', invoice })}>
                      <Ban aria-hidden />
                      Void
                    </DropdownMenuItem>
                  )}
                  {canUpdate && isDraft && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'cancel', invoice })}>
                      Cancel
                    </DropdownMenuItem>
                  )}
                  {canDelete && (isDraft || invoice.status === 'cancelled') && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', invoice })}
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
    [canDelete, canSend, canUpdate, isOpeningEdit, isSending],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={invoices}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search number or client..."
        statusOptions={INVOICE_STATUSES.map((status) => ({
          label: status.replace('_', ' ').replace(/^./, (char) => char.toUpperCase()),
          value: status,
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
                New invoice
              </Button>
            )}
          </>
        }
        emptyState={
          <EmptyState
            title="No invoices yet"
            description="Bill a client directly, or convert a quote or proforma invoice."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New invoice
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <InvoiceFormDialog
          clientOptions={clientOptions}
          projectOptions={projectOptions}
          contactsByClient={contactsByClient}
          defaultCurrency={defaultCurrency}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <InvoiceFormDialog
          invoice={dialog.invoice}
          clientOptions={clientOptions}
          projectOptions={projectOptions}
          contactsByClient={contactsByClient}
          defaultCurrency={defaultCurrency}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.invoice.number}?`}
          description="The invoice is removed from your lists."
          confirmLabel="Delete"
          successMessage="Invoice deleted."
          onConfirm={() => deleteInvoiceAction({ invoiceId: dialog.invoice.id })}
        />
      )}

      {dialog.kind === 'void' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Void ${dialog.invoice.number}?`}
          description="The invoice stays on record, marked void. This cannot be undone."
          confirmLabel="Void"
          successMessage="Invoice voided."
          onConfirm={() => voidInvoiceAction({ invoiceId: dialog.invoice.id })}
        />
      )}

      {dialog.kind === 'cancel' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={`Cancel ${dialog.invoice.number}?`}
          description="The draft is marked cancelled and kept for reference, not deleted."
          confirmLabel="Cancel invoice"
          successMessage="Invoice cancelled."
          onConfirm={() => cancelInvoiceAction({ invoiceId: dialog.invoice.id })}
        />
      )}
    </>
  );
}
