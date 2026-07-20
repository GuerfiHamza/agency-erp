import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { account, companies, invitations, user } from '@/db/schema';
import { setEmailTransport } from '@/lib/email';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { provisionSystemRoles } from '@/modules/rbac/rbac.provisioning';
import { findRoleBySlug } from '@/modules/rbac/rbac.repository';

import * as service from './users.service';

/**
 * The invitation lifecycle: invite → accept, and every way that must fail.
 *
 * An invitation token is a bearer credential for joining a company, so the
 * expiry, single-use, and hashing rules are the security boundary here — not
 * details. They are tested against the real database because the single-use
 * guarantee *is* a SQL WHERE clause.
 */

const SLUG_A = 'vitest-invite-a';
const SLUG_B = 'vitest-invite-b';
const EMAIL_PREFIX = 'vitest-invite-';
const INVITEE = `${EMAIL_PREFIX}newcomer@nexus.test`;
const PASSWORD = 'correct-horse-battery-staple';

/** Captures the invitation URL instead of sending mail. */
const sent: { to: string; text: string }[] = [];

setEmailTransport({
  name: 'test',
  send: async (message) => {
    sent.push({ to: message.to, text: message.text ?? '' });
  },
});

function tokenFromLastEmail(): string {
  const last = sent.at(-1);
  if (!last) throw new Error('no invitation email was sent');

  const match = last.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`no token in email: ${last.text}`);

  return match[1];
}

async function cleanup() {
  sent.length = 0;
  await db.delete(invitations).where(like(invitations.email, `${EMAIL_PREFIX}%`));
  await db.delete(user).where(like(user.email, `${EMAIL_PREFIX}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function createCompany(slug: string, name = 'Vitest Co') {
  const [company] = await db.insert(companies).values({ name, slug }).returning();
  if (!company) throw new Error('fixture company failed');

  await provisionSystemRoles(company.id);

  const member = await findRoleBySlug(company.id, 'member');
  if (!member) throw new Error('fixture role failed');

  return { company, memberRoleId: member.id };
}

async function createInviter(companyId: string) {
  const [row] = await db
    .insert(user)
    .values({
      name: 'Vitest Inviter',
      email: `${EMAIL_PREFIX}inviter@nexus.test`,
      emailVerified: true,
      companyId,
      isActive: true,
    })
    .returning();

  if (!row) throw new Error('fixture inviter failed');

  return { id: row.id, name: row.name };
}

async function invite(
  companyId: string,
  roleId: string,
  inviter: { id: string; name: string },
  email = INVITEE,
) {
  return service.inviteUser(companyId, 'Vitest Co', inviter, { email, roleId });
}

describe('inviteUser', () => {
  it('sends a link and stores only a hash of the token', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);

    await invite(a.company.id, a.memberRoleId, inviter);
    const token = tokenFromLastEmail();

    const row = await db.query.invitations.findFirst({ where: eq(invitations.email, INVITEE) });

    expect(sent.at(-1)?.to).toBe(INVITEE);
    // A database leak must not hand over working invitation links.
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.acceptedAt).toBeNull();
  });

  it('refuses a second pending invitation to the same address', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);

    await invite(a.company.id, a.memberRoleId, inviter);

    await expect(invite(a.company.id, a.memberRoleId, inviter)).rejects.toThrow(ConflictError);
  });

  it('refuses to invite an existing member of this company', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);

    await expect(
      invite(a.company.id, a.memberRoleId, inviter, `${EMAIL_PREFIX}inviter@nexus.test`),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects a role belonging to another company', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const inviter = await createInviter(a.company.id);

    // Otherwise posting a foreign role id would grant it inside this tenant.
    await expect(invite(a.company.id, b.memberRoleId, inviter)).rejects.toThrow(ValidationError);
  });

  it('lets the same address be re-invited after a revoke', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);

    const first = await invite(a.company.id, a.memberRoleId, inviter);
    await service.revokeInvitation(a.company.id, first.invitationId);

    // The partial unique index covers pending rows only, precisely so this works.
    await expect(invite(a.company.id, a.memberRoleId, inviter)).resolves.toBeDefined();
  });

  it('stops a revoked link from working', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);

    const first = await invite(a.company.id, a.memberRoleId, inviter);
    const token = tokenFromLastEmail();
    await service.revokeInvitation(a.company.id, first.invitationId);

    await expect(service.previewInvitation(token)).rejects.toThrow(NotFoundError);
  });
});

describe('previewInvitation', () => {
  it('describes a valid invitation without requiring a session', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);
    await invite(a.company.id, a.memberRoleId, inviter);

    const preview = await service.previewInvitation(tokenFromLastEmail());

    expect(preview).toMatchObject({ email: INVITEE, companyName: 'Vitest Co', roleName: 'Member' });
  });

  it('rejects a token that was never issued', async () => {
    await expect(service.previewInvitation('not-a-real-token')).rejects.toThrow(NotFoundError);
  });
});

describe('acceptInvitation', () => {
  it('creates a verified user, in the company, with the role, and a working credential', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);
    await invite(a.company.id, a.memberRoleId, inviter);

    await service.acceptInvitation({
      token: tokenFromLastEmail(),
      name: 'Alex Moreau',
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });

    const created = await db.query.user.findFirst({ where: eq(user.email, INVITEE) });
    expect(created?.companyId).toBe(a.company.id);
    // Clicking a link sent to the address is what verification proves.
    expect(created?.emailVerified).toBe(true);
    expect(created?.isActive).toBe(true);

    const credential = await db.query.account.findFirst({ where: eq(account.userId, created!.id) });
    // Better Auth's own sign-up contract: it looks up providerId 'credential'
    // and reads .password. A different shape here means sign-in silently fails.
    expect(credential?.providerId).toBe('credential');
    expect(credential?.accountId).toBe(created!.id);
    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toBe(PASSWORD);

    const page = await service.listUsers(a.company.id, { page: 1, pageSize: 25 });
    const joined = page.items.find((item) => item.email === INVITEE);
    expect(joined?.roles.map((role) => role.slug)).toEqual(['member']);
  });

  it('is single-use', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);
    await invite(a.company.id, a.memberRoleId, inviter);
    const token = tokenFromLastEmail();

    await service.acceptInvitation({ token, name: 'Alex', password: PASSWORD, confirmPassword: PASSWORD });

    await expect(
      service.acceptInvitation({ token, name: 'Impostor', password: PASSWORD, confirmPassword: PASSWORD }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses an expired invitation', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);
    await invite(a.company.id, a.memberRoleId, inviter);
    const token = tokenFromLastEmail();

    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.email, INVITEE));

    await expect(
      service.acceptInvitation({ token, name: 'Alex', password: PASSWORD, confirmPassword: PASSWORD }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses when an account already exists for the address', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const inviter = await createInviter(a.company.id);
    await invite(a.company.id, a.memberRoleId, inviter);
    const token = tokenFromLastEmail();

    // The collision the invite-time check deliberately does not report, because
    // reporting it there would be a cross-tenant oracle.
    await db.insert(user).values({
      name: 'Existing',
      email: INVITEE,
      emailVerified: true,
      companyId: b.company.id,
      isActive: true,
    });

    await expect(
      service.acceptInvitation({ token, name: 'Alex', password: PASSWORD, confirmPassword: PASSWORD }),
    ).rejects.toThrow(ConflictError);
  });

  it('leaves nothing behind when acceptance fails', async () => {
    const a = await createCompany(SLUG_A);
    const inviter = await createInviter(a.company.id);
    await invite(a.company.id, a.memberRoleId, inviter);
    const token = tokenFromLastEmail();

    const insertSpy = vi.spyOn(db, 'transaction');
    insertSpy.mockRejectedValueOnce(new Error('boom'));

    await expect(
      service.acceptInvitation({ token, name: 'Alex', password: PASSWORD, confirmPassword: PASSWORD }),
    ).rejects.toThrow();

    insertSpy.mockRestore();

    // A half-joined account — created but with no role, or an invitation marked
    // used with no user — is the failure this transaction exists to prevent.
    const orphan = await db.query.user.findFirst({ where: eq(user.email, INVITEE) });
    const invitation = await db.query.invitations.findFirst({ where: eq(invitations.email, INVITEE) });

    expect(orphan).toBeUndefined();
    expect(invitation?.acceptedAt).toBeNull();
  });
});
