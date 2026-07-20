'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useState } from 'react';

import { ErrorState, TableSkeleton } from '@/components/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar, type FilterOption } from './data-table-toolbar';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  totalItems: number;
  /** Stable row identity — required for selection to survive a re-fetch. */
  getRowId: (row: TData) => string;

  isLoading?: boolean;
  /** Pre-sanitised message. Never pass a raw error. */
  error?: string | null;

  /** Rendered when there are no rows and no filters are active. */
  emptyState?: React.ReactNode;

  searchPlaceholder?: string;
  statusOptions?: FilterOption[];
  actions?: React.ReactNode;
  /** Receives the selected ids; rendered only while a selection exists. */
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;

  hasActiveFilters?: boolean;
}

/**
 * The table every list view is built from.
 *
 * TanStack Table in **manual** mode: pagination, sorting, and filtering all
 * happen in SQL, and this only renders what the server returned. Letting the
 * table do that work would mean fetching every row first — fine for a demo,
 * impossible for an ERP.
 *
 * It owns all four states so no caller has to remember them: loading renders a
 * skeleton shaped like the table, error renders a panel, empty distinguishes
 * "nothing here yet" from "nothing matched your filters", and otherwise rows.
 */
export function DataTable<TData>({
  columns,
  data,
  totalItems,
  getRowId,
  isLoading = false,
  error = null,
  emptyState,
  searchPlaceholder,
  statusOptions,
  actions,
  bulkActions,
  hasActiveFilters = false,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    // The server already paginated, sorted, and filtered. Saying so stops
    // TanStack from doing it a second time to the current page only — which
    // would sort 25 rows and look convincingly wrong.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: bulkActions !== undefined,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const clearSelection = () => setRowSelection({});

  return (
    <div className="w-full">
      <DataTableToolbar
        searchPlaceholder={searchPlaceholder}
        statusOptions={statusOptions}
        actions={actions}
        bulkActions={bulkActions?.(selectedIds, clearSelection)}
        selectedCount={selectedIds.length}
      />

      {/* The table scrolls inside its own box; the page must never scroll
          sideways because a table has many columns. */}
      <div className="overflow-x-auto rounded-lg border border-border">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton columns={columns.length} />
          </div>
        ) : error ? (
          <ErrorState description={error} />
        ) : data.length === 0 ? (
          hasActiveFilters ? (
            // Distinct from "nothing exists yet": here the fix is to change the
            // filters, and saying "no clients yet" would be a lie.
            <ErrorState
              title="No matches"
              description="No rows match your search or filters. Try clearing them."
            />
          ) : (
            (emptyState ?? <ErrorState title="Nothing here yet" description="No records to show." />)
          )
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} style={{ width: header.getSize() }}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(row.getIsSelected() && 'bg-muted/50')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DataTablePagination totalItems={totalItems} selectedCount={selectedIds.length} />
    </div>
  );
}

export { type FilterOption } from './data-table-toolbar';
export { DataTableColumnHeader } from './data-table-column-header';
export { useTableParams } from './use-table-params';
