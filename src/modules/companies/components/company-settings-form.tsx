'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { updateCompanyAction } from '../companies.actions';
import type { Company } from '../companies.service';
import {
  updateCompanySchema,
  type UpdateCompanyFormValues,
  type UpdateCompanyInput,
} from '../companies.validation';

interface Props {
  company: Company;
  /** False for a member with `companies:read` but not `companies:update`. */
  canEdit: boolean;
}

const TIMEZONE_LIST_ID = 'company-timezone-options';

/**
 * Computed once at module scope, not per render — the list is identical for
 * every user and never changes within a running build.
 */
const TIMEZONES = Intl.supportedValuesOf('timeZone');

/**
 * Company profile form.
 *
 * The read-only variant is a real state, not an edge case: `manager` and
 * `member` both hold `companies:read` without `companies:update`, so they must
 * see the profile without being handed controls that would only fail.
 */
export function CompanySettingsForm({ company, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdateCompanyFormValues, unknown, UpdateCompanyInput>({
    resolver: zodResolver(updateCompanySchema),
    // The columns are nullable but an input's value cannot be null without
    // React switching it to an uncontrolled field and warning about it.
    defaultValues: {
      name: company.name,
      legalName: company.legalName ?? '',
      taxId: company.taxId ?? '',
      registrationNumber: company.registrationNumber ?? '',
      nif: company.nif ?? '',
      articleNumber: company.articleNumber ?? '',
      activity: company.activity ?? '',
      managerName: company.managerName ?? '',
      documentReferenceCode: company.documentReferenceCode ?? '',
      email: company.email ?? '',
      phone: company.phone ?? '',
      website: company.website ?? '',
      addressLine1: company.addressLine1 ?? '',
      addressLine2: company.addressLine2 ?? '',
      city: company.city ?? '',
      state: company.state ?? '',
      postalCode: company.postalCode ?? '',
      country: company.country ?? '',
      logoUrl: company.logoUrl ?? '',
      defaultCurrency: company.defaultCurrency,
      timezone: company.timezone,
    },
  });

  function onSubmit(values: UpdateCompanyInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await updateCompanyAction(values);

      if (!result.success) {
        setFormError(result.error.message);

        // Field errors from the server land on the fields themselves. Without
        // this, a rule the client copy misses shows up as a banner pointing at
        // nothing in particular.
        for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
          const message = messages[0];
          if (message) form.setError(field as keyof UpdateCompanyFormValues, { message });
        }

        return;
      }

      toast.success('Company profile saved.');
      // Re-baseline the form so isDirty reflects what is now stored, otherwise
      // the save button stays enabled over data that is already saved.
      form.reset(values as UpdateCompanyFormValues);
      router.refresh();
    });
  }

  const disabled = isPending || !canEdit;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Card className="glass">
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              How this company appears on quotes, invoices, and purchase orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company name</FormLabel>
                  <FormControl>
                    <Input autoComplete="organization" disabled={disabled} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legalName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Legal name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nexus Agency SARL"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Used on legal documents when it differs from the trading name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="taxId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="VAT / EIN / SIRET"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="registrationNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="N° d'immatriculation (RC)"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nif"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NIF</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Numéro d'identification fiscale"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="articleNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Article number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="N° d'article d'imposition"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="activity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Activity</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Registered business activity"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="managerName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Manager name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nom et prénom du gérant"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    The legal representative&apos;s full name, when it differs from the trade name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="documentReferenceCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document reference code</FormLabel>
                  <FormControl>
                    <Input placeholder="AM" disabled={disabled} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>
                    Short internal code printed as Réf N°.../code/YY on issued documents.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>Where clients reach this company.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="billing@nexus.test"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://nexus.test"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://nexus.test/logo.png"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Printed at the top of every quote, invoice, and purchase order.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Address</CardTitle>
            <CardDescription>Printed on issued documents.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Address line 1</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="address-line1"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="addressLine2"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Address line 2</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="address-line2"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="address-level2"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State / region</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="address-level1"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postal code</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="postal-code"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="country"
                      placeholder="FR"
                      maxLength={2}
                      className="font-mono uppercase"
                      disabled={disabled}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>Two-letter ISO code.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Regional defaults</CardTitle>
            <CardDescription>
              Applied to new documents. Existing documents keep the currency they were issued in.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="defaultCurrency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default currency</FormLabel>
                  <FormControl>
                    <Input maxLength={3} className="font-mono uppercase" disabled={disabled} {...field} />
                  </FormControl>
                  <FormDescription>Three-letter ISO code, e.g. EUR.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Europe/Paris"
                      disabled={disabled}
                      list={TIMEZONE_LIST_ID}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Drives due dates and reporting boundaries.</FormDescription>
                  <FormMessage />

                  {/* A native datalist: type-ahead over ~400 zones, keyboard and
                      screen-reader support included, and no combobox to own.
                      The options come from the same Intl zone database the
                      schema validates against, so the two cannot disagree. */}
                  <datalist id={TIMEZONE_LIST_ID}>
                    {TIMEZONES.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            {/* Disabled until something actually changed — a save button that is
                always live invites saving nothing and wondering if it worked. */}
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending && <Loader2 className="animate-spin" aria-hidden />}
              {isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
