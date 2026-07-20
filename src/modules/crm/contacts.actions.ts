'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './contacts.service';
import { contactFormSchema } from './contacts.validation';

/**
 * Contact Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant comes from the session.
 */

const CONTACTS_PATH = '/dashboard/contacts';

const idSchema = z.object({ contactId: z.uuid() });

export async function createContactAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('contacts:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = contactFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createContact(companyId, parsed.data);
    revalidatePath(CONTACTS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create contact', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const quickCreateContactSchema = z.object({
  clientId: z.uuid({ error: 'Choose a client.' }),
  firstName: z.string().trim().min(1, { error: 'Enter a first name.' }),
});

/**
 * The "+ New contact" item inside another form's client-scoped contact
 * picker (e.g. Opportunities'). `clientId` is required here exactly as it is
 * in `contactFormSchema` — a contact always belongs to the client already
 * chosen in the parent form, never one picked separately in this dialog.
 */
export async function quickCreateContactAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('contacts:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = quickCreateContactSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const values = contactFormSchema.parse({
    clientId: parsed.data.clientId,
    firstName: parsed.data.firstName,
    lastName: '',
    email: '',
    phone: '',
    mobile: '',
    jobTitle: '',
    isPrimary: false,
    notes: '',
  });

  try {
    const created = await service.createContact(companyId, values);
    revalidatePath(CONTACTS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to quick-create contact', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateContactAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('contacts:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.merge(contactFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { contactId, ...values } = parsed.data;

  try {
    await service.updateContact(companyId, contactId, values);
    revalidatePath(CONTACTS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update contact', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteContactAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('contacts:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteContact(companyId, parsed.data.contactId);
    revalidatePath(CONTACTS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete contact', { error, companyId });
    return err(toErrorPayload(error));
  }
}
