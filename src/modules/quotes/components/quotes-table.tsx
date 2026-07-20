'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileText, MoreHorizontal, Plus, Receipt, ReceiptText, Send } from 'lucide-react';
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
import { CreateInvoiceFromSourceDialog } from '@/modules/invoices/components/create-invoice-from-source-dialog';
import { createProformaFromQuoteAction } from '@/modules/proforma-invoices/proforma-invoices.actions';

import { deleteQuoteAction, exportQuotesAction, getQuoteAction, sendQuoteAction } from '../quotes.actions';
import type { QuoteListItem, QuoteWithItems } from '../quotes.service';
import { QUOTE_STATUSES } from '../quotes.validation';

import { QuoteFormDialog } from './quote-form-dialog';

interface Props {
  quotes: QuoteListItem[];
  totalItems: number;
  clientOptions: { id: string; name: string }[];
  opportunityOptions: { id: string; name: string }[];
  projectOptions: { id: string; name: string }[];
  contactsByClient: Record<string, { id: string; name: string }[]>;
  defaultCurrency: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSend: boolean;
  canExport: boolean;
  canCreateProforma: boolean;
  canCreateInvoice: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; quote: QuoteWithItems }
  | { kind: 'delete'; quote: QuoteListItem }
  | { kind: 'createInvoice'; quote: QuoteListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const moneyFormatter = (currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });

const STATUS_VARIANT: Record<
  (typeof QUOTE_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  sent: 'default',
  accepted: 'default',
  rejected: 'destructive',
  expired: 'outline',
  cancelled: 'outline',
};

export function QuotesTable({
  quotes,
  totalItems,
  clientOptions,
  opportunityOptions,
  projectOptions,
  contactsByClient,
  defaultCurrency,
  canCreate,
  canUpdate,
  canDelete,
  canSend,
  canExport,
  canCreateProforma,
  canCreateInvoice,
}: Props) {
  const { params, hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [isExporting, startExport] = useTransition();
  const [isSending, startSend] = useTransition();
  const [isOpeningEdit, startOpenEdit] = useTransition();
  const [isCreatingProforma, startCreateProforma] = useTransition();

  const close = () => setDialog({ kind: 'none' });

  function onExport() {
    startExport(async () => {
      const result = await exportQuotesAction({
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

  function onSend(quote: QuoteListItem) {
    startSend(async () => {
      const result = await sendQuoteAction({ quoteId: quote.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Quote marked as sent.');
    });
  }

  function onEdit(quote: QuoteListItem) {
    startOpenEdit(async () => {
      const result = await getQuoteAction({ quoteId: quote.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setDialog({ kind: 'edit', quote: result.data });
    });
  }

  function onCreateProforma(quote: QuoteListItem) {
    startCreateProforma(async () => {
      const result = await createProformaFromQuoteAction({ quoteId: quote.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Proforma invoice created. Find it on the Proforma Invoices page.');
    });
  }

  const columns = useMemo<ColumnDef<QuoteListItem, unknown>[]>(
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
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'issueDate',
        header: () => <DataTableColumnHeader columnId="issueDate" title="Issued" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {dateFormatter.format(row.original.issueDate)}
          </span>
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
          const quote = row.original;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {quote.number}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                      <FileText aria-hidden />
                      View PDF
                    </a>
                  </DropdownMenuItem>
                  {canSend && quote.status === 'draft' && (
                    <DropdownMenuItem disabled={isSending} onSelect={() => onSend(quote)}>
                      <Send aria-hidden />
                      Mark as sent
                    </DropdownMenuItem>
                  )}
                  {canCreateProforma && (
                    <DropdownMenuItem disabled={isCreatingProforma} onSelect={() => onCreateProforma(quote)}>
                      <Receipt aria-hidden />
                      Create proforma
                    </DropdownMenuItem>
                  )}
                  {canCreateInvoice && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'createInvoice', quote })}>
                      <ReceiptText aria-hidden />
                      Create invoice
                    </DropdownMenuItem>
                  )}
                  {canUpdate && (
                    <DropdownMenuItem disabled={isOpeningEdit} onSelect={() => onEdit(quote)}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', quote })}
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
    [
      canCreateInvoice,
      canCreateProforma,
      canDelete,
      canSend,
      canUpdate,
      isCreatingProforma,
      isOpeningEdit,
      isSending,
    ],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={quotes}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search number or client..."
        statusOptions={QUOTE_STATUSES.map((status) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
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
                New quote
              </Button>
            )}
          </>
        }
        emptyState={
          <EmptyState
            title="No quotes yet"
            description="Draft your first quote for a client."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New quote
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <QuoteFormDialog
          clientOptions={clientOptions}
          opportunityOptions={opportunityOptions}
          projectOptions={projectOptions}
          contactsByClient={contactsByClient}
          defaultCurrency={defaultCurrency}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <QuoteFormDialog
          quote={dialog.quote}
          clientOptions={clientOptions}
          opportunityOptions={opportunityOptions}
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
          title={`Delete ${dialog.quote.number}?`}
          description="The quote is removed from your lists."
          confirmLabel="Delete"
          successMessage="Quote deleted."
          onConfirm={() => deleteQuoteAction({ quoteId: dialog.quote.id })}
        />
      )}

      {dialog.kind === 'createInvoice' && (
        <CreateInvoiceFromSourceDialog
          sourceKind="quote"
          sourceId={dialog.quote.id}
          sourceNumber={dialog.quote.number}
          open
          onOpenChange={close}
        />
      )}
    </>
  );
}
