import { describe, expect, it } from 'vitest';

import { amountToFrenchWords } from './amount-to-words';

describe('amountToFrenchWords', () => {
  it('returns null for anything but DZD', () => {
    expect(amountToFrenchWords(1000, 'EUR')).toBeNull();
    expect(amountToFrenchWords(1000, 'USD')).toBeNull();
  });

  it('spells out a plain integer amount', () => {
    expect(amountToFrenchWords(1200, 'DZD')).toBe('Mille Deux Cents Dinars Algériens');
  });

  it('pluralizes correctly at one and above one', () => {
    expect(amountToFrenchWords(1, 'DZD')).toBe('Un Dinar Algérien');
    expect(amountToFrenchWords(2, 'DZD')).toBe('Deux Dinars Algériens');
  });

  it('includes centimes when the amount has a fractional part', () => {
    expect(amountToFrenchWords(1200.5, 'DZD')).toBe(
      'Mille Deux Cents Dinars Algériens Et Cinquante Centimes',
    );
    expect(amountToFrenchWords(10.01, 'DZD')).toBe('Dix Dinars Algériens Et Un Centime');
  });

  it('handles the soixante-dix / quatre-vingt-dix irregular tens', () => {
    // Capitalization is per space-separated word, matching the reference
    // implementation this was ported from — a hyphenated compound like
    // "soixante-dix" only capitalizes its first syllable.
    expect(amountToFrenchWords(70, 'DZD')).toBe('Soixante-dix Dinars Algériens');
    expect(amountToFrenchWords(90, 'DZD')).toBe('Quatre-vingt-dix Dinars Algériens');
    expect(amountToFrenchWords(80, 'DZD')).toBe('Quatre-vingts Dinars Algériens');
  });

  it('handles thousands and millions', () => {
    expect(amountToFrenchWords(1_000_000, 'DZD')).toBe('Un Million Dinars Algériens');
    // "Cinq cents" pluralizes here even though followed by "mille" — the
    // stricter French rule (no plural on "cent" unless it's the final word)
    // is not implemented, matching the reference implementation exactly.
    expect(amountToFrenchWords(2_500_000, 'DZD')).toBe('Deux Millions Cinq Cents Mille Dinars Algériens');
  });

  it('returns null for a non-finite or negative amount', () => {
    expect(amountToFrenchWords(Number.NaN, 'DZD')).toBeNull();
    expect(amountToFrenchWords(-5, 'DZD')).toBeNull();
  });

  it('accepts a string amount, the shape money columns actually come back as', () => {
    expect(amountToFrenchWords('1200.00', 'DZD')).toBe('Mille Deux Cents Dinars Algériens');
  });
});
