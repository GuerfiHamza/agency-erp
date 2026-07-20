import 'server-only';

import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './suppliers.repository';
import type { SupplierInput } from './suppliers.validation';

/**
 * Supplier rules.
 *
 * Thin by design, same posture as Clients: a supplier is a plain record with
 * no cross-tenant invariants of its own. Tenant scoping lives in the
 * repository; this layer adds the "missing reads as an error" contract and
 * the audit log.
 *
 * `purchase-orders.repository.ts` still queries `suppliers` directly rather
 * than through this service — it was written before this module existed,
 * the same posture Quotes/Invoices had toward `clients` pre-Module-5. There
 * is no obligation to route it through here now that this module exists.
 */

export type { SupplierRow, ListSuppliersQuery } from './suppliers.repository';

export async function listSuppliers(companyId: string, query: repository.ListSuppliersQuery) {
  return repository.listSuppliers(companyId, query);
}

export async function getSupplier(companyId: string, supplierId: string) {
  const found = await repository.findById(companyId, supplierId);

  if (!found) throw new NotFoundError('Supplier not found.');

  return found;
}

export async function createSupplier(companyId: string, input: SupplierInput) {
  const created = await repository.create(companyId, input);

  logger.info('Supplier created', { companyId, supplierId: created.id });

  return created;
}

export async function updateSupplier(companyId: string, supplierId: string, input: SupplierInput) {
  const updated = await repository.update(companyId, supplierId, input);

  if (!updated) throw new NotFoundError('Supplier not found.');

  logger.info('Supplier updated', { companyId, supplierId });

  return updated;
}

export async function deleteSupplier(companyId: string, supplierId: string) {
  const deleted = await repository.softDelete(companyId, supplierId);

  if (!deleted) throw new NotFoundError('Supplier not found.');

  logger.info('Supplier deleted', { companyId, supplierId });

  return deleted;
}
