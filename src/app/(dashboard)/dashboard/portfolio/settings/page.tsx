import type { Metadata } from 'next';

import { ErrorState } from '@/components/ui/states';
import { clientEnv } from '@/config/env';
import { can, requireTenantSession } from '@/lib/auth/session';
import { ApiDocsCard } from '@/modules/portfolio/components/api-docs-card';
import { ApiKeyCard } from '@/modules/portfolio/components/api-key-card';
import { CatalogueManager } from '@/modules/portfolio/components/catalogue-manager';
import {
  createCategoryAction,
  createTechnologyAction,
  deleteCategoryAction,
  deleteTechnologyAction,
  updateCategoryAction,
  updateTechnologyAction,
} from '@/modules/portfolio/portfolio.actions';
import * as portfolio from '@/modules/portfolio/portfolio.service';

export const metadata: Metadata = { title: 'Portfolio settings' };

/** Technology and category catalogues, plus the public API key and its docs. */
export default async function PortfolioSettingsPage() {
  const { companyId } = await requireTenantSession();

  if (!(await can('portfolio:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view portfolio settings in this workspace."
        />
      </main>
    );
  }

  const [canCreate, canUpdate, canDelete, technologies, categories, hasKey] = await Promise.all([
    can('portfolio:create'),
    can('portfolio:update'),
    can('portfolio:delete'),
    portfolio.listTechnologies(companyId),
    portfolio.listCategories(companyId),
    portfolio.hasApiKey(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio settings</h1>
        <p className="text-sm text-muted-foreground">
          The catalogues projects are tagged with, and the key neodott.com uses to read them.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <CatalogueManager
          title="Technologies"
          description="WordPress, Laravel, HTML, and so on — pick per project."
          items={technologies}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onCreate={createTechnologyAction}
          onUpdate={updateTechnologyAction}
          onDelete={deleteTechnologyAction}
        />

        <CatalogueManager
          title="Categories"
          description="One per project — e.g. Web design, E-commerce."
          items={categories}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onCreate={createCategoryAction}
          onUpdate={updateCategoryAction}
          onDelete={deleteCategoryAction}
        />
      </div>

      <ApiKeyCard hasKey={hasKey} canManage={canUpdate} />

      <ApiDocsCard baseUrl={clientEnv.NEXT_PUBLIC_APP_URL} />
    </main>
  );
}
