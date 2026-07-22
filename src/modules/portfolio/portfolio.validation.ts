import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Portfolio input schemas.
 *
 * `slug` is not here for any of the three entities — it is generated
 * server-side from the name/title (see `portfolio.service.ts`), the same
 * "stable identifier, never regenerated on rename" posture as a company's
 * `slug` or a project's `code`: the public API and neodott.com address a
 * project by its slug, so changing it on every title edit would break links
 * already published there.
 */

const optionalText = (max: number = DB_LIMITS.shortText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

const optionalUrl = z
  .url({ error: 'Enter a full URL, including https://' })
  .max(DB_LIMITS.shortText)
  .or(z.literal(''))
  .transform((value) => value || null)
  .nullable();

const optionalId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

/** A storage key, set programmatically by `FileUpload` — never hand-typed. */
const optionalStorageKey = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null)
  .nullable();

export const nameFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Enter a name.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
});

/** Technologies and categories are both a plain named catalogue — identical shape. */
export type TechnologyInput = z.output<typeof nameFormSchema>;
export type CategoryInput = z.output<typeof nameFormSchema>;

export const PORTFOLIO_PROJECT_STATUSES = ['draft', 'published'] as const;
export type PortfolioProjectStatus = (typeof PORTFOLIO_PROJECT_STATUSES)[number];

export const projectFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { error: 'Name this project.' })
    .max(DB_LIMITS.shortText, { error: 'That title is too long.' }),
  shortDescription: z
    .string()
    .trim()
    .min(1, { error: 'Add a short description.' })
    .max(DB_LIMITS.mediumText, { error: 'Keep the short description brief.' }),
  aboutDescription: optionalText(DB_LIMITS.longText),

  categoryId: optionalId,
  mainImageKey: optionalStorageKey,

  /** Only meaningful together: a link with nothing to show it's live is dead weight. */
  websiteUrl: optionalUrl,
  isLive: z.boolean(),

  /** Draft is the safe default — a half-filled-in project never reaches the public API by accident. */
  status: z.enum(PORTFOLIO_PROJECT_STATUSES),

  technologyIds: z.array(z.uuid()).default([]),

  /**
   * Gallery images staged before the project row exists. Storage keys don't
   * need a project id (same as `mainImageKey`) — only the `project_images`
   * row does — so these ride along with the create call and get attached in
   * the same request instead of forcing a save-then-upload two-step. Ignored
   * on update: an existing project attaches/detaches gallery images
   * immediately through their own actions (`ProjectGallery`), not this field.
   */
  galleryImageKeys: z.array(z.string().trim().min(1).max(500)).default([]),
});

export type ProjectFormValues = z.input<typeof projectFormSchema>;
export type ProjectInput = z.output<typeof projectFormSchema>;

export const addImageSchema = z.object({
  projectId: z.uuid(),
  storageKey: z.string().trim().min(1).max(500),
});

export const PORTFOLIO_SORT_FIELDS = ['title', 'status', 'createdAt'] as const;
export type PortfolioSortField = (typeof PORTFOLIO_SORT_FIELDS)[number];

export function isPortfolioSortField(value: string | null): value is PortfolioSortField {
  return value !== null && (PORTFOLIO_SORT_FIELDS as readonly string[]).includes(value);
}

export function toPortfolioStatusFilters(values: string[]): PortfolioProjectStatus[] {
  return values.filter((value): value is PortfolioProjectStatus =>
    (PORTFOLIO_PROJECT_STATUSES as readonly string[]).includes(value),
  );
}
