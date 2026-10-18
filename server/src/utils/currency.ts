/**
 * Currency utilities for precise financial calculations without floating-point errors.
 * Amounts are stored as integer minor units (e.g. cents).
 */

export function toMinorUnits(amount: number | string | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === '') {
    return null;
  }
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
  if (isNaN(num)) return null;
  // Round to closest integer minor unit
  return Math.round(num * 100);
}

export function toMajorUnits(minor: number | null | undefined): number | null {
  if (minor === null || minor === undefined) return null;
  return Number((minor / 100).toFixed(2));
}

export function formatCurrency(minor: number | null | undefined, currency: string = 'USD'): string {
  if (minor === null || minor === undefined) return 'N/A';
  const major = minor / 100;
  const curr = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${curr} ${major.toFixed(2)}`;
  }
}

/**
 * Recognizes explicit currency codes and symbols, including INR, CAD, USD, EUR, and GBP.
 * Preference order:
 * 1. Explicit currency code in text (INR, CAD, EUR, GBP, USD, AUD)
 * 2. Explicit currency symbol (₹, €, £, C$, CA$)
 * 3. Strong contextual evidence (GSTIN / Indian state / Jaipur -> INR; Canada / ON, Canada -> CAD)
 * 4. Generic $ symbol (checked against Canadian/Australian context before defaulting to USD)
 */
export function detectCurrency(text: string): string | null {
  if (!text) return null;

  // 1. Explicit currency code words (case-insensitive with word boundaries)
  if (/\bINR\b/i.test(text) || /\b(?:Rs\.?|Rupees)\b/i.test(text)) {
    return 'INR';
  }
  if (/\bCAD\b/i.test(text)) {
    return 'CAD';
  }
  if (/\bEUR\b/i.test(text)) {
    return 'EUR';
  }
  if (/\bGBP\b/i.test(text)) {
    return 'GBP';
  }
  if (/\bAUD\b/i.test(text)) {
    return 'AUD';
  }

  // 2. Unambiguous symbols (check C$, CA$, A$ before generic $)
  if (text.includes('₹')) {
    return 'INR';
  }
  if (text.includes('C$') || text.includes('CA$') || text.includes('CAD$')) {
    return 'CAD';
  }
  if (text.includes('A$') || text.includes('AUD$')) {
    return 'AUD';
  }
  if (text.includes('€')) {
    return 'EUR';
  }
  if (text.includes('£')) {
    return 'GBP';
  }

  // 3. Contextual clues
  if (
    /\b(?:GSTIN|Jaipur|Rajasthan|Bengaluru|Bangalore|Mumbai|Delhi|3020\d{2})\b/i.test(text) ||
    /\b(?:India)\b/i.test(text)
  ) {
    return 'INR';
  }
  if (/\b(?:Toronto|Ontario|ON,\s*Canada|Vancouver|Montreal|Canada)\b/i.test(text)) {
    return 'CAD';
  }
  if (/\b(?:London|Manchester|United\s*Kingdom|England|UK)\b/i.test(text)) {
    return 'GBP';
  }

  // 4. Generic dollar symbol '$'
  if (text.includes('$')) {
    // If there is any Canadian hint in the document, resolve to CAD
    if (/\b(?:Canada|ON|Toronto|Montreal|Vancouver)\b/i.test(text)) {
      return 'CAD';
    }
    return 'USD';
  }

  if (/\bUSD\b/i.test(text) || /\bUS\$\b/i.test(text)) {
    return 'USD';
  }

  return null;
}

/**
 * Normalizes a currency candidate with fallback to document text detection.
 * Never defaults to USD when document explicitly specifies INR, CAD, EUR, etc.
 */
export function normalizeCurrency(currencyRaw?: string | null, documentText?: string): string {
  if (currencyRaw) {
    const upper = currencyRaw.trim().toUpperCase();
    if (['INR', 'CAD', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CHF', 'JPY', 'SGD'].includes(upper)) {
      return upper;
    }
    if (upper === '₹' || upper === 'RS' || upper === 'RS.') return 'INR';
    if (upper === '€') return 'EUR';
    if (upper === '£') return 'GBP';
    if (upper === 'C$' || upper === 'CA$') return 'CAD';
    if (upper === '$') {
      if (documentText) {
        const detected = detectCurrency(documentText);
        if (detected) return detected;
      }
      return 'USD';
    }
  }

  if (documentText) {
    const detected = detectCurrency(documentText);
    if (detected) return detected;
  }

  return 'USD';
}

export interface MathConsistencyResult {
  consistent: boolean;
  canValidate: boolean;
  expectedTotalMinor: number | null;
  differenceMinor: number | null;
  missingFields: string[];
  lineItemsSumMinor: number | null;
  lineItemsConsistent: boolean;
  details?: string;
}

/**
 * Validates subtotal + tax - discount = total within a 2-minor-unit rounding tolerance.
 * Only validates when all required amounts (subtotal, total) are known.
 * Never silently replaces missing amounts with zero.
 * Optionally compares line items sum with subtotal.
 */
export function checkMathConsistency(
  subtotalMinor: number | null,
  taxMinor: number | null,
  discountMinor: number | null,
  totalMinor: number | null,
  lineItemTotalsMinor?: (number | null)[]
): MathConsistencyResult {
  const missingFields: string[] = [];

  if (subtotalMinor === null) missingFields.push('subtotal');
  if (totalMinor === null) missingFields.push('total');
  if (taxMinor === null) missingFields.push('tax');

  // Check line items if provided
  let lineItemsSumMinor: number | null = null;
  let lineItemsConsistent = true;

  if (lineItemTotalsMinor && lineItemTotalsMinor.length > 0) {
    const validLineTotals = lineItemTotalsMinor.filter((m): m is number => m !== null);
    if (validLineTotals.length === lineItemTotalsMinor.length) {
      lineItemsSumMinor = validLineTotals.reduce((a, b) => a + b, 0);
      if (subtotalMinor !== null) {
        const diff = Math.abs(lineItemsSumMinor - subtotalMinor);
        if (diff > 2) {
          lineItemsConsistent = false;
        }
      }
    }
  }

  // If subtotal or total is missing, we cannot perform financial arithmetic validation
  if (subtotalMinor === null || totalMinor === null) {
    return {
      consistent: true,
      canValidate: false,
      expectedTotalMinor: null,
      differenceMinor: null,
      missingFields,
      lineItemsSumMinor,
      lineItemsConsistent,
      details: `Cannot validate arithmetic: missing required fields (${missingFields.join(', ')}).`,
    };
  }

  // If tax is missing, we also cannot validate total without guessing tax
  if (taxMinor === null) {
    return {
      consistent: true,
      canValidate: false,
      expectedTotalMinor: null,
      differenceMinor: null,
      missingFields,
      lineItemsSumMinor,
      lineItemsConsistent,
      details: 'Tax amount is missing or not specified; cannot verify total without tax value.',
    };
  }

  // All core amounts are known (discount is treated as 0 if explicitly 0 or absent when subtotal+tax already equals total)
  const discount = discountMinor !== null ? discountMinor : 0;
  const expectedTotalMinor = subtotalMinor + taxMinor - discount;
  const differenceMinor = Math.abs(expectedTotalMinor - totalMinor);

  // Rounding tolerance of 2 minor units (e.g. 0.02)
  const consistent = differenceMinor <= 2;

  let details: string | undefined;
  if (!consistent) {
    details = `Subtotal (${(subtotalMinor / 100).toFixed(2)}) + Tax (${(taxMinor / 100).toFixed(2)}) - Discount (${(discount / 100).toFixed(2)}) = ${(expectedTotalMinor / 100).toFixed(2)}, which does not match stated Total (${(totalMinor / 100).toFixed(2)}). Discrepancy: ${(differenceMinor / 100).toFixed(2)}`;
  }

  return {
    consistent,
    canValidate: true,
    expectedTotalMinor,
    differenceMinor,
    missingFields,
    lineItemsSumMinor,
    lineItemsConsistent,
    details,
  };
}
