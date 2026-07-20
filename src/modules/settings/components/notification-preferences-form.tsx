'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import { updateNotificationPreferencesAction } from '../settings.actions';
import { NOTIFICATION_TYPES, type NotificationPreferences } from '../settings.validation';

interface Props {
  preferences: NotificationPreferences;
  canUpdate: boolean;
}

function humanise(type: string): string {
  return type.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

/**
 * Local state, not React Hook Form — eleven independent booleans with no
 * cross-field validation is simpler as plain `useState` than as a form
 * resolver built for the money/date shapes every other module's forms have.
 */
export function NotificationPreferencesForm({ preferences, canUpdate }: Props) {
  const [values, setValues] = useState(preferences);
  const [isSaving, startSave] = useTransition();

  function toggle(type: (typeof NOTIFICATION_TYPES)[number]) {
    setValues((current) => ({ ...current, [type]: !current[type] }));
  }

  function onSave() {
    startSave(async () => {
      const result = await updateNotificationPreferencesAction(values);

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      toast.success('Notification preferences saved.');
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {NOTIFICATION_TYPES.map((type) => (
          <label
            key={type}
            className="flex items-center gap-2 rounded-md border border-border p-3 text-sm has-[:disabled]:opacity-60"
          >
            <Checkbox checked={values[type]} disabled={!canUpdate} onCheckedChange={() => toggle(type)} />
            <Label className="cursor-pointer font-normal">{humanise(type)}</Label>
          </label>
        ))}
      </div>

      {canUpdate && (
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save preferences'}
        </Button>
      )}
    </div>
  );
}
