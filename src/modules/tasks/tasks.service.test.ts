import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, projects, user } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './tasks.service';
import type { TaskInput } from './tasks.validation';

/**
 * Against the real Postgres. Pins the project tenant guard, author attribution,
 * the completedAt rule (set/preserve/reopen), and cross-tenant scoping.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-tasks-a';
const SLUG_B = 'vitest-tasks-b';
const FIXTURE = 'vitest-tasks-';

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
  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, name: 'Website', code: `PRJ-${slug}-1` })
    .returning();

  return { company, actor: actor!, project: project! };
}

function base(projectId: string, overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    projectId,
    title: 'Design homepage',
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    estimatedHours: null,
    startDate: null,
    dueDate: null,
    ...overrides,
  };
}

describe('createTask', () => {
  it('attributes the author and derives completedAt from status', async () => {
    const f = await fixture(SLUG_A);

    const todo = await service.createTask(f.company.id, f.actor.id, base(f.project.id));
    expect(todo.createdById).toBe(f.actor.id);
    expect(todo.completedAt).toBeNull();

    const done = await service.createTask(f.company.id, f.actor.id, base(f.project.id, { status: 'done' }));
    expect(done.completedAt).not.toBeNull();
  });
});

describe('completedAt derivation', () => {
  it('sets on done, preserves across edits, clears on reopen', async () => {
    const f = await fixture(SLUG_A);
    const task = await service.createTask(f.company.id, f.actor.id, base(f.project.id));

    const done = await service.updateTask(f.company.id, task.id, base(f.project.id, { status: 'done' }));
    const completedAt = done.completedAt;
    expect(completedAt).not.toBeNull();

    const edited = await service.updateTask(
      f.company.id,
      task.id,
      base(f.project.id, { status: 'done', title: 'Design homepage v2' }),
    );
    expect(edited.completedAt?.getTime()).toBe(completedAt?.getTime());

    const reopened = await service.updateTask(
      f.company.id,
      task.id,
      base(f.project.id, { status: 'in_progress' }),
    );
    expect(reopened.completedAt).toBeNull();
  });
});

describe('project scoping', () => {
  it('refuses a project from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createTask(a.company.id, a.actor.id, base(b.project.id))).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s task', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bTask = await service.createTask(b.company.id, b.actor.id, base(b.project.id));

    await expect(service.getTask(a.company.id, bTask.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateTask(a.company.id, bTask.id, base(a.project.id))).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.deleteTask(a.company.id, bTask.id)).rejects.toThrow(NotFoundError);
  });
});
