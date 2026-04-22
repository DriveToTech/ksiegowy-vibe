/**
 * Polish number-to-words (słownie) for invoice amounts.
 * Handles PLN amounts up to 999,999,999.99.
 * Grammatical gender: złoty (masculine), grosz (masculine).
 */

const ONES = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const TEENS = [
  'dziesięć',
  'jedenaście',
  'dwanaście',
  'trzynaście',
  'czternaście',
  'piętnaście',
  'szesnaście',
  'siedemnaście',
  'osiemnaście',
  'dziewiętnaście'
];
const TENS = [
  '',
  'dziesięć',
  'dwadzieścia',
  'trzydzieści',
  'czterdzieści',
  'pięćdziesiąt',
  'sześćdziesiąt',
  'siedemdziesiąt',
  'osiemdziesiąt',
  'dziewięćdziesiąt'
];
const HUNDREDS = [
  '',
  'sto',
  'dwieście',
  'trzysta',
  'czterysta',
  'pięćset',
  'sześćset',
  'siedemset',
  'osiemset',
  'dziewięćset'
];

// Polish grammatical forms: [singular nominative, plural 2-4, plural 5+]
// For "złoty": jeden złoty, dwa/trzy/cztery złote, pięć/... złotych
const ZLOTY_FORMS = ['złoty', 'złote', 'złotych'] as const;
const TYSIAC_FORMS = ['tysiąc', 'tysiące', 'tysięcy'] as const;
const MILION_FORMS = ['milion', 'miliony', 'milionów'] as const;

const selectForm = (count: number, forms: readonly [string, string, string]): string => {
  if (count === 1) return forms[0];
  const lastTwo = count % 100;
  const lastOne = count % 10;
  if (lastTwo >= 12 && lastTwo <= 19) return forms[2];
  if (lastOne >= 2 && lastOne <= 4) return forms[1];
  return forms[2];
};

const threeDigitsToWords = (n: number): string => {
  if (n === 0) return '';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const remainder = n % 100;
  const t = Math.floor(remainder / 10);
  const o = remainder % 10;

  if (h > 0) parts.push(HUNDREDS[h] ?? '');

  if (t === 1) {
    parts.push(TEENS[o] ?? '');
  } else {
    if (t > 1) parts.push(TENS[t] ?? '');
    if (o > 0) parts.push(ONES[o] ?? '');
  }

  return parts.join(' ');
};

const integerToWords = (n: number): string => {
  if (n === 0) return 'zero';

  const parts: string[] = [];

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;

  if (millions > 0) {
    const milWords = threeDigitsToWords(millions);
    parts.push(`${milWords} ${selectForm(millions, MILION_FORMS)}`);
  }

  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('tysiąc');
    } else {
      const thWords = threeDigitsToWords(thousands);
      parts.push(`${thWords} ${selectForm(thousands, TYSIAC_FORMS)}`);
    }
  }

  if (remainder > 0) {
    parts.push(threeDigitsToWords(remainder));
  }

  return parts.join(' ');
};

/**
 * Convert a PLN amount to Polish words.
 * E.g.: 3997.50 → "trzy tysiące dziewięćset dziewięćdziesiąt siedem złotych 50/100"
 * E.g.: 0.01 → "zero złotych 01/100"
 * E.g.: 1.00 → "jeden złoty 00/100"
 */
export const slownie = (amount: number): string => {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`slownie: amount must be a finite number, got ${amount}`);
  }

  const isNegative = amount < 0;
  const absoluteAmount = Math.abs(amount);

  // Split into złote and grosze using integer arithmetic to avoid float errors
  const totalGrosze = Math.round(absoluteAmount * 100);
  const zlote = Math.floor(totalGrosze / 100);
  const grosze = totalGrosze % 100;

  const zloteWords = integerToWords(zlote);
  const zloteForm = zlote === 0 ? 'złotych' : selectForm(zlote, ZLOTY_FORMS);
  const groszeStr = grosze.toString().padStart(2, '0');

  const amountInWords = `${zloteWords} ${zloteForm} ${groszeStr}/100`;

  return isNegative ? `minus ${amountInWords}` : amountInWords;
};
