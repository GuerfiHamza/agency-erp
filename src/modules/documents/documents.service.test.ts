import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, projects, tasks, user } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './documents.service';
import type { DocumentCreateInput } from './documents.validation';

/**
 * Against the real Postgres. Pins the two policies that are not visible in the
 * schema: the storage key must belong to this tenant, and an attachment target
 * must too (the foreign key proves the row exists, not that it is ours).
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-documents-a';
const SLUG_B = 'vitest-documents-b';
const FIXTURE = 'vitest-documents-';

async function cleanup() {
  await db.delete(user).where(like(user.email, `${FIXTURE}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [actor] = await db
    .insert(user)
    .values({
      name: 'Actor',
      email: `${FIXTURE}${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();
  const [client] = await db.insert(clients).values({ companyId: company.id, name: 'Acme' }).returning();
  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, name: 'Website', code: `PRJ-${slug}-1` })
    .returning();
  const [task] = await db
    .insert(tasks)
    .values({ companyId: company.id, projectId: project!.id, title: 'Design homepage' })
    .returning();

  return { company, actor: actor!, client: client!, project: project!, task: task! };
}

function base(companyId: string, overrides: Partial<DocumentCreateInput> = {}): DocumentCreateInput {
  return {
    name: 'Signed contract',
    type: 'contract',
    description: null,
    attachKind: 'none',
    attachId: null,
    storageKey: `${companyId}/documents/contract.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    ...overrides,
  };
}

describe('storage key ownership', () => {
  it('rejects a key outside the caller’s tenant prefix', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createDocument(a.company.id, a.actor.id, base(b.company.id))).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('attachment resolution', () => {
  it('resolves each kind to exactly one foreign key', async () => {
    const f = await fixture(SLUG_A);

    const toClient = await service.createDocument(
      f.company.id,
      f.actor.id,
      base(f.company.id, { attachKind: 'client', attachId: f.client.id }),
    );
    expect(toClient.clientId).toBe(f.client.id);
    expect(toClient.projectId).toBeNull();
    expect(toClient.taskId).toBeNull();

    const toTask = await service.createDocument(
      f.company.id,
      f.actor.id,
      base(f.company.id, { attachKind: 'task', attachId: f.task.id }),
    );
    expect(toTask.taskId).toBe(f.task.id);
    expect(toTask.clientId).toBeNull();

    const unattached = await service.createDocument(f.company.id, f.actor.id, base(f.company.id));
    expect(unattached.clientId).toBeNull();
    expect(unattached.projectId).toBeNull();
    expect(unattached.taskId).toBeNull();
    expect(unattached.uploadedById).toBe(f.actor.id);
  });

  it('refuses a target from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createDocument(
        a.company.id,
        a.actor.id,
        base(a.company.id, { attachKind: 'project', attachId: b.project.id }),
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe('updateDocument', () => {
  it('changes the details and re-points the attachment, never the stored bytes', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createDocument(
      f.company.id,
      f.actor.id,
      base(f.company.id, { attachKind: 'client', attachId: f.client.id }),
    );

    const updated = await service.updateDocument(f.company.id, created.id, {
      name: 'Signed contract v2',
      type: 'brief',
      description: null,
      attachKind: 'project',
      attachId: f.project.id,
    });

    expect(updated.name).toBe('Signed contract v2');
    expect(updated.projectId).toBe(f.project.id);
    expect(updated.clientId).toBeNull();
    expect(updated.storageKey).toBe(created.storageKey);
    expect(updated.sizeBytes).toBe(created.sizeBytes);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s document', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bDoc = await service.createDocument(b.company.id, b.actor.id, base(b.company.id));

    const details = {
      name: 'Stolen',
      type: 'other',
      description: null,
      attachKind: 'none',
      attachId: null,
    } as const;

    await expect(service.getDocument(a.company.id, bDoc.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateDocument(a.company.id, bDoc.id, details)).rejects.toThrow(NotFoundError);
    await expect(service.deleteDocument(a.company.id, bDoc.id)).rejects.toThrow(NotFoundError);
  });
});
