import { PAGINATION } from '@/config/constants';
import type { PaginatedResult, PaginationParams } from '@/types';

/**
 * Shared helpers.
 *
 * Deliberately small. Domain-specific helpers belong to their module; this file
 * only holds logic that genuinely has no owner yet.
 */

/**
 * Clamp untrusted pagination input into a safe range.
 *
 * Page size is capped because it reaches a SQL LIMIT: an unbounded `?pageSize=`
 * from a query string would let a caller pull an entire table in one request.
 */
export function normalizePagination(input: Partial<PaginationParams> = {}): PaginationParams {
  const page = Math.max(1, Math.trunc(input.page ?? PAGINATION.defaultPage) || PAGINATION.defaultPage);
  const requested = Math.trunc(input.pageSize ?? PAGINATION.defaultPageSize) || PAGINATION.defaultPageSize;
  const pageSize = Math.min(PAGINATION.maxPageSize, Math.max(1, requested));

  return { page, pageSize };
}

/** Rows to skip for a given page. Pairs with `normalizePagination`. */
export function toOffset({ page, pageSize }: PaginationParams): number {
  return (page - 1) * pageSize;
}

/** Assemble the paginated envelope every list endpoint returns. */
export function buildPaginatedResult<T>(
  items: T[],
  totalItems: number,
  { page, pageSize }: PaginationParams,
): PaginatedResult<T> {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}
