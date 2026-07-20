'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGINATION } from '@/config/constants';

import { useTableParams } from './use-table-params';

interface Props {
  totalItems: number;
  /** Rows selected across the current page, for the "N of M selected" readout. */
  selectedCount?: number;
}

/**
 * Pagination controls.
 *
 * Server-side: this only moves the URL, and the page re-fetches. Client-side
 * pagination would mean shipping every row to the browser, which is untenable
 * once a table has real data in it.
 */
export function DataTablePagination({ totalItems, selectedCount = 0 }: Props) {
  const { params, setPage, setFilter } = useTableParams();

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / params.pageSize);
  const canPrevious = params.page > 1;
  const canNext = params.page < totalPages;

  const firstRow = totalItems === 0 ? 0 : (params.page - 1) * params.pageSize + 1;
  const lastRow = Math.min(params.page * params.pageSize, totalItems);

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-4 px-1 py-3 sm:flex-row">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {selectedCount > 0 ? (
          <>
            {selectedCount} selected · {totalItems} total
          </>
        ) : totalItems === 0 ? (
          'No results'
        ) : (
          <>
            {firstRow}–{lastRow} of {totalItems}
          </>
        )}
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="page-size" className="text-sm text-muted-foreground">
            Rows
          </label>
          <Select
            value={String(params.pageSize)}
            onValueChange={(value) => setFilter({ pageSize: Number(value) })}
          >
            <SelectTrigger id="page-size" size="sm" className="w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGINATION.pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage(1)}
            disabled={!canPrevious}
            aria-label="First page"
          >
            <ChevronsLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage(params.page - 1)}
            disabled={!canPrevious}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden />
          </Button>

          <span className="px-2 text-sm text-muted-foreground tabular-nums">
            {totalPages === 0 ? '0 / 0' : `${params.page} / ${totalPages}`}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage(params.page + 1)}
            disabled={!canNext}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage(totalPages)}
            disabled={!canNext}
            aria-label="Last page"
          >
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
