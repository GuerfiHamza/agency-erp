'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
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

import { receivePurchaseOrderAction } from '../purchase-orders.actions';
import type { PurchaseOrderWithItems } from '../purchase-orders.service';

interface Props {
  purchaseOrder: PurchaseOrderWithItems;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Records one delivery. Each field is the quantity arriving *in this
 * delivery*, added to the line's running total by the service — never a
 * replacement — so a second, later delivery cannot erase the first. Lines
 * already fully received are shown but not editable.
 */
export function ReceivePurchaseOrderDialog({ purchaseOrder, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const remaining = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of purchaseOrder.items) {
      map[item.id] = Math.max(0, Number(item.quantity) - Number(item.quantityReceived));
    }
    return map;
  }, [purchaseOrder.items]);

  function onSubmit() {
    setError(null);

    const lines = Object.entries(quantities)
      .filter(([, value]) => Number(value) > 0)
      .map(([itemId, quantityReceived]) => ({ itemId, quantityReceived }));

    if (lines.length === 0) {
      setError('Enter at least one received quantity.');
      return;
    }

    startTransition(async () => {
      const result = await receivePurchaseOrderAction({ purchaseOrderId: purchaseOrder.id, lines });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      toast.success('Delivery recorded.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive {purchaseOrder.number}</DialogTitle>
          <DialogDescription>Enter the quantity arriving in this delivery for each line.</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {purchaseOrder.items.map((item) => {
            const left = remaining[item.id] ?? 0;
            const isComplete = left <= 0;

            return (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantityReceived} of {item.quantity} received
                  </p>
                </div>
                <div className="w-28 shrink-0">
                  <Label htmlFor={`receive-${item.id}`} className="sr-only">
                    Quantity received for {item.description}
                  </Label>
                  <Input
                    id={`receive-${item.id}`}
                    type="number"
                    min={0}
                    max={left}
                    step="0.001"
                    placeholder="0"
                    disabled={isPending || isComplete}
                    value={quantities[item.id] ?? ''}
                    onChange={(event) =>
                      setQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isPending ? 'Recording...' : 'Record delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
