'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreatableSelectField } from '@/components/shared/creatable-select';
import { FileUpload, type UploadedFile } from '@/modules/storage/components/file-upload';

import { quickCreateClientAction } from '../../clients/clients.actions';
import { quickCreateProjectAction } from '../../projects/projects.actions';
import { createDocumentAction, updateDocumentAction } from '../documents.actions';
import type { DocumentListItem } from '../documents.service';
import {
  DOCUMENT_ATTACH_KINDS,
  DOCUMENT_TYPES,
  documentDetailsSchema,
  type DocumentAttachKind,
  type DocumentDetailsInput,
  type DocumentDetailsValues,
} from '../documents.validation';

export interface AttachmentOptions {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  tasks: { id: string; name: string }[];
}

interface Props {
  /** Omitted or null → upload a new document; a document → edit its details. */
  document?: DocumentListItem | null;
  attachmentOptions: AttachmentOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NONE = '__none__';

const ATTACH_LABELS: Record<DocumentAttachKind, string> = {
  none: 'Nothing',
  client: 'Client',
  project: 'Project',
  task: 'Task',
};

function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Strip the extension so "signed-contract.pdf" suggests "signed-contract". */
function toSuggestedName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || filename;
}

/**
 * One dialog for upload and edit. The field set is identical apart from the file
 * itself, which only create has: the bytes of an existing document are never
 * replaced (a re-upload is a new document), so edit simply omits the dropzone.
 *
 * On create the file is uploaded first, straight to storage, and the resulting
 * key is held in state until submit — so a cancelled form leaves an unreferenced
 * object rather than a row pointing at nothing.
 */
export function DocumentFormDialog({ document, attachmentOptions, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const isEdit = Boolean(document);

  const form = useForm<DocumentDetailsValues, unknown, DocumentDetailsInput>({
    resolver: zodResolver(documentDetailsSchema),
    defaultValues: {
      name: document?.name ?? '',
      type: document?.type ?? 'other',
      description: document?.description ?? '',
      attachKind: document?.attachedKind ?? 'none',
      attachId: document?.clientId ?? document?.projectId ?? document?.taskId ?? '',
    },
  });

  const attachKind = form.watch('attachKind');

  const attachChoices =
    attachKind === 'client'
      ? attachmentOptions.clients
      : attachKind === 'project'
        ? attachmentOptions.projects
        : attachKind === 'task'
          ? attachmentOptions.tasks
          : [];

  const onUploaded = useCallback(
    (file: UploadedFile) => {
      setUploaded(file);
      // Only fill a name the user has not typed over.
      if (!form.getValues('name')) form.setValue('name', toSuggestedName(file.filename));
    },
    [form],
  );

  function onSubmit(values: DocumentDetailsInput) {
    setFormError(null);

    if (!isEdit && !uploaded) {
      setFormError('Choose a file to upload first.');
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateDocumentAction({ documentId: document!.id, ...values })
        : await createDocumentAction({
            ...values,
            storageKey: uploaded!.key,
            mimeType: uploaded!.contentType,
            sizeBytes: uploaded!.size,
          });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Document updated.' : 'Document uploaded.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit document' : 'Upload document'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details. The file itself stays as uploaded.'
              : 'Upload a file and describe what it is.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {!isEdit && <FileUpload scope="documents" onUploaded={onUploaded} disabled={isPending} />}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input disabled={isPending} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {humanise(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attachKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attach to</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        // The old id belongs to a different table now.
                        form.setValue('attachId', '');
                      }}
                      value={field.value}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DOCUMENT_ATTACH_KINDS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {ATTACH_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {attachKind !== 'none' && (
                <FormField
                  control={form.control}
                  name="attachId"
                  render={({ field }) => {
                    const value = field.value ? String(field.value) : NONE;
                    const onChange = (next: string) => field.onChange(next === NONE ? '' : next);
                    const options = [{ id: NONE, name: 'None' }, ...attachChoices];

                    // Client and project targets can be created on the spot; a
                    // task cannot yet (no quick-create action exists for it),
                    // so that branch keeps the plain `Select`.
                    if (attachKind === 'client' || attachKind === 'project') {
                      return (
                        <FormItem>
                          <FormLabel>{ATTACH_LABELS[attachKind]}</FormLabel>
                          <FormControl>
                            <CreatableSelectField
                              value={value}
                              onChange={onChange}
                              options={options}
                              placeholder="Choose one"
                              disabled={isPending}
                              createLabel={attachKind === 'client' ? 'New client' : 'New project'}
                              dialogTitle={attachKind === 'client' ? 'New client' : 'New project'}
                              dialogLabel={attachKind === 'client' ? 'Client name' : 'Project name'}
                              onQuickCreate={(name) =>
                                attachKind === 'client'
                                  ? quickCreateClientAction({ name })
                                  : quickCreateProjectAction({ name })
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }

                    return (
                      <FormItem>
                        <FormLabel>{ATTACH_LABELS[attachKind]}</FormLabel>
                        <Select
                          onValueChange={onChange}
                          value={value}
                          disabled={isPending || attachChoices.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Choose one" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {options.map((choice) => (
                              <SelectItem key={choice.id} value={choice.id}>
                                {choice.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isPending}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || (!isEdit && !uploaded)}>
                {isPending && <Loader2 className="animate-spin" aria-hidden />}
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Add document'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
