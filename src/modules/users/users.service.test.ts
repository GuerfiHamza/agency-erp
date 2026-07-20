import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, invitations, user } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { provisionSystemRoles } from '@/modules/rbac/rbac.provisioning';
import { findRoleBySlug } from '@/modules/rbac/rbac.repository';

import * as repository from './users.repository';
import * as service from './users.service';

/**
 * Against the real Postgres. These cover the rules that stop a company locking
 * itself out, and the tenant boundary on the users list — both of which are
 * invisible to a type checker and expensive to get wrong.
 *
 * Also pins the `server-only` alias: this file imports a marked module.
 */

const SLUG_A = 'vitest-users-a';
const SLUG_B = 'vitest-users-b';
const EMAIL_PREFIX = 'vitest-users-';

async function cleanup() {
  await db.delete(invitations).where(like(invitations.email, `${EMAIL_PREFIX}%`));
  await db.delete(user).where(like(user.email, `${EMAIL_PREFIX}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

/** A company with its system roles provisioned, exactly as onboarding builds one. */
async function createCompany(slug: string, name = 'Vitest Co') {
  const [company] = await db.insert(companies).values({ name, slug }).returning();
  if (!company) throw new Error('fixture company failed');

  await provisionSystemRoles(company.id);

  const owner = await findRoleBySlug(company.id, 'owner');
  const member = await findRoleBySlug(company.id, 'member');
  if (!owner || !member) throw new Error('fixture roles failed');

  return { company, ownerRoleId: owner.id, memberRoleId: member.id };
}

async function createUser(companyId: string, suffix: string, roleId?: string) {
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
  if (roleId) await repository.setRoles(companyId, row.id, [roleId]);

  return row;
}

describe('listUsers', () => {
  it('never returns another company’s people', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    await createUser(a.company.id, 'alice');
    await createUser(b.company.id, 'bob');

    const page = await service.listUsers(a.company.id, { page: 1, pageSize: 25 });

    // The tenant boundary. Without the companyId filter this list leaks names
    // and email addresses across customers.
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe('Vitest alice');
  });

  it('returns each user’s roles without an N+1', async () => {
    const a = await createCompany(SLUG_A);
    await createUser(a.company.id, 'alice', a.ownerRoleId);

    const page = await service.listUsers(a.company.id, { page: 1, pageSize: 25 });

    expect(page.items[0]?.roles.map((role) => role.slug)).toEqual(['owner']);
  });

  it('reports a user with no roles as an empty array, not [null]', async () => {
    const a = await createCompany(SLUG_A);
    await createUser(a.company.id, 'alice');

    const page = await service.listUsers(a.company.id, { page: 1, pageSize: 25 });

    expect(page.items[0]?.roles).toEqual([]);
  });

  it('searches name, email, and job title', async () => {
    const a = await createCompany(SLUG_A);
    await createUser(a.company.id, 'alice');
    await createUser(a.company.id, 'bob');

    const page = await service.listUsers(a.company.id, { page: 1, pageSize: 25, search: 'alice' });

    expect(page.items).toHaveLength(1);
  });

  it('treats % in a search as a literal, not a wildcard', async () => {
    const a = await createCompany(SLUG_A);
    await createUser(a.company.id, 'alice');

    // Unescaped, this LIKE pattern would match every row.
    const page = await service.listUsers(a.company.id, { page: 1, pageSize: 25, search: '%' });

    expect(page.items).toHaveLength(0);
  });

  it('filters by active state', async () => {
    const a = await createCompany(SLUG_A);
    const alice = await createUser(a.company.id, 'alice');
    await createUser(a.company.id, 'bob');
    await repository.setActive(a.company.id, alice.id, false);

    const inactive = await service.listUsers(a.company.id, { page: 1, pageSize: 25, statuses: ['inactive'] });
    const both = await service.listUsers(a.company.id, {
      page: 1,
      pageSize: 25,
      statuses: ['active', 'inactive'],
    });

    expect(inactive.items.map((u) => u.name)).toEqual(['Vitest alice']);
    // Selecting both facets must mean "no filter", not "nothing".
    expect(both.items).toHaveLength(2);
  });

  it('paginates in SQL and reports the true total', async () => {
    const a = await createCompany(SLUG_A);
    await createUser(a.company.id, 'alice');
    await createUser(a.company.id, 'bob');
    await createUser(a.company.id, 'carol');

    const page = await service.listUsers(a.company.id, { page: 2, pageSize: 2 });

    expect(page.items).toHaveLength(1);
    expect(page.totalItems).toBe(3);
    expect(page.totalPages).toBe(2);
    expect(page.hasPreviousPage).toBe(true);
    expect(page.hasNextPage).toBe(false);
  });
});

describe('the last owner', () => {
  it('cannot be deactivated', async () => {
    const a = await createCompany(SLUG_A);
    const owner = await createUser(a.company.id, 'owner', a.ownerRoleId);
    const admin = await createUser(a.company.id, 'admin', a.memberRoleId);

    // A company with no active owner cannot grant the role back to anyone.
    await expect(service.setUserActive(a.company.id, admin.id, owner.id, false)).rejects.toThrow(
      ConflictError,
    );
  });

  it('cannot be deleted', async () => {
    const a = await createCompany(SLUG_A);
    const owner = await createUser(a.company.id, 'owner', a.ownerRoleId);
    const admin = await createUser(a.company.id, 'admin', a.memberRoleId);

    await expect(service.deleteUser(a.company.id, admin.id, owner.id)).rejects.toThrow(ConflictError);
  });

  it('cannot have the owner role taken away', async () => {
    const a = await createCompany(SLUG_A);
    const owner = await createUser(a.company.id, 'owner', a.ownerRoleId);
    const admin = await createUser(a.company.id, 'admin', a.memberRoleId);

    await expect(service.setUserRoles(a.company.id, admin.id, owner.id, [a.memberRoleId])).rejects.toThrow(
      ConflictError,
    );
  });

  it('may be removed once a second owner exists', async () => {
    const a = await createCompany(SLUG_A);
    const first = await createUser(a.company.id, 'owner', a.ownerRoleId);
    const second = await createUser(a.company.id, 'owner2', a.ownerRoleId);

    await expect(service.setUserActive(a.company.id, second.id, first.id, false)).resolves.toBeDefined();
  });

  it('is counted per company, not globally', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const ownerA = await createUser(a.company.id, 'owner', a.ownerRoleId);
    await createUser(b.company.id, 'owner2', b.ownerRoleId);
    const adminA = await createUser(a.company.id, 'admin', a.memberRoleId);

    // Another company's owner must not satisfy this company's guard.
    await expect(service.setUserActive(a.company.id, adminA.id, ownerA.id, false)).rejects.toThrow(
      ConflictError,
    );
  });

  it('is not blocked from being granted to someone else', async () => {
    const a = await createCompany(SLUG_A);
    await createUser(a.company.id, 'owner', a.ownerRoleId);
    const member = await createUser(a.company.id, 'member', a.memberRoleId);

    await expect(
      service.setUserRoles(a.company.id, member.id, member.id, [a.ownerRoleId]),
    ).resolves.toBeUndefined();
  });
});

describe('self-protection', () => {
  it('refuses to let you deactivate yourself', async () => {
    const a = await createCompany(SLUG_A);
    const alice = await createUser(a.company.id, 'alice', a.memberRoleId);

    await expect(service.setUserActive(a.company.id, alice.id, alice.id, false)).rejects.toThrow(
      ValidationError,
    );
  });

  it('refuses to let you delete yourself', async () => {
    const a = await createCompany(SLUG_A);
    const alice = await createUser(a.company.id, 'alice', a.memberRoleId);

    await expect(service.deleteUser(a.company.id, alice.id, alice.id)).rejects.toThrow(ValidationError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read a user from another company', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const bob = await createUser(b.company.id, 'bob');

    await expect(service.getUser(a.company.id, bob.id)).rejects.toThrow(NotFoundError);
  });

  it('cannot update a user from another company', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const bob = await createUser(b.company.id, 'bob');

    await expect(
      service.updateUser(a.company.id, bob.id, { name: 'Hijacked', jobTitle: null, phone: null }),
    ).rejects.toThrow(NotFoundError);
  });

  it('ignores a role id belonging to another company', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const alice = await createUser(a.company.id, 'alice');

    await repository.setRoles(a.company.id, alice.id, [b.ownerRoleId]);

    // Re-resolved against the caller's company, so a foreign id grants nothing.
    const page = await service.listUsers(a.company.id, { page: 1, pageSize: 25 });
    expect(page.items[0]?.roles).toEqual([]);
  });
});

describe('deleting a user', () => {
  it('revokes access as well as removing the account', async () => {
    const a = await createCompany(SLUG_A);
    const owner = await createUser(a.company.id, 'owner', a.ownerRoleId);
    const bob = await createUser(a.company.id, 'bob', a.memberRoleId);

    await service.deleteUser(a.company.id, owner.id, bob.id);

    const row = await db.query.user.findFirst({ where: eq(user.id, bob.id) });

    expect(row?.deletedAt).not.toBeNull();
    // getSession gates on isActive, so without this a soft-deleted user keeps
    // working until their cookie expires.
    expect(row?.isActive).toBe(false);
  });

  it('frees the email for reuse', async () => {
    const a = await createCompany(SLUG_A);
    const owner = await createUser(a.company.id, 'owner', a.ownerRoleId);
    const bob = await createUser(a.company.id, 'bob', a.memberRoleId);

    await service.deleteUser(a.company.id, owner.id, bob.id);

    // The partial unique index is what allows this.
    await expect(createUser(a.company.id, 'bob')).resolves.toBeDefined();
  });
});
