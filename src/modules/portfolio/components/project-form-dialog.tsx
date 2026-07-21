'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileUpload, type UploadedFile } from '@/modules/storage/components/file-upload';

import {
  addProjectImageAction,
  createProjectAction,
  removeProjectImageAction,
  updateProjectAction,
} from '../portfolio.actions';
import type { PortfolioProjectRow, ProjectImageRow } from '../portfolio.service';
import {
  PORTFOLIO_PROJECT_STATUSES,
  projectFormSchema,
  type ProjectFormValues,
  type ProjectInput,
} from '../portfolio.validation';

interface Props {
  /** Omitted or null → create; a project → edit. One form for both. */
  project?: PortfolioProjectRow | null;
  categoryOptions: { id: string; name: string }[];
  technologyOptions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NONE = '__none__';

const STATUS_LABELS: Record<(typeof PORTFOLIO_PROJECT_STATUSES)[number], string> = {
  draft: 'Draft (hidden from the API)',
  published: 'Published (live on the API)',
};

/** The public image route is unauthenticated and scoped to `portfolio/` keys — safe to reuse for admin previews too. */
function previewUrl(storageKey: string): string {
  return `/api/public/portfolio/images/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
}

export function ProjectFormDialog({
  project,
  categoryOptions,
  technologyOptions,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(
    project?.mainImageKey ? previewUrl(project.mainImageKey) : null,
  );
  const isEdit = Boolean(project);

  const form = useForm<ProjectFormValues, unknown, ProjectInput>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      title: project?.title ?? '',
      shortDescription: project?.shortDescription ?? '',
      aboutDescription: project?.aboutDescription ?? '',
      categoryId: project?.categoryId ?? '',
      mainImageKey: project?.mainImageKey ?? '',
      websiteUrl: project?.websiteUrl ?? '',
      isLive: project?.isLive ?? false,
      status: project?.status ?? 'draft',
      technologyIds: project?.technologies.map((technology) => technology.id) ?? [],
    },
  });

  const selectedTechnologyIds = new Set(form.watch('technologyIds'));

  function toggleTechnology(id: string): void {
    const next = new Set(selectedTechnologyIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    form.setValue('technologyIds', [...next], { shouldDirty: true });
  }

  function onSubmit(values: ProjectInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateProjectAction({ projectId: project!.id, ...values })
        : await createProjectAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Project updated.' : 'Project created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${project!.title}` : 'New portfolio project'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this project. Published projects are visible through the public API.'
              : 'New projects start as a draft — publish once it is ready to show on neodott.com.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input disabled={isPending} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shortDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Short description</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="One or two sentences — this is what shows on the portfolio grid."
                      disabled={isPending}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="aboutDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>About the project</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="The longer write-up shown on the project's own page."
                      disabled={isPending}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === NONE ? '' : value)}
                      value={field.value ? String(field.value) : NONE}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {categoryOptions.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PORTFOLIO_PROJECT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Technologies</FormLabel>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isPending}
                  >
                    {selectedTechnologyIds.size > 0
                      ? `${selectedTechnologyIds.size} selected`
                      : 'Choose technologies'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {technologyOptions.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      No technologies yet — add some from Portfolio settings.
                    </p>
                  ) : (
                    technologyOptions.map((technology) => (
                      <DropdownMenuCheckboxItem
                        key={technology.id}
                        checked={selectedTechnologyIds.has(technology.id)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => toggleTechnology(technology.id)}
                      >
                        {technology.name}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {selectedTechnologyIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {technologyOptions
                    .filter((technology) => selectedTechnologyIds.has(technology.id))
                    .map((technology) => (
                      <Badge key={technology.id} variant="secondary">
                        {technology.name}
                      </Badge>
                    ))}
                </div>
              )}
            </FormItem>

            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
              <FormField
                control={form.control}
                name="isLive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 pb-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isPending} />
                    </FormControl>
                    <FormLabel className="font-normal">Site is still live</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="websiteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website link</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://client-site.com"
                        disabled={isPending}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Main image</FormLabel>
              {mainImagePreview && (
                // eslint-disable-next-line @next/next/no-img-element -- an admin preview of an uploaded key, not app content worth next/image's overhead here.
                <img
                  src={mainImagePreview}
                  alt=""
                  className="mb-2 h-32 w-full rounded-md border border-border object-cover"
                />
              )}
              <FileUpload
                scope="portfolio"
                accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif']}
                disabled={isPending}
                onUploaded={(file: UploadedFile) => {
                  form.setValue('mainImageKey', file.key, { shouldDirty: true });
                  setMainImagePreview(previewUrl(file.key));
                }}
              />
            </FormItem>

            {isEdit && (
              <FormItem>
                <FormLabel>More images</FormLabel>
                <ProjectGallery projectId={project!.id} images={project!.images} disabled={isPending} />
              </FormItem>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || (isEdit && !form.formState.isDirty)}>
                {isPending && <Loader2 className="animate-spin" aria-hidden />}
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gallery images are their own sub-resource, added/removed immediately
 * rather than batched into the form's single submit — there's no stable
 * per-row identity to diff the way the form's other fields have, and each
 * image is already a real row the moment it's uploaded.
 */
function ProjectGallery({
  projectId,
  images,
  disabled,
}: {
  projectId: string;
  images: ProjectImageRow[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function removeImage(imageId: string): void {
    setError(null);
    startTransition(async () => {
      const result = await removeProjectImageAction({ projectId, imageId });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((image) => (
            <div key={image.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- see the main-image preview note above. */}
              <img
                src={previewUrl(image.storageKey)}
                alt=""
                className="h-20 w-full rounded-md border border-border object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => removeImage(image.id)}
                disabled={disabled || isPending}
                aria-label="Remove image"
              >
                <X aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}

      <FileUpload
        scope="portfolio"
        accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif']}
        disabled={disabled || isPending}
        onUploaded={(file: UploadedFile) => {
          startTransition(async () => {
            const result = await addProjectImageAction({ projectId, storageKey: file.key });
            if (!result.success) {
              setError(result.error.message);
              return;
            }
            router.refresh();
          });
        }}
      />
    </div>
  );
}
