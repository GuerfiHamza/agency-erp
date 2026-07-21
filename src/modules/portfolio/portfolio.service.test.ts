import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, portfolioCategories, portfolioProjects, portfolioTechnologies } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './portfolio.service';
import type { ProjectInput } from './portfolio.validation';

/**
 * Against the real Postgres — pins the tenant guards, the storage-key scope
 * check, and the replace-on-edit technology links, none of which a type
 * checker can see.
 */

const SLUG_A = 'vitest-portfolio-a';
const SLUG_B = 'vitest-portfolio-b';
const NAME_PREFIX = 'vitest-portfolio-';

async function cleanup() {
  await db.delete(portfolioProjects).where(like(portfolioProjects.title, `${NAME_PREFIX}%`));
  await db.delete(portfolioTechnologies).where(like(portfolioTechnologies.name, `${NAME_PREFIX}%`));
  await db.delete(portfolioCategories).where(like(portfolioCategories.name, `${NAME_PREFIX}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function createCompany(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');
  return company;
}

function baseInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    title: `${NAME_PREFIX}site`,
    shortDescription: 'A short description.',
    aboutDescription: null,
    categoryId: null,
    mainImageKey: null,
    websiteUrl: null,
    isLive: false,
    status: 'draft',
    technologyIds: [],
    ...overrides,
  };
}

describe('createProject', () => {
  it('generates a unique slug from the title', async () => {
    const company = await createCompany(SLUG_A);

    const first = await service.createProject(company.id, baseInput());
    const second = await service.createProject(company.id, baseInput());

    expect(first.slug).toBe('vitest-portfolio-site');
    expect(second.slug).toBe('vitest-portfolio-site-2');
  });

  it('rejects a category from another company', async () => {
    const companyA = await createCompany(SLUG_A);
    const companyB = await createCompany(SLUG_B);

    const category = await service.createCategory(companyB.id, `${NAME_PREFIX}branding`);

    await expect(service.createProject(companyA.id, baseInput({ categoryId: category.id }))).rejects.toThrow(
      ValidationError,
    );
  });

  it('rejects a technology from another company', async () => {
    const companyA = await createCompany(SLUG_A);
    const companyB = await createCompany(SLUG_B);

    const technology = await service.createTechnology(companyB.id, `${NAME_PREFIX}wordpress`);

    await expect(
      service.createProject(companyA.id, baseInput({ technologyIds: [technology.id] })),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a storage key outside this company/portfolio prefix', async () => {
    const company = await createCompany(SLUG_A);

    await expect(
      service.createProject(company.id, baseInput({ mainImageKey: 'someone-else/portfolio/x.png' })),
    ).rejects.toThrow(ValidationError);

    await expect(
      service.createProject(company.id, baseInput({ mainImageKey: `${company.id}/documents/x.png` })),
    ).rejects.toThrow(ValidationError);
  });

  it('links the given technologies and replaces them on update', async () => {
    const company = await createCompany(SLUG_A);

    const wordpress = await service.createTechnology(company.id, `${NAME_PREFIX}wordpress`);
    const html = await service.createTechnology(company.id, `${NAME_PREFIX}html`);

    const created = await service.createProject(company.id, baseInput({ technologyIds: [wordpress.id] }));

    const withTech = await service.getProject(company.id, created.id);
    expect(withTech.technologies.map((technology) => technology.id)).toEqual([wordpress.id]);

    await service.updateProject(company.id, created.id, baseInput({ technologyIds: [html.id] }));

    const afterUpdate = await service.getProject(company.id, created.id);
    expect(afterUpdate.technologies.map((technology) => technology.id)).toEqual([html.id]);
  });
});

describe('cross-tenant access', () => {
  it('cannot read or update another company’s project', async () => {
    const companyA = await createCompany(SLUG_A);
    const companyB = await createCompany(SLUG_B);

    const created = await service.createProject(companyA.id, baseInput());

    await expect(service.getProject(companyB.id, created.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateProject(companyB.id, created.id, baseInput())).rejects.toThrow(NotFoundError);
  });
});

describe('portfolio API key', () => {
  it('verifies the exact key just generated and rejects a wrong one', async () => {
    const company = await createCompany(SLUG_A);

    expect(await service.hasApiKey(company.id)).toBe(false);

    const key = await service.regenerateApiKey(company.id);

    expect(await service.hasApiKey(company.id)).toBe(true);
    expect(await service.verifyApiKey(company.id, key)).toBe(true);
    expect(await service.verifyApiKey(company.id, 'wrong-key')).toBe(false);
  });

  it('regenerating invalidates the previous key', async () => {
    const company = await createCompany(SLUG_A);

    const first = await service.regenerateApiKey(company.id);
    const second = await service.regenerateApiKey(company.id);

    expect(await service.verifyApiKey(company.id, first)).toBe(false);
    expect(await service.verifyApiKey(company.id, second)).toBe(true);
  });
});
