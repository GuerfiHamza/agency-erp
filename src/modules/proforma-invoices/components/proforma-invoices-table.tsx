'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileText, MoreHorizontal, Plus, ReceiptText, Send } from 'lucide-react';
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

import {
  deleteProformaAction,
  exportProformasAction,
  getProformaAction,
  sendProformaAction,
} from '../proforma-invoices.actions';
import type { ProformaListItem, ProformaWithItems } from '../proforma-invoices.service';
import { PROFORMA_STATUSES } from '../proforma-invoices.validation';

import { ProformaFormDialog } from './proforma-form-dialog';

interface Props {
  proformas: ProformaListItem[];
  totalItems: number;
  clientOptions: { id: string; name: string }[];
  projectOptions: { id: string; name: string }[];
  contactsByClient: Record<string, { id: string; name: string }[]>;
  defaultCurrency: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSend: boolean;
  canExport: boolean;
  canCreateInvoice: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; proforma: ProformaWithItems }
  | { kind: 'delete'; proforma: ProformaListItem }
  | { kind: 'createInvoice'; proforma: ProformaListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const moneyFormatter = (currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });

const STATUS_VARIANT: Record<
  (typeof PROFORMA_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  sent: 'default',
  accepted: 'default',
  converted: 'outline',
  cancelled: 'outline',
};

export function ProformaInvoicesTable({
  proformas,
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
  canCreateInvoice,
}: Props) {
  const { params, hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [isExporting, startExport] = useTransition();
  const [isSending, startSend] = useTransition();
  const [isOpeningEdit, startOpenEdit] = useTransition();

  const close = () => setDialog({ kind: 'none' });

  function onExport() {
    startExport(async () => {
      const result = await exportProformasAction({
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

  function onSend(proforma: ProformaListItem) {
    startSend(async () => {
      const result = await sendProformaAction({ proformaInvoiceId: proforma.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Proforma invoice marked as sent.');
    });
  }

  function onEdit(proforma: ProformaListItem) {
    startOpenEdit(async () => {
      const result = await getProformaAction({ proformaInvoiceId: proforma.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setDialog({ kind: 'edit', proforma: result.data });
    });
  }

  const columns = useMemo<ColumnDef<ProformaListItem, unknown>[]>(
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
          const proforma = row.original;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {proforma.number}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/proforma-invoices/${proforma.id}/pdf`} target="_blank" rel="noreferrer">
                      <FileText aria-hidden />
                      View PDF
                    </a>
                  </DropdownMenuItem>
                  {canSend && proforma.status === 'draft' && (
                    <DropdownMenuItem disabled={isSending} onSelect={() => onSend(proforma)}>
                      <Send aria-hidden />
                      Mark as sent
                    </DropdownMenuItem>
                  )}
                  {canCreateInvoice && proforma.status !== 'converted' && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'createInvoice', proforma })}>
                      <ReceiptText aria-hidden />
                      Create invoice
                    </DropdownMenuItem>
                  )}
                  {canUpdate && (
                    <DropdownMenuItem disabled={isOpeningEdit} onSelect={() => onEdit(proforma)}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && proforma.status !== 'converted' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', proforma })}
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
    [canCreateInvoice, canDelete, canSend, canUpdate, isOpeningEdit, isSending],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={proformas}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search number or client..."
        statusOptions={PROFORMA_STATUSES.map((status) => ({
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
                New proforma
              </Button>
            )}
          </>
        }
        emptyState={
          <EmptyState
            title="No proforma invoices yet"
            description="Draft one directly, or convert an accepted quote from the Quotes page."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New proforma
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <ProformaFormDialog
          clientOptions={clientOptions}
          projectOptions={projectOptions}
          contactsByClient={contactsByClient}
          defaultCurrency={defaultCurrency}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <ProformaFormDialog
          proforma={dialog.proforma}
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
          title={`Delete ${dialog.proforma.number}?`}
          description="The proforma invoice is removed from your lists."
          confirmLabel="Delete"
          successMessage="Proforma invoice deleted."
          onConfirm={() => deleteProformaAction({ proformaInvoiceId: dialog.proforma.id })}
        />
      )}

      {dialog.kind === 'createInvoice' && (
        <CreateInvoiceFromSourceDialog
          sourceKind="proforma"
          sourceId={dialog.proforma.id}
          sourceNumber={dialog.proforma.number}
          open
          onOpenChange={close}
        />
      )}
    </>
  );
}
