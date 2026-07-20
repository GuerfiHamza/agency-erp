import { describe, expect, it } from 'vitest';

import { updateCompanySchema } from './companies.validation';

/**
 * The schema is the trust boundary for a public endpoint, so these tests are
 * about what it *rejects* and what it *normalises* — not that Zod works.
 */

const valid = {
  name: 'Nexus Agency',
  legalName: '',
  taxId: '',
  registrationNumber: '',
  nif: '',
  articleNumber: '',
  activity: '',
  managerName: '',
  documentReferenceCode: '',
  email: '',
  phone: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  logoUrl: '',
  defaultCurrency: 'usd',
  timezone: 'Europe/Paris',
};

function parse(overrides: Partial<typeof valid> = {}) {
  return updateCompanySchema.safeParse({ ...valid, ...overrides });
}

describe('updateCompanySchema', () => {
  it('accepts a minimal profile', () => {
    expect(parse().success).toBe(true);
  });

  it('turns untouched optional fields into null, not empty strings', () => {
    const result = parse();

    // The whole point of `optionalText`: `taxId IS NULL` must keep meaning
    // "never filled in" after someone opens the form and saves it unchanged.
    expect(result.success && result.data.taxId).toBeNull();
    expect(result.success && result.data.legalName).toBeNull();
    expect(result.success && result.data.email).toBeNull();
    expect(result.success && result.data.website).toBeNull();
    expect(result.success && result.data.country).toBeNull();
  });

  it('uppercases currency and country to match the char() columns', () => {
    const result = parse({ defaultCurrency: 'eur', country: 'fr' });

    expect(result.success && result.data.defaultCurrency).toBe('EUR');
    expect(result.success && result.data.country).toBe('FR');
  });

  it('trims a name rather than storing the padding', () => {
    const result = parse({ name: '  Nexus Agency  ' });

    expect(result.success && result.data.name).toBe('Nexus Agency');
  });

  it('rejects a name that is only whitespace', () => {
    // Trim runs first, so this is a 0-character name, not a 6-character one.
    expect(parse({ name: '      ' }).success).toBe(false);
  });

  it.each([
    ['country that is not alpha-2', { country: 'FRA' }],
    ['currency that is not alpha-3', { defaultCurrency: 'EU' }],
    ['email without a host', { email: 'billing@' }],
    ['website without a scheme', { website: 'nexus.test' }],
  ])('rejects a %s', (_label, overrides) => {
    expect(parse(overrides).success).toBe(false);
  });

  it('rejects a timezone the runtime cannot format with', () => {
    // The failure this prevents: an unknown zone stored happily, then throwing
    // a RangeError later inside Intl when an invoice due date is rendered.
    expect(parse({ timezone: 'Mars/Olympus_Mons' }).success).toBe(false);
    expect(parse({ timezone: 'America/New_York' }).success).toBe(true);
  });
});
