'use client';

import { Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';

import { regenerateApiKeyAction } from '../portfolio.actions';

interface Props {
  hasKey: boolean;
  canManage: boolean;
}

export function ApiKeyCard({ hasKey, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copyKey() {
    if (!revealedKey) return;
    void navigator.clipboard.writeText(revealedKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function generate() {
    startTransition(async () => {
      const result = await regenerateApiKeyAction();
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setRevealedKey(result.data.apiKey);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden />
          API key
        </CardTitle>
        <CardDescription>
          neodott.com sends this in an <code>X-API-Key</code> header to read published projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {revealedKey ? (
          <div className="space-y-2">
            <Alert>
              <AlertDescription>
                Copy this now — it won&apos;t be shown again. Update it wherever neodott.com stores it.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Input readOnly value={revealedKey} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={copyKey} aria-label="Copy API key">
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {hasKey ? 'A key is configured. Regenerating replaces it immediately.' : 'No key generated yet.'}
          </p>
        )}

        {canManage && !revealedKey && (
          <Button
            type="button"
            variant={hasKey ? 'outline' : 'default'}
            onClick={() => (hasKey ? setConfirmOpen(true) : void generate())}
            disabled={isPending}
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            {hasKey ? 'Regenerate key' : 'Generate key'}
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title="Regenerate the API key?"
        description="The old key stops working immediately — update neodott.com's copy right after."
        confirmLabel="Regenerate"
        onConfirm={async () => {
          const result = await regenerateApiKeyAction();
          if (result.success) setRevealedKey(result.data.apiKey);
          return result;
        }}
      />
    </Card>
  );
}
