import type { ErrorPayload } from '@/lib/errors';

/**
 * Cross-cutting types shared by every module. Module-specific types belong in
 * that module's own folder — this file must not accumulate domain knowledge.
 */

/**
 * Discriminated result returned by server actions and services.
 *
 * Actions return this instead of throwing, so client components can render
 * field errors without a try/catch and without an error boundary.
 */
export type Result<T> = { success: true; data: T } | { success: false; error: ErrorPayload };

export const ok = <T>(data: T): Result<T> => ({ success: true, data });
export const err = (error: ErrorPayload): Result<never> => ({ success: false, error });

/** Sort direction shared by tables, query params, and repositories. */
export type SortDirection = 'asc' | 'desc';

export interface SortParams<TField extends string = string> {
  field: TField;
  direction: SortDirection;
}

/** Normalized, already-validated pagination input accepted by repositories. */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Query shape every list repository accepts. */
export interface ListQuery<TSortField extends string = string> extends PaginationParams {
  search?: string;
  sort?: SortParams<TSortField>;
}

/** Make selected keys optional. */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Make selected keys required. */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** A type that is either T or a promise of T. */
export type Awaitable<T> = T | Promise<T>;
