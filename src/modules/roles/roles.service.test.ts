import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PERMISSION_SLUGS } from '@/config/permissions';
import { db } from '@/db';
import { companies, roles, user, userRoles } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { findRoleBySlug } from '@/modules/rbac/rbac.repository';
import { provisionSystemRoles, syncPermissionCatalogue } from '@/modules/rbac/rbac.provisioning';

import * as service from './roles.service';

/**
 * Against the real Postgres. These pin the rules a type checker cannot see: a
 * built-in role stays untouchable, a role in use cannot be deleted out from
 * under its holders, and a role from another tenant is invisible.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-roles-a';
const SLUG_B = 'vitest-roles-b';
const EMAIL_PREFIX = 'vitest-roles-';

// Two real catalogue slugs, whatever they happen to be, so a grant resolves.
const GRANTS = PERMISSION_SLUGS.slice(0, 2) as unknown as string[];

async function cleanup() {
  await db.delete(user).where(like(user.email, `${EMAIL_PREFIX}%`));
  // Roles, userRoles, rolePermissions all cascade from companies.
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function createCompany(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  await syncPermissionCatalogue();
  await provisionSystemRoles(company.id);

  return company;
}

async function createUserWithRole(companyId: string, suffix: string, roleId: string) {
  const [row] = await db
    .insert(user)
    .values({
      name: `Vitest ${suffix}`,
      email: `${EMAIL_PREFIX}${suffix}@nexus.test`,
      emailVerified: true,
      companyId,
      isActive: true,
    })
    .returning();
  if (!row) throw new Error('fixture user failed');

  await db.insert(userRoles).values({ userId: row.id, roleId });

  return row;
}

describe('createRole', () => {
  it('stores the role, a derived slug, and its grants', async () => {
    const company = await createCompany(SLUG_A);

    const role = await service.createRole(company.id, {
      name: 'Finance Lead',
      description: 'Owns the money',
      permissionSlugs: GRANTS,
    });

    const detail = await service.getRole(company.id, role.id);
    expect(detail.slug).toBe('finance-lead');
    expect(detail.isSystem).toBe(false);
    expect([...detail.permissionSlugs].sort()).toEqual([...GRANTS].sort());
  });

  it('gives a second role of the same name a distinct slug', async () => {
    const company = await createCompany(SLUG_A);

    const first = await service.createRole(company.id, {
      name: 'Finance Lead',
      description: null,
      permissionSlugs: [],
    });
    const second = await service.createRole(company.id, {
      name: 'Finance Lead',
      description: null,
      permissionSlugs: [],
    });

    const a = await service.getRole(company.id, first.id);
    const b = await service.getRole(company.id, second.id);
    expect(a.slug).not.toBe(b.slug);
  });
});

describe('system roles are immutable', () => {
  it('refuses to edit a built-in role', async () => {
    const company = await createCompany(SLUG_A);
    const admin = await findRoleBySlug(company.id, 'admin');
    if (!admin) throw new Error('admin role missing');

    await expect(
      service.updateRole(company.id, {
        roleId: admin.id,
        name: 'Tampered',
        description: null,
        permissionSlugs: [],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to delete a built-in role', async () => {
    const company = await createCompany(SLUG_A);
    const admin = await findRoleBySlug(company.id, 'admin');
    if (!admin) throw new Error('admin role missing');

    await expect(service.deleteRole(company.id, admin.id)).rejects.toThrow(ValidationError);
  });
});

describe('deleting a custom role', () => {
  it('is refused while someone still holds it', async () => {
    const company = await createCompany(SLUG_A);
    const role = await service.createRole(company.id, {
      name: 'Finance Lead',
      description: null,
      permissionSlugs: GRANTS,
    });
    await createUserWithRole(company.id, 'holder', role.id);

    await expect(service.deleteRole(company.id, role.id)).rejects.toThrow(ConflictError);
  });

  it('succeeds once no one holds it, as a soft delete', async () => {
    const company = await createCompany(SLUG_A);
    const role = await service.createRole(company.id, {
      name: 'Finance Lead',
      description: null,
      permissionSlugs: GRANTS,
    });

    const deleted = await service.deleteRole(company.id, role.id);
    expect(deleted.id).toBe(role.id);

    const row = await db.query.roles.findFirst({ where: eq(roles.id, role.id) });
    expect(row?.deletedAt).not.toBeNull();
    // Gone from the live listing.
    const list = await service.listRoles(company.id);
    expect(list.find((r) => r.id === role.id)).toBeUndefined();
  });
});

describe('listRoles', () => {
  it('counts only live holders', async () => {
    const company = await createCompany(SLUG_A);
    const role = await service.createRole(company.id, {
      name: 'Finance Lead',
      description: null,
      permissionSlugs: GRANTS,
    });
    const holder = await createUserWithRole(company.id, 'holder', role.id);

    // Soft-delete the holder; the count must drop.
    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, holder.id));

    const list = await service.listRoles(company.id);
    const row = list.find((r) => r.id === role.id);
    expect(row?.userCount).toBe(0);
    expect(row?.permissionCount).toBe(GRANTS.length);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, edit, or delete another company’s role', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const bRole = await service.createRole(b.id, {
      name: 'Finance Lead',
      description: null,
      permissionSlugs: [],
    });

    await expect(service.getRole(a.id, bRole.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateRole(a.id, {
        roleId: bRole.id,
        name: 'Hijacked',
        description: null,
        permissionSlugs: [],
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteRole(a.id, bRole.id)).rejects.toThrow(NotFoundError);

    // And b's role is untouched.
    const stillThere = await service.getRole(b.id, bRole.id);
    expect(stillThere.name).toBe('Finance Lead');
  });
});
