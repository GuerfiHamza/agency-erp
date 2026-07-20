'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, FileText, MoreHorizontal, Package, Plus, Send, ShieldCheck } from 'lucide-react';
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
  approvePurchaseOrderAction,
  cancelPurchaseOrderAction,
  confirmPurchaseOrderAction,
  deletePurchaseOrderAction,
  getPurchaseOrderAction,
  sendPurchaseOrderAction,
} from '../purchase-orders.actions';
import type { PurchaseOrderListItem, PurchaseOrderWithItems } from '../purchase-orders.service';
import { PURCHASE_ORDER_STATUSES } from '../purchase-orders.validation';

import { PurchaseOrderFormDialog } from './purchase-order-form-dialog';
import { ReceivePurchaseOrderDialog } from './receive-purchase-order-dialog';

interface Props {
  purchaseOrders: PurchaseOrderListItem[];
  totalItems: number;
  supplierOptions: { id: string; name: string; paymentTermsDays: number | null }[];
  projectOptions: { id: string; name: string }[];
  defaultCurrency: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSend: boolean;
  canApprove: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; purchaseOrder: PurchaseOrderWithItems }
  | { kind: 'receive'; purchaseOrder: PurchaseOrderWithItems }
  | { kind: 'delete'; purchaseOrder: PurchaseOrderListItem }
  | { kind: 'cancel'; purchaseOrder: PurchaseOrderListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const moneyFormatter = (currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });

const STATUS_VARIANT: Record<
  (typeof PURCHASE_ORDER_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  sent: 'default',
  confirmed: 'default',
  partially_received: 'default',
  received: 'default',
  cancelled: 'outline',
};

const RECEIVABLE_STATUSES = ['sent', 'confirmed', 'partially_received'];
const CANCELLABLE_STATUSES = ['draft', 'sent', 'confirmed', 'partially_received'];
const DELETABLE_STATUSES = ['draft', 'cancelled'];

export function PurchaseOrdersTable({
  purchaseOrders,
  totalItems,
  supplierOptions,
  projectOptions,
  defaultCurrency,
  canCreate,
  canUpdate,
  canDelete,
  canSend,
  canApprove,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [isSending, startSend] = useTransition();
  const [isApproving, startApprove] = useTransition();
  const [isConfirming, startConfirm] = useTransition();
  const [isOpeningDialog, startOpenDialog] = useTransition();

  const close = () => setDialog({ kind: 'none' });

  function onSend(purchaseOrder: PurchaseOrderListItem) {
    startSend(async () => {
      const result = await sendPurchaseOrderAction({ purchaseOrderId: purchaseOrder.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Purchase order sent.');
    });
  }

  function onApprove(purchaseOrder: PurchaseOrderListItem) {
    startApprove(async () => {
      const result = await approvePurchaseOrderAction({ purchaseOrderId: purchaseOrder.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Purchase order approved.');
    });
  }

  function onConfirm(purchaseOrder: PurchaseOrderListItem) {
    startConfirm(async () => {
      const result = await confirmPurchaseOrderAction({ purchaseOrderId: purchaseOrder.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Purchase order confirmed.');
    });
  }

  function onEdit(purchaseOrder: PurchaseOrderListItem) {
    startOpenDialog(async () => {
      const result = await getPurchaseOrderAction({ purchaseOrderId: purchaseOrder.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setDialog({ kind: 'edit', purchaseOrder: result.data });
    });
  }

  function onOpenReceive(purchaseOrder: PurchaseOrderListItem) {
    startOpenDialog(async () => {
      const result = await getPurchaseOrderAction({ purchaseOrderId: purchaseOrder.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setDialog({ kind: 'receive', purchaseOrder: result.data });
    });
  }

  const columns = useMemo<ColumnDef<PurchaseOrderListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'number',
        header: () => <DataTableColumnHeader columnId="number" title="Number" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-medium">{row.original.number}</p>
              {row.original.approvedAt && (
                <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" aria-label="Approved" />
              )}
            </div>
            {row.original.title && (
              <p className="truncate text-xs text-muted-foreground">{row.original.title}</p>
            )}
          </div>
        ),
      },
      {
        id: 'supplier',
        header: 'Supplier',
        cell: ({ row }) => row.original.supplierName ?? <span className="text-muted-foreground">—</span>,
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
        accessorKey: 'expectedDate',
        header: () => <DataTableColumnHeader columnId="expectedDate" title="Expected" />,
        cell: ({ row }) =>
          row.original.expectedDate ? (
            <span className="text-xs text-muted-foreground">
              {dateFormatter.format(row.original.expectedDate)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
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
          const purchaseOrder = row.original;
          const isDraft = purchaseOrder.status === 'draft';
          const canReceive = RECEIVABLE_STATUSES.includes(purchaseOrder.status);
          const canCancel = CANCELLABLE_STATUSES.includes(purchaseOrder.status);
          const canDeleteRow = DELETABLE_STATUSES.includes(purchaseOrder.status);

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {purchaseOrder.number}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/purchase-orders/${purchaseOrder.id}/pdf`} target="_blank" rel="noreferrer">
                      <FileText aria-hidden />
                      View PDF
                    </a>
                  </DropdownMenuItem>
                  {canApprove && !purchaseOrder.approvedAt && purchaseOrder.status !== 'cancelled' && (
                    <DropdownMenuItem disabled={isApproving} onSelect={() => onApprove(purchaseOrder)}>
                      <CheckCircle2 aria-hidden />
                      Approve
                    </DropdownMenuItem>
                  )}
                  {canSend && isDraft && (
                    <DropdownMenuItem disabled={isSending} onSelect={() => onSend(purchaseOrder)}>
                      <Send aria-hidden />
                      Send
                    </DropdownMenuItem>
                  )}
                  {canUpdate && purchaseOrder.status === 'sent' && (
                    <DropdownMenuItem disabled={isConfirming} onSelect={() => onConfirm(purchaseOrder)}>
                      Confirm
                    </DropdownMenuItem>
                  )}
                  {canUpdate && canReceive && (
                    <DropdownMenuItem
                      disabled={isOpeningDialog}
                      onSelect={() => onOpenReceive(purchaseOrder)}
                    >
                      <Package aria-hidden />
                      Receive
                    </DropdownMenuItem>
                  )}
                  {canUpdate && isDraft && (
                    <DropdownMenuItem disabled={isOpeningDialog} onSelect={() => onEdit(purchaseOrder)}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canUpdate && canCancel && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'cancel', purchaseOrder })}>
                      <Ban aria-hidden />
                      Cancel
                    </DropdownMenuItem>
                  )}
                  {canDelete && canDeleteRow && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', purchaseOrder })}
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
    [canApprove, canDelete, canSend, canUpdate, isApproving, isConfirming, isOpeningDialog, isSending],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={purchaseOrders}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search number or supplier..."
        statusOptions={PURCHASE_ORDER_STATUSES.map((status) => ({
          label: status.replace('_', ' ').replace(/^./, (char) => char.toUpperCase()),
          value: status,
        }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New purchase order
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No purchase orders yet"
            description="Order stock or services from a supplier."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New purchase order
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <PurchaseOrderFormDialog
          supplierOptions={supplierOptions}
          projectOptions={projectOptions}
          defaultCurrency={defaultCurrency}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <PurchaseOrderFormDialog
          purchaseOrder={dialog.purchaseOrder}
          supplierOptions={supplierOptions}
          projectOptions={projectOptions}
          defaultCurrency={defaultCurrency}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'receive' && (
        <ReceivePurchaseOrderDialog purchaseOrder={dialog.purchaseOrder} open onOpenChange={close} />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.purchaseOrder.number}?`}
          description="The purchase order is removed from your lists."
          confirmLabel="Delete"
          successMessage="Purchase order deleted."
          onConfirm={() => deletePurchaseOrderAction({ purchaseOrderId: dialog.purchaseOrder.id })}
        />
      )}

      {dialog.kind === 'cancel' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Cancel ${dialog.purchaseOrder.number}?`}
          description="The purchase order stays on record, marked cancelled. This cannot be undone."
          confirmLabel="Cancel purchase order"
          successMessage="Purchase order cancelled."
          onConfirm={() => cancelPurchaseOrderAction({ purchaseOrderId: dialog.purchaseOrder.id })}
        />
      )}
    </>
  );
}
