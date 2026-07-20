/**
 * URL-safe slugs.
 *
 * Extracted from `auth.service.ts` when the Roles module became the second
 * caller. Slug rules are a product decision — how "Café Ströme & Co" becomes an
 * identifier — and two copies would drift the first time one was tightened.
 */

/**
 * Turn a display name into a slug.
 *
 * NFKD splits "é" into "e" plus a combining accent, which `\p{Diacritic}` then
 * strips — so "Café" and "Cafe" resolve to the same slug rather than one of them
 * becoming an empty string.
 */
export function toSlug(value: string, fallback = 'item'): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) ||
    // A name written entirely in a non-Latin script slugs to an empty string,
    // which would violate NOT NULL and is not a usable identifier.
    fallback
  );
}

/**
 * Find a free slug, appending -2, -3, ... on collision.
 *
 * `isTaken` is injected because each table scopes uniqueness differently —
 * companies globally, roles per company. Races remain possible between the check
 * and the insert, which is why the partial unique indexes exist; this loop only
 * makes the common case pretty.
 */
export async function findAvailableSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;

    if (!(await isTaken(candidate))) return candidate;
  }

  // 50 collisions is not a real scenario; a random suffix beats failing the
  // request outright.
  return `${base}-${Date.now().toString(36)}`;
}
