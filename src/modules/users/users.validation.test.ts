import { describe, expect, it } from 'vitest';

import {
  acceptInvitationSchema,
  inviteUserSchema,
  isUserSortField,
  toUserStatusFilters,
  updateUserSchema,
} from './users.validation';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('inviteUserSchema', () => {
  it('normalises the email so invitations cannot be duplicated by casing', () => {
    const result = inviteUserSchema.safeParse({ email: '  Alex@Example.COM ', roleId: UUID });

    // The pending-invitation uniqueness check compares stored values, so
    // "Alex@" and "alex@" must not be two different invitations.
    expect(result.success && result.data.email).toBe('alex@example.com');
  });

  it('rejects a roleId that is not a uuid', () => {
    expect(inviteUserSchema.safeParse({ email: 'a@b.test', roleId: 'owner' }).success).toBe(false);
  });

  it('rejects a missing role', () => {
    expect(inviteUserSchema.safeParse({ email: 'a@b.test' }).success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('does not accept email or isActive, whatever the caller sends', () => {
    const result = updateUserSchema.safeParse({
      name: 'Alex Moreau',
      jobTitle: '',
      phone: '',
      email: 'attacker@evil.test',
      isActive: false,
    });

    // Zod strips unknown keys. This is the test that the action cannot be talked
    // into moving someone's sign-in address or reactivating them via a profile edit.
    expect(result.success).toBe(true);
    expect(result.success && 'email' in result.data).toBe(false);
    expect(result.success && 'isActive' in result.data).toBe(false);
  });

  it('turns blank optional fields into null', () => {
    const result = updateUserSchema.safeParse({ name: 'Alex Moreau', jobTitle: '', phone: '' });

    expect(result.success && result.data.jobTitle).toBeNull();
    expect(result.success && result.data.phone).toBeNull();
  });
});

describe('acceptInvitationSchema', () => {
  const valid = {
    token: 'a-token',
    name: 'Alex Moreau',
    password: 'correct-horse-battery-staple',
    confirmPassword: 'correct-horse-battery-staple',
  };

  it('accepts a matching pair', () => {
    expect(acceptInvitationSchema.safeParse(valid).success).toBe(true);
  });

  it('reports a mismatch on the confirm field, where it can be fixed', () => {
    const result = acceptInvitationSchema.safeParse({ ...valid, confirmPassword: 'different-password' });

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('rejects a short password', () => {
    expect(
      acceptInvitationSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
  });

  it('rejects an empty token', () => {
    expect(acceptInvitationSchema.safeParse({ ...valid, token: '' }).success).toBe(false);
  });
});

describe('sort and filter allowlists', () => {
  it('accepts known sort fields and rejects everything else', () => {
    expect(isUserSortField('name')).toBe(true);
    expect(isUserSortField('lastLoginAt')).toBe(true);
    // The guard that stops a hand-edited ?sort= reaching the SQL builder.
    expect(isUserSortField('password')).toBe(false);
    expect(isUserSortField(null)).toBe(false);
  });

  it('drops unknown status filters instead of failing', () => {
    expect(toUserStatusFilters(['active', 'nonsense'])).toEqual(['active']);
    expect(toUserStatusFilters([])).toEqual([]);
  });
});
