'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useTableParams } from './use-table-params';

/**
 * Sortable column header.
 *
 * Sorting is server-side via the URL, so this only reports intent. `columnId`
 * must be a field the repository is willing to sort by — it arrives from the
 * client, so the repository validates it against an allowlist rather than
 * interpolating it into SQL.
 */
export function DataTableColumnHeader({
  columnId,
  title,
  className,
  align = 'left',
}: {
  columnId: string;
  title: string;
  className?: string;
  align?: 'left' | 'right';
}) {
  const { params, toggleSort } = useTableParams();

  const isActive = params.sort === columnId;
  const direction = isActive ? params.order : undefined;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toggleSort(columnId)}
      className={cn(
        '-ml-2 h-8 data-[active=true]:text-foreground',
        align === 'right' && '-mr-2 ml-0',
        className,
      )}
      data-active={isActive}
      // Announces the current sort to screen readers, which otherwise only hear
      // a button labelled with the column name.
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{title}</span>
      {!isActive && <ChevronsUpDown className="opacity-50" aria-hidden />}
      {isActive && direction === 'asc' && <ArrowUp aria-hidden />}
      {isActive && direction === 'desc' && <ArrowDown aria-hidden />}
    </Button>
  );
}
