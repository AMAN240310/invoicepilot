/**
 * Deterministic normalization utilities for invoice data.
 * Cleans placeholder strings, formats dates to ISO YYYY-MM-DD,
 * maps payment statuses, and cleans financial numbers.
 */

export function cleanPlaceholder(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  let str = String(val).trim();
  if (!str) return null;

  // Strip common label prefixes if copied into the value
  str = str.replace(/^(?:invoice\s*(?:number|num|no\.?|#)|due\s*date|date|vendor\s*name|total\s*due|bill\s*to)[\t ]*[:#]?[\t ]*/i, '').trim();

  // Strip wrapping quotes
  str = str.replace(/^["']|["']$/g, '').trim();

  if (!str) return null;

  // Placeholder phrases that indicate missing information
  const placeholderRegex = /^(?:not\s*provided|not\s*specified|none|n\/?a|null|undefined|unspecified|unknown|blank|tbd|pending|\-|\s*)$/i;
  if (placeholderRegex.test(str)) {
    return null;
  }

  return str;
}

export function normalizeDate(val: unknown): string | null {
  const cleaned = cleanPlaceholder(val);
  if (!cleaned) return null;

  // 1. Check YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleaned.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. Check DD/MM/YYYY or DD-MM-YYYY (common in India, UK, Europe: e.g. 16/10/2026)
  const dmyMatch = cleaned.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 3. Fallback: Parse via Date
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    if (y >= 2000 && y <= 2100) {
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

export type AllowedPaymentStatus = 'unknown' | 'unpaid' | 'partially_paid' | 'paid';

export function normalizePaymentStatus(val: unknown, documentText?: string): AllowedPaymentStatus {
  if (val !== null && val !== undefined) {
    const str = String(val).trim().toLowerCase();

    // Missing / unspecified phrases
    if (
      !str ||
      /^(?:not\s*specified|not\s*provided|none|n\/?a|null|undefined|unspecified|unknown|blank|pending\s*verification)$/i.test(
        str
      )
    ) {
      return 'unknown';
    }

    if (/^(?:paid|card|credit\s*card|debit\s*card|cash|upi|net\s*banking|cleared|settled|completed|paid\s*via.*)$/i.test(str)) {
      return 'paid';
    }

    if (/^(?:partially\s*paid|partial|part\s*payment)$/i.test(str)) {
      return 'partially_paid';
    }

    if (/^(?:unpaid|due|pending|outstanding|not\s*paid|open|overdue)$/i.test(str)) {
      return 'unpaid';
    }
  }

  // Contextual check from document text if status was ambiguous
  if (documentText) {
    const lower = documentText.toLowerCase();
    if (lower.includes('payment status: not specified') || lower.includes('payment status: unspecified')) {
      return 'unknown';
    }
    if (/\bpayment:\s*(?:card|cash|upi|credit|paid)\b/i.test(documentText)) {
      return 'paid';
    }
    if (/\b(?:status:\s*paid|paid\s+in\s+full|payment\s+received)\b/i.test(documentText)) {
      return 'paid';
    }
  }

  return 'unknown';
}

export function cleanFinancialNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;

  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }

  const str = String(val).trim();
  if (!str) return null;

  // Placeholder strings
  if (/^(?:not\s*provided|not\s*specified|none|n\/?a|null|undefined|\-)$/i.test(str)) {
    return null;
  }

  // Remove currency codes and symbols (INR, CAD, USD, EUR, GBP, $, €, £, ₹), spaces, commas
  const sanitized = str.replace(/[A-Z]{3}|[$€£₹,\s]/gi, '');
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? null : parsed;
}
