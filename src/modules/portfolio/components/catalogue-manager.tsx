'use client';

import { Loader2, Pencil, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import type { Result } from '@/types';

export interface CatalogueItem {
  id: string;
  name: string;
}

interface Props {
  title: string;
  description: string;
  items: CatalogueItem[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /**
   * The real Server Actions, passed straight through from the (Server
   * Component) page — a Server Component may hand a Client Component a
   * reference to an actual `'use server'` export, but not an inline wrapper
   * function closing over one, so these take the actions' real input shape
   * rather than a friendlier `(name: string) => ...` signature.
   */
  onCreate: (input: { name: string }) => Promise<Result<{ id: string }>>;
  onUpdate: (input: { id: string; name: string }) => Promise<Result<{ updated: true }>>;
  onDelete: (input: { id: string }) => Promise<Result<{ deleted: true }>>;
}

/**
 * A plain named catalogue — technologies and categories are the same shape,
 * so one component drives both from the settings page, each wired to its own
 * actions. Small enough per company that a plain list beats a DataTable, the
 * same call the Roles page already made for the same reason.
 */
export function CatalogueManager({
  title,
  description,
  items,
  canCreate,
  canUpdate,
  canDelete,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingItem, setDeletingItem] = useState<CatalogueItem | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;

    startTransition(async () => {
      const result = await onCreate({ name });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setNewName('');
      toast.success(`${title.slice(0, -1)} added.`);
      router.refresh();
    });
  }

  function handleRename(id: string) {
    const name = editingName.trim();
    if (!name) return;

    startTransition(async () => {
      const result = await onUpdate({ id, name });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canCreate && (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="New name"
              disabled={isPending}
            />
            <Button type="button" onClick={handleCreate} disabled={isPending || !newName.trim()}>
              {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              Add
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                {editingId === item.id ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleRename(item.id);
                      }
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => handleRename(item.id)}
                    disabled={isPending}
                    className="h-8"
                  />
                ) : (
                  <span className="text-sm">{item.name}</span>
                )}

                <div className="flex shrink-0 items-center gap-1">
                  {canUpdate && editingId !== item.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditingName(item.name);
                      }}
                      aria-label={`Rename ${item.name}`}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeletingItem(item)}
                      aria-label={`Delete ${item.name}`}
                    >
                      <X aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {deletingItem && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setDeletingItem(null)}
          destructive
          title={`Delete ${deletingItem.name}?`}
          description="Projects already using it keep it; it just won't be selectable for new ones."
          confirmLabel="Delete"
          successMessage="Deleted."
          onConfirm={() => onDelete({ id: deletingItem.id })}
        />
      )}
    </Card>
  );
}
