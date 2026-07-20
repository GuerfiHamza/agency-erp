import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';

import { PAGINATION } from '@/config/constants';

/**
 * Table state lives in the URL.
 *
 * Not in React state: a filtered, sorted, page-3 view is a thing people bookmark,
 * share with a colleague, and expect the back button to return them to. Holding
 * it in component state throws all of that away, and makes the server component
 * unable to fetch the right rows on first paint.
 *
 * These parsers are defined once and used from both sides — `loadTableParams` on
 * the server to fetch, `useTableParams` on the client to navigate. Two copies
 * would drift, and the drift would show up as a page that renders one thing and
 * fetches another.
 */

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export const tableSearchParams = {
  page: parseAsInteger.withDefault(PAGINATION.defaultPage),
  pageSize: parseAsInteger.withDefault(PAGINATION.defaultPageSize),
  /** Column id to sort by. Validated against real columns by the repository. */
  sort: parseAsString,
  order: parseAsStringLiteral(SORT_DIRECTIONS).withDefault('asc'),
  /** Free-text search. */
  q: parseAsString.withDefault(''),
  /** Repeatable `status=` values, e.g. `?status=draft&status=sent`. */
  status: parseAsArrayOf(parseAsString).withDefault([]),
};

/** Read table params in a Server Component from `searchParams`. */
export const loadTableParams = createLoader(tableSearchParams);

/** Build a URL for these params — used for pagination links and RSS-style exports. */
export const serializeTableParams = createSerializer(tableSearchParams);

export interface ParsedTableParams {
  page: number;
  pageSize: number;
  sort: string | null;
  order: (typeof SORT_DIRECTIONS)[number];
  q: string;
  status: string[];
}
