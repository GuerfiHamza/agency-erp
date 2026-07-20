'use client';

import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export interface PermissionOption {
  slug: string;
  resource: string;
  action: string;
}

interface Props {
  catalogue: PermissionOption[];
  selected: string[];
  onChange: (slugs: string[]) => void;
  disabled?: boolean;
}

/** "time_entries" reads as a column name; "Time entries" reads as a thing. */
function humanise(resource: string): string {
  const words = resource.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The permission grid.
 *
 * Grouped by resource with a per-resource toggle, because a flat list of 101
 * checkboxes is not something anyone audits — and auditing is the entire point
 * of the screen. Grouping makes "who can touch invoices?" answerable at a glance.
 */
export function PermissionPicker({ catalogue, selected, onChange, disabled = false }: Props) {
  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionOption[]>();

    for (const permission of catalogue) {
      const existing = groups.get(permission.resource);
      if (existing) existing.push(permission);
      else groups.set(permission.resource, [permission]);
    }

    return [...groups.entries()];
  }, [catalogue]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(slug: string, checked: boolean): void {
    const next = new Set(selectedSet);

    if (checked) next.add(slug);
    else next.delete(slug);

    onChange([...next]);
  }

  function toggleResource(permissions: PermissionOption[], checked: boolean): void {
    const next = new Set(selectedSet);

    for (const permission of permissions) {
      if (checked) next.add(permission.slug);
      else next.delete(permission.slug);
    }

    onChange([...next]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {selected.length} of {catalogue.length} permissions granted
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(catalogue.map((permission) => permission.slug))}
          >
            Select all
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([])}>
            Clear
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {grouped.map(([resource, permissions]) => {
          const granted = permissions.filter((permission) => selectedSet.has(permission.slug));
          const allGranted = granted.length === permissions.length;

          return (
            <fieldset key={resource} className="rounded-lg border border-border p-3">
              <legend className="flex items-center gap-2 px-1">
                <Checkbox
                  id={`resource-${resource}`}
                  // Some-but-not-all shows a dash, not a tick: an unchecked box
                  // would claim nothing under it is granted, and a ticked one
                  // would claim everything is.
                  checked={allGranted ? true : granted.length > 0 ? 'indeterminate' : false}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggleResource(permissions, checked === true)}
                />
                <Label htmlFor={`resource-${resource}`} className="text-sm font-medium">
                  {humanise(resource)}
                </Label>
              </legend>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {permissions.map((permission) => (
                  <div key={permission.slug} className="flex items-center gap-2">
                    <Checkbox
                      id={permission.slug}
                      checked={selectedSet.has(permission.slug)}
                      disabled={disabled}
                      onCheckedChange={(checked) => toggle(permission.slug, checked === true)}
                    />
                    <Label htmlFor={permission.slug} className="font-mono text-xs font-normal">
                      {permission.action}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
