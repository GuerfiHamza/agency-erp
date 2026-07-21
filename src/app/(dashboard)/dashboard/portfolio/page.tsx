import Link from 'next/link';
import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { ProjectsTable } from '@/modules/portfolio/components/projects-table';
import * as portfolio from '@/modules/portfolio/portfolio.service';
import { isPortfolioSortField, toPortfolioStatusFilters } from '@/modules/portfolio/portfolio.validation';

export const metadata: Metadata = { title: 'Portfolio' };

/**
 * The public-website portfolio: projects shown on neodott.com, pulled
 * through the API documented at `/dashboard/portfolio/settings`.
 */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('portfolio:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view the portfolio in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('portfolio:create'),
    can('portfolio:update'),
    can('portfolio:delete'),
  ]);

  const [page, categoryOptions, technologyOptions] = await Promise.all([
    portfolio.listProjects(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isPortfolioSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toPortfolioStatusFilters(params.status),
    }),
    portfolio.listCategories(companyId),
    portfolio.listTechnologies(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Projects shown on the public website. Only published projects reach the API.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/portfolio/settings">Technologies, categories &amp; API</Link>
        </Button>
      </header>

      <ProjectsTable
        projects={page.items}
        totalItems={page.totalItems}
        categoryOptions={categoryOptions}
        technologyOptions={technologyOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}
