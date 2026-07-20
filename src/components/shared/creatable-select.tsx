'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ComponentProps, type FormEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Result } from '@/types';

export interface SelectOption {
  id: string;
  name: string;
}

/** Never a real id — every id in this schema is a `uuid`. */
const CREATE_SENTINEL = '__create_new__';

/**
 * A minimal "name only" create dialog, used by `CreatableSelectField` and by
 * any picker (e.g. a client-scoped contact picker) that needs the same
 * one-field-and-go flow but drives its own `Select`.
 *
 * Deliberately not the entity's full form dialog: every entity this is used
 * for (client, project, supplier, contact) has exactly one truly required
 * field beyond an id it already has from context — the rest of that entity's
 * schema is optional or has a sensible default. Collecting only the name here
 * and leaving everything else to be filled in later from the entity's own
 * page is the same trade-off a "quick add" affordance makes everywhere else;
 * nothing here bypasses validation, since `onSubmit` still calls the real
 * Server Action with the same Zod schema.
 */
export function QuickCreateDialog({
  open,
  onOpenChange,
  title,
  label,
  placeholder,
  onSubmit,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  placeholder?: string;
  onSubmit: (name: string) => Promise<Result<{ id: string }>>;
  onCreated: (option: SelectOption) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) {
      setName('');
      setError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();

    if (trimmed.length < 2) {
      setError('Enter at least 2 characters.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await onSubmit(trimmed);

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      toast.success(`${title} created.`);
      onCreated({ id: result.data.id, name: trimmed });
      setName('');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Just the name for now — open its own page any time to fill in the rest.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="quick-create-name">{label}</Label>
            <Input
              id="quick-create-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={placeholder}
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" aria-hidden />}
              {isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A `Select` with a trailing "+ New X" item that opens `QuickCreateDialog`
 * inline instead of navigating away from whatever form this field lives in —
 * the point of the whole component: creating the client (or project,
 * supplier...) a form needs shouldn't mean abandoning the form to go create
 * it elsewhere and starting over.
 *
 * Keeps its own copy of `options` seeded from the prop so a freshly created
 * record shows up immediately without waiting on the parent's next server
 * fetch — `router.refresh()` in `QuickCreateDialog` still runs, so the next
 * render from the server carries it too; this is just what renders in the
 * gap between the two.
 */
export function CreatableSelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  triggerClassName,
  createLabel,
  dialogTitle,
  dialogLabel,
  dialogPlaceholder,
  onQuickCreate,
  ...triggerProps
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Merged with the trigger's default `w-full`, e.g. to go `sm:w-1/2` instead. */
  triggerClassName?: string;
  /** e.g. "New client" — the sentinel item's own label. */
  createLabel: string;
  /** e.g. "New client" — the quick-create dialog's title. */
  dialogTitle: string;
  /** e.g. "Client name" — the quick-create dialog's field label. */
  dialogLabel: string;
  dialogPlaceholder?: string;
  onQuickCreate: (name: string) => Promise<Result<{ id: string }>>;
} & Omit<
  ComponentProps<typeof SelectTrigger>,
  'className' | 'children' | 'value' | 'onChange' | 'disabled' | 'placeholder'
>) {
  const [localOptions, setLocalOptions] = useState<SelectOption[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const effectiveOptions = localOptions ?? options;

  function handleValueChange(next: string) {
    if (next === CREATE_SENTINEL) {
      setCreateOpen(true);
      return;
    }
    onChange(next);
  }

  return (
    <>
      <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
        {/* Forwards `id`/`aria-describedby`/`aria-invalid` cloned on by the
            surrounding `FormControl` — this whole component is the single
            child Radix `Slot` sees, so those props land here, not on the
            trigger automatically. */}
        <SelectTrigger className={cn('w-full', triggerClassName)} {...triggerProps}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {effectiveOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CREATE_SENTINEL} className="font-medium text-primary">
            <Plus className="size-4" aria-hidden />
            {createLabel}
          </SelectItem>
        </SelectContent>
      </Select>

      <QuickCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={dialogTitle}
        label={dialogLabel}
        placeholder={dialogPlaceholder}
        onSubmit={onQuickCreate}
        onCreated={(created) => {
          setLocalOptions([...effectiveOptions, created]);
          onChange(created.id);
        }}
      />
    </>
  );
}
