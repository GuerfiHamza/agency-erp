import { eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, projects, purchaseOrders, suppliers, user } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './purchase-orders.service';
import type { PurchaseOrderInput } from './purchase-orders.validation';

/**
 * Against the real Postgres. Pins number generation, the supplier/project
 * tenant guards, the draft-only edit lock, the send/approve/confirm/receive/
 * cancel transitions (including the derived `partially_received` → `received`
 * status), and the delete-restricted-to-draft/cancelled rule.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-purchase-orders-a';
const SLUG_B = 'vitest-purchase-orders-b';
const SUPPLIER_NAME = 'vitest-purchase-orders-supplier';
const FIXTURE = 'vitest-purchase-orders-';

/** `purchase_orders.supplierId` is `restrict` — clear POs referencing a fixture supplier before deleting it. */
async function cleanup() {
  const fixtureSuppliers = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(like(suppliers.name, `${SUPPLIER_NAME}%`));
  const supplierIds = fixtureSuppliers.map((row) => row.id);

  if (supplierIds.length > 0) {
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.supplierId, supplierIds));
  }

  await db.delete(user).where(like(user.email, `${FIXTURE}%`));
  await db.delete(suppliers).where(like(suppliers.name, `${SUPPLIER_NAME}%`));
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
  const [supplier] = await db
    .insert(suppliers)
    .values({ companyId: company.id, name: SUPPLIER_NAME })
    .returning();
  if (!supplier) throw new Error('fixture supplier failed');

  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, name: 'Warehouse fit-out', code: `PRJ-${slug}-1` })
    .returning();

  return { company, actor: actor!, supplier, project: project! };
}

function base(supplierId: string): PurchaseOrderInput {
  return {
    supplierId,
    projectId: null,
    title: 'Office chairs',
    issueDate: new Date('2026-07-01T00:00:00Z'),
    expectedDate: new Date('2026-08-01T00:00:00Z'),
    currency: 'EUR',
    notes: null,
    terms: null,
    items: [
      { description: 'Design', quantity: '2', unitPrice: '10.00', discountPercent: '10', taxRate: '20' },
    ],
  };
}

/** A single round-numbered line, easy to receive in parts. */
function receiveBase(supplierId: string): PurchaseOrderInput {
  return {
    ...base(supplierId),
    items: [
      { description: 'Widgets', quantity: '10', unitPrice: '5.00', discountPercent: '0', taxRate: '0' },
    ],
  };
}

describe('createPurchaseOrder', () => {
  it('generates a PO-{year}-{seq} number, computes totals, and starts as an unapproved draft', async () => {
    const f = await fixture(SLUG_A);

    const po = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));

    expect(po.number).toMatch(/^PO-\d{4}-0001$/);
    expect(po.total).toBe('21.60');
    expect(po.status).toBe('draft');
    expect(po.approvedAt).toBeNull();
  });
});

describe('link tenant guards', () => {
  it('refuses a supplier from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createPurchaseOrder(a.company.id, a.actor.id, base(b.supplier.id))).rejects.toThrow(
      ValidationError,
    );
  });

  it('refuses a project from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createPurchaseOrder(a.company.id, a.actor.id, {
        ...base(a.supplier.id),
        projectId: b.project.id,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('updatePurchaseOrder', () => {
  it('edits a draft and recomputes totals', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));

    const updated = await service.updatePurchaseOrder(f.company.id, created.id, {
      ...base(f.supplier.id),
      items: [
        { description: 'Design', quantity: '1', unitPrice: '100.00', discountPercent: '0', taxRate: '0' },
      ],
    });

    expect(updated.total).toBe('100.00');
  });

  it('refuses to edit once sent', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);

    await expect(service.updatePurchaseOrder(f.company.id, created.id, base(f.supplier.id))).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('sendPurchaseOrder', () => {
  it('moves a draft to sent and stamps sentAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));

    const sent = await service.sendPurchaseOrder(f.company.id, created.id);

    expect(sent.status).toBe('sent');
    expect(sent.sentAt).not.toBeNull();
  });

  it('refuses to send a non-draft purchase order', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);

    await expect(service.sendPurchaseOrder(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('approvePurchaseOrder', () => {
  it('stamps approvedById and approvedAt on a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));

    const approved = await service.approvePurchaseOrder(f.company.id, f.actor.id, created.id);

    expect(approved.approvedById).toBe(f.actor.id);
    expect(approved.approvedAt).not.toBeNull();
  });

  it('refuses to approve a cancelled purchase order', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.cancelPurchaseOrder(f.company.id, created.id);

    await expect(service.approvePurchaseOrder(f.company.id, f.actor.id, created.id)).rejects.toThrow(
      ConflictError,
    );
  });

  it('refuses to approve twice', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.approvePurchaseOrder(f.company.id, f.actor.id, created.id);

    await expect(service.approvePurchaseOrder(f.company.id, f.actor.id, created.id)).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('confirmPurchaseOrder', () => {
  it('moves a sent purchase order to confirmed', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);

    const confirmed = await service.confirmPurchaseOrder(f.company.id, created.id);

    expect(confirmed.status).toBe('confirmed');
  });

  it('refuses to confirm a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));

    await expect(service.confirmPurchaseOrder(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('receivePurchaseOrder', () => {
  it('partially receiving a line moves status to partially_received with no receivedAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, receiveBase(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);
    const withItems = await service.getPurchaseOrder(f.company.id, created.id);
    const itemId = withItems.items[0]!.id;

    const received = await service.receivePurchaseOrder(f.company.id, created.id, [
      { itemId, quantityReceived: '4' },
    ]);

    expect(received.status).toBe('partially_received');
    expect(received.receivedAt).toBeNull();
    expect(received.items[0]!.quantityReceived).toBe('4.000');
  });

  it('receiving the remainder moves status to received and stamps receivedAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, receiveBase(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);
    const withItems = await service.getPurchaseOrder(f.company.id, created.id);
    const itemId = withItems.items[0]!.id;

    await service.receivePurchaseOrder(f.company.id, created.id, [{ itemId, quantityReceived: '4' }]);
    const received = await service.receivePurchaseOrder(f.company.id, created.id, [
      { itemId, quantityReceived: '6' },
    ]);

    expect(received.status).toBe('received');
    expect(received.receivedAt).not.toBeNull();
    expect(received.items[0]!.quantityReceived).toBe('10.000');
  });

  it('refuses to receive more than was ordered', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, receiveBase(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);
    const withItems = await service.getPurchaseOrder(f.company.id, created.id);
    const itemId = withItems.items[0]!.id;

    await expect(
      service.receivePurchaseOrder(f.company.id, created.id, [{ itemId, quantityReceived: '11' }]),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to receive against a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, receiveBase(f.supplier.id));

    await expect(
      service.receivePurchaseOrder(f.company.id, created.id, [{ itemId: created.id, quantityReceived: '1' }]),
    ).rejects.toThrow(ConflictError);
  });
});

describe('cancelPurchaseOrder', () => {
  it('cancels a sent purchase order', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);

    const cancelled = await service.cancelPurchaseOrder(f.company.id, created.id);

    expect(cancelled.status).toBe('cancelled');
  });

  it('refuses to cancel an already-cancelled purchase order', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.cancelPurchaseOrder(f.company.id, created.id);

    await expect(service.cancelPurchaseOrder(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('deletePurchaseOrder', () => {
  it('deletes a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));

    await service.deletePurchaseOrder(f.company.id, created.id);

    await expect(service.getPurchaseOrder(f.company.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it('deletes a cancelled purchase order', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.cancelPurchaseOrder(f.company.id, created.id);

    await service.deletePurchaseOrder(f.company.id, created.id);

    await expect(service.getPurchaseOrder(f.company.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it('refuses to delete a sent purchase order — a number that was issued can never be recycled', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createPurchaseOrder(f.company.id, f.actor.id, base(f.supplier.id));
    await service.sendPurchaseOrder(f.company.id, created.id);

    await expect(service.deletePurchaseOrder(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s purchase order', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bPurchaseOrder = await service.createPurchaseOrder(b.company.id, b.actor.id, base(b.supplier.id));

    await expect(service.getPurchaseOrder(a.company.id, bPurchaseOrder.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updatePurchaseOrder(a.company.id, bPurchaseOrder.id, base(a.supplier.id)),
    ).rejects.toThrow(NotFoundError);
    await expect(service.deletePurchaseOrder(a.company.id, bPurchaseOrder.id)).rejects.toThrow(NotFoundError);
  });
});
