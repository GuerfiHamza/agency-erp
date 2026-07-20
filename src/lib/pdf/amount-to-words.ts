/**
 * Spell out a money amount in French, e.g. "Mille deux cents dinars algériens".
 *
 * Algerian invoices conventionally carry a "Somme arrêtée à ..." line — the
 * total spelled out, not just shown as digits, so a printed figure can't be
 * altered by adding a digit. This is currency-specific prose (the noun changes
 * with the currency, and pluralizes), so it is only offered for DZD, the one
 * currency this app actually has French wording for. Any other currency simply
 * gets no such line — see `amountToFrenchWords`'s `null` return.
 */

const UNITS = [
  '',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];

const TENS = [
  '',
  '',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre-vingt',
  'quatre-vingt',
];

/** French integer-to-words, standard (non-Belgian/Swiss) counting. */
function intToWords(n: number): string {
  if (n < 0) return `moins ${intToWords(-n)}`;
  if (n === 0) return 'zéro';
  if (n < 20) return UNITS[n]!;

  if (n < 100) {
    const tens = Math.floor(n / 10);
    const unit = n % 10;

    if (tens === 7 || tens === 9) return `${TENS[tens]}-${UNITS[10 + unit]}`;
    if (unit === 0) return TENS[tens]! + (tens === 8 ? 's' : '');
    if (unit === 1 && tens !== 8) return `${TENS[tens]}-et-un`;
    return `${TENS[tens]}-${UNITS[unit]}`;
  }

  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const prefix = hundreds === 1 ? 'cent' : `${intToWords(hundreds)} cent`;
    if (rest === 0) return prefix + (hundreds > 1 ? 's' : '');
    return `${prefix} ${intToWords(rest)}`;
  }

  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const prefix = thousands === 1 ? 'mille' : `${intToWords(thousands)} mille`;
    return rest === 0 ? prefix : `${prefix} ${intToWords(rest)}`;
  }

  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const prefix = `${intToWords(millions)}${millions === 1 ? ' million' : ' millions'}`;
    return rest === 0 ? prefix : `${prefix} ${intToWords(rest)}`;
  }

  const billions = Math.floor(n / 1_000_000_000);
  const rest = n % 1_000_000_000;
  const prefix = `${intToWords(billions)}${billions === 1 ? ' milliard' : ' milliards'}`;
  return rest === 0 ? prefix : `${prefix} ${intToWords(rest)}`;
}

function capitalizeWords(text: string): string {
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * `null` for anything but DZD — there is no French noun/plural mapping here
 * for other currencies, and printing an unlabelled number in words would be
 * worse than omitting the line entirely.
 */
export function amountToFrenchWords(amount: string | number, currency: string): string | null {
  if (currency !== 'DZD') return null;

  const value = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(value) || value < 0) return null;

  const intPart = Math.floor(value);
  const decPart = Math.round((value - intPart) * 100);

  let result = intToWords(intPart);
  result += intPart <= 1 ? ' dinar algérien' : ' dinars algériens';

  if (decPart > 0) {
    result += ` et ${intToWords(decPart)}`;
    result += decPart <= 1 ? ' centime' : ' centimes';
  }

  return capitalizeWords(result);
}
