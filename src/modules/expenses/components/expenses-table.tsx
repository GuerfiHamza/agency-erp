'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, MoreHorizontal, Paperclip, Plus, Send, XCircle } from 'lucide-react';
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
import { presignDownloadAction } from '@/modules/storage/storage.actions';

import {
  approveExpenseAction,
  deleteExpenseAction,
  reimburseExpenseAction,
  submitExpenseAction,
} from '../expenses.actions';
import type { ExpenseListItem } from '../expenses.service';
import { EXPENSE_STATUSES } from '../expenses.validation';

import { ExpenseFormDialog } from './expense-form-dialog';
import { RejectExpenseDialog } from './reject-expense-dialog';

interface Props {
  expenses: ExpenseListItem[];
  totalItems: number;
  currentUserId: string;
  defaultCurrency: string;
  projectOptions: { id: string; name: string }[];
  supplierOptions: { id: string; name: string }[];
  userOptions: { id: string; name: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; expense: ExpenseListItem }
  | { kind: 'delete'; expense: ExpenseListItem }
  | { kind: 'reject'; expense: ExpenseListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const moneyFormatter = (currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });

const STATUS_VARIANT: Record<
  (typeof EXPENSE_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  submitted: 'default',
  approved: 'default',
  rejected: 'destructive',
  reimbursed: 'outline',
};

const DELETABLE_STATUSES = ['draft', 'rejected'];

async function viewReceipt(storageKey: string) {
  const result = await presignDownloadAction({ key: storageKey, download: false });

  if (!result.success) {
    toast.error(result.error.message);
    return;
  }

  window.open(result.data.url, '_blank', 'noopener,noreferrer');
}

export function ExpensesTable({
  expenses,
  totalItems,
  currentUserId,
  defaultCurrency,
  projectOptions,
  supplierOptions,
  userOptions,
  canCreate,
  canUpdate,
  canDelete,
  canApprove,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [isSubmitting, startSubmit] = useTransition();
  const [isApproving, startApprove] = useTransition();
  const [isReimbursing, startReimburse] = useTransition();

  const close = () => setDialog({ kind: 'none' });

  function onSubmit(expense: ExpenseListItem) {
    startSubmit(async () => {
      const result = await submitExpenseAction({ expenseId: expense.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Expense submitted for approval.');
    });
  }

  function onApprove(expense: ExpenseListItem) {
    startApprove(async () => {
      const result = await approveExpenseAction({ expenseId: expense.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Expense approved.');
    });
  }

  function onReimburse(expense: ExpenseListItem) {
    startReimburse(async () => {
      const result = await reimburseExpenseAction({ expenseId: expense.id });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Expense marked reimbursed.');
    });
  }

  const columns = useMemo<ColumnDef<ExpenseListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'description',
        header: () => <DataTableColumnHeader columnId="description" title="Description" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.description}</p>
              <p className="truncate text-xs text-muted-foreground capitalize">{row.original.category}</p>
            </div>
            {row.original.receiptStorageKey && (
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a receipt" />
            )}
          </div>
        ),
      },
      {
        id: 'incurredBy',
        header: 'Incurred by',
        cell: ({ row }) => row.original.userName ?? <span className="text-muted-foreground">—</span>,
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
        accessorKey: 'spentOn',
        header: () => <DataTableColumnHeader columnId="spentOn" title="Spent on" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{dateFormatter.format(row.original.spentOn)}</span>
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
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const expense = row.original;
          const isDraft = expense.status === 'draft';

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {expense.description}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {expense.receiptStorageKey && (
                    <DropdownMenuItem onSelect={() => void viewReceipt(expense.receiptStorageKey!)}>
                      <Paperclip aria-hidden />
                      View receipt
                    </DropdownMenuItem>
                  )}
                  {canUpdate && isDraft && (
                    <DropdownMenuItem disabled={isSubmitting} onSelect={() => onSubmit(expense)}>
                      <Send aria-hidden />
                      Submit
                    </DropdownMenuItem>
                  )}
                  {canApprove && expense.status === 'submitted' && (
                    <DropdownMenuItem disabled={isApproving} onSelect={() => onApprove(expense)}>
                      <CheckCircle2 aria-hidden />
                      Approve
                    </DropdownMenuItem>
                  )}
                  {canApprove && expense.status === 'submitted' && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'reject', expense })}>
                      <XCircle aria-hidden />
                      Reject
                    </DropdownMenuItem>
                  )}
                  {canApprove && expense.status === 'approved' && (
                    <DropdownMenuItem disabled={isReimbursing} onSelect={() => onReimburse(expense)}>
                      Mark reimbursed
                    </DropdownMenuItem>
                  )}
                  {canUpdate && isDraft && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', expense })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && DELETABLE_STATUSES.includes(expense.status) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', expense })}
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
    [canApprove, canDelete, canUpdate, isApproving, isReimbursing, isSubmitting],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={expenses}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search description..."
        statusOptions={EXPENSE_STATUSES.map((status) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
          value: status,
        }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New expense
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No expenses yet"
            description="Record a cost you or the company incurred."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New expense
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <ExpenseFormDialog
          currentUserId={currentUserId}
          defaultCurrency={defaultCurrency}
          projectOptions={projectOptions}
          supplierOptions={supplierOptions}
          userOptions={userOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <ExpenseFormDialog
          expense={dialog.expense}
          currentUserId={currentUserId}
          defaultCurrency={defaultCurrency}
          projectOptions={projectOptions}
          supplierOptions={supplierOptions}
          userOptions={userOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'reject' && (
        <RejectExpenseDialog
          expenseId={dialog.expense.id}
          expenseDescription={dialog.expense.description}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete "${dialog.expense.description}"?`}
          description="The expense is removed from your lists."
          confirmLabel="Delete"
          successMessage="Expense deleted."
          onConfirm={() => deleteExpenseAction({ expenseId: dialog.expense.id })}
        />
      )}
    </>
  );
}
