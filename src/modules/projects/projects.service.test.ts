import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, projects } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './projects.service';
import type { ProjectInput } from './projects.validation';

/**
 * Against the real Postgres. Pins the auto-generated unique code, the
 * completedAt rule (set/preserve/reopen), the client tenant guard (internal
 * projects allowed), and cross-tenant scoping.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-projects-a';
const SLUG_B = 'vitest-projects-b';
const PROJECT_NAME = 'vitest-project-';
const CLIENT_NAME = 'vitest-project-client';

async function cleanup() {
  await db.delete(projects).where(like(projects.name, `${PROJECT_NAME}%`));
  await db.delete(clients).where(like(clients.name, `${CLIENT_NAME}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [client] = await db.insert(clients).values({ companyId: company.id, name: CLIENT_NAME }).returning();
  if (!client) throw new Error('fixture client failed');

  return { company, client: client! };
}

function base(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: `${PROJECT_NAME}site`,
    clientId: null,
    description: null,
    status: 'planning',
    priority: 'medium',
    billingType: 'fixed_price',
    budget: null,
    hourlyRate: null,
    estimatedHours: null,
    currency: null,
    startDate: null,
    endDate: null,
    managerId: null,
    ...overrides,
  };
}

describe('code generation', () => {
  it('assigns a PRJ code and gives each project a distinct one', async () => {
    const { company } = await fixture(SLUG_A);

    const first = await service.createProject(company.id, base());
    const second = await service.createProject(company.id, base({ name: `${PROJECT_NAME}two` }));

    expect(first.code).toMatch(/^PRJ-\d{4}-\d{3}$/);
    expect(second.code).not.toBe(first.code);
  });
});

describe('completedAt derivation', () => {
  it('is null while active and set when completed', async () => {
    const { company } = await fixture(SLUG_A);

    const planning = await service.createProject(company.id, base({ status: 'planning' }));
    expect(planning.completedAt).toBeNull();

    const done = await service.createProject(
      company.id,
      base({ name: `${PROJECT_NAME}x`, status: 'completed' }),
    );
    expect(done.completedAt).not.toBeNull();
  });

  it('preserves the completion date across edits and clears it on reopen', async () => {
    const { company } = await fixture(SLUG_A);
    const project = await service.createProject(company.id, base());

    const done = await service.updateProject(company.id, project.id, base({ status: 'completed' }));
    const completedAt = done.completedAt;
    expect(completedAt).not.toBeNull();

    const renamed = await service.updateProject(
      company.id,
      project.id,
      base({ status: 'completed', name: `${PROJECT_NAME}renamed` }),
    );
    expect(renamed.completedAt?.getTime()).toBe(completedAt?.getTime());

    const reopened = await service.updateProject(company.id, project.id, base({ status: 'active' }));
    expect(reopened.completedAt).toBeNull();
  });
});

describe('client scoping', () => {
  it('allows an internal project with no client', async () => {
    const { company } = await fixture(SLUG_A);
    const project = await service.createProject(company.id, base({ clientId: null }));
    expect(project.clientId).toBeNull();
  });

  it('refuses a client from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createProject(a.company.id, base({ clientId: b.client.id }))).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s project', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bProject = await service.createProject(b.company.id, base());

    await expect(service.getProject(a.company.id, bProject.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateProject(a.company.id, bProject.id, base())).rejects.toThrow(NotFoundError);
    await expect(service.deleteProject(a.company.id, bProject.id)).rejects.toThrow(NotFoundError);
  });
});
