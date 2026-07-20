import type { Metadata } from 'next';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { CompanySettingsForm } from '@/modules/companies/components/company-settings-form';
import { DeleteCompanyCard } from '@/modules/companies/components/delete-company-card';
import * as companies from '@/modules/companies/companies.service';

export const metadata: Metadata = { title: 'Company settings' };

/**
 * The auth check lives in this page, not a layout.
 *
 * Layouts do not re-render on client-side navigation, so a check there passes
 * once and is skipped forever after. See MEMORY.md, "Auth architecture".
 */
export default async function CompanySettingsPage() {
  const { companyId } = await requireTenantSession();

  if (!(await can('companies:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view this company's settings. Ask an owner or admin if you need it."
        />
      </main>
    );
  }

  const [company, canEdit, canDelete] = await Promise.all([
    companies.getCompany(companyId),
    can('companies:update'),
    can('companies:delete'),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Company settings</h1>
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? 'Details here appear on every quote, invoice, and purchase order you issue.'
            : 'You have read-only access to these details.'}
        </p>
      </header>

      <CompanySettingsForm company={company} canEdit={canEdit} />

      {canDelete && <DeleteCompanyCard companyName={company.name} />}
    </main>
  );
}
