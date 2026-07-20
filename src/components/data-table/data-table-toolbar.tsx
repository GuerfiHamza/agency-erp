'use client';

import { Search, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

import { useTableParams } from './use-table-params';

export interface FilterOption {
  label: string;
  value: string;
}

interface Props {
  searchPlaceholder?: string;
  /** Values for the `status` facet. Omit to hide the filter entirely. */
  statusOptions?: FilterOption[];
  /** Rendered on the right — "New client", export, and so on. */
  actions?: React.ReactNode;
  /** Shown in place of `actions` when rows are selected. */
  bulkActions?: React.ReactNode;
  selectedCount?: number;
}

/**
 * Search, filters, and actions above the table.
 *
 * The search box keeps its own local state so typing stays responsive, and syncs
 * to the URL on a throttle. Driving the input directly from the URL would make
 * every keystroke wait on a server round trip.
 */
export function DataTableToolbar({
  searchPlaceholder = 'Search...',
  statusOptions,
  actions,
  bulkActions,
  selectedCount = 0,
}: Props) {
  const { params, setFilter, clearFilters, hasActiveFilters } = useTableParams();
  const [search, setSearch] = useState(params.q);
  const [lastUrlQuery, setLastUrlQuery] = useState(params.q);

  // Keep the box honest when the URL changes from elsewhere — a back navigation
  // or the "Clear" button.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component immediately with the new state before touching the DOM, so there
  // is no flash of the stale value. An effect would paint the old text first,
  // then correct it.
  if (params.q !== lastUrlQuery) {
    setLastUrlQuery(params.q);
    setSearch(params.q);
  }

  const selectedStatuses = new Set(params.status);

  function toggleStatus(value: string): void {
    const next = new Set(selectedStatuses);

    if (next.has(value)) next.delete(value);
    else next.add(value);

    setFilter({ status: next.size > 0 ? [...next] : null });
  }

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setFilter({ q: event.target.value || null });
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>

        {statusOptions && statusOptions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Status
                {selectedStatuses.size > 0 && (
                  <Badge variant="secondary" className="ml-1 rounded-sm px-1 font-mono text-xs">
                    {selectedStatuses.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {statusOptions.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={selectedStatuses.has(option.value)}
                  // The menu stays open so several statuses can be picked in one go.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => toggleStatus(option.value)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
            <X aria-hidden />
          </Button>
        )}
      </div>

      {/* Bulk actions replace the normal actions while a selection exists —
          two competing action sets on screen at once is how people click the
          wrong one. */}
      <div className="flex items-center gap-2">{selectedCount > 0 ? bulkActions : actions}</div>
    </div>
  );
}
