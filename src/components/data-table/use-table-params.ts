'use client';

import { useQueryStates } from 'nuqs';
import { useCallback } from 'react';

import { PAGINATION } from '@/config/constants';
import { tableSearchParams, type SORT_DIRECTIONS } from '@/lib/table/search-params';

/**
 * A table param update.
 *
 * Each key may be `null`, which is how nuqs *removes* a key from the URL rather
 * than writing an empty value — `?q=` and no `q` at all are different URLs, and
 * the tidy one is what people share.
 */
export type TableParamsUpdate = Partial<{
  [K in keyof TableParams]: TableParams[K] | null;
}>;

type TableParams = {
  [K in keyof typeof tableSearchParams]: ReturnType<(typeof tableSearchParams)[K]['parseServerSide']>;
};

/**
 * Client-side view of the table's URL state.
 *
 * Uses the same parser definitions as the server loader, so what the page reads
 * and what the table writes cannot diverge.
 */
export function useTableParams() {
  const [params, setParams] = useQueryStates(tableSearchParams, {
    // The server component must re-run on every param change to fetch the new
    // page; a shallow update would change the URL and nothing else.
    shallow: false,
    // Typing in the search box must not push one history entry per keystroke,
    // or the back button becomes unusable.
    throttleMs: 300,
  });

  /**
   * Change a filter, search term, or page size.
   *
   * Always resets to page 1: staying on page 7 while narrowing 400 results down
   * to 3 shows an empty table, which reads as "no results" and is a bug report
   * waiting to happen.
   */
  const setFilter = useCallback(
    (next: TableParamsUpdate) => {
      void setParams({ ...next, page: PAGINATION.defaultPage });
    },
    [setParams],
  );

  const setPage = useCallback(
    (page: number) => {
      void setParams({ page });
    },
    [setParams],
  );

  /** Toggle sort on a column: asc → desc → asc. */
  const toggleSort = useCallback(
    (column: string) => {
      const direction: (typeof SORT_DIRECTIONS)[number] =
        params.sort === column && params.order === 'asc' ? 'desc' : 'asc';

      void setParams({ sort: column, order: direction, page: PAGINATION.defaultPage });
    },
    [params.sort, params.order, setParams],
  );

  const clearFilters = useCallback(() => {
    // `null` removes the key from the URL rather than writing an empty value.
    void setParams({ q: null, status: null, page: null });
  }, [setParams]);

  const hasActiveFilters = params.q !== '' || params.status.length > 0;

  return { params, setParams, setFilter, setPage, toggleSort, clearFilters, hasActiveFilters };
}
