import { RawExtractedInvoice, ValidationResult, EXPENSE_CATEGORIES } from '../types/index.js';
import { checkMathConsistency, toMinorUnits } from '../utils/currency.js';

export class ValidationService {
  /**
   * Deterministically validates an extracted invoice against financial and business rules.
   * Generates actionable warnings and distinguishes missing fields from arithmetic discrepancies.
   */
  static validateExtractedInvoice(data: RawExtractedInvoice): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    let mathDiscrepancy = false;
    const curr = data.currency || data.currency_code || 'USD';

    // 1. Required core fields checks
    if (!data.vendor_name || data.vendor_name.trim().length === 0) {
      warnings.push('Vendor name could not be confidently identified.');
    }

    if (!data.invoice_number || data.invoice_number.trim().length === 0) {
      warnings.push('Invoice number is missing.');
    }

    if (!data.invoice_date) {
      warnings.push('Invoice date is missing or ambiguous.');
    } else {
      // Validate date calendar validity
      const parsedDate = new Date(data.invoice_date);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Invalid invoice date format: ${data.invoice_date}`);
      } else {
        const now = new Date();
        const tenYearsAhead = new Date(now.getFullYear() + 10, 11, 31);
        if (parsedDate > tenYearsAhead) {
          warnings.push(`Invoice date (${data.invoice_date}) appears unreasonably far in future.`);
        }
      }
    }

    if (data.due_date && data.invoice_date) {
      const invDate = new Date(data.invoice_date);
      const dueDate = new Date(data.due_date);
      if (!isNaN(invDate.getTime()) && !isNaN(dueDate.getTime()) && dueDate < invDate) {
        warnings.push(`Due date (${data.due_date}) precedes invoice date (${data.invoice_date}).`);
      }
    }

    // 2. Financial Amount Checks (preserve nulls, do not replace with zero)
    if (data.total === null || data.total === undefined) {
      warnings.push('Total amount was not found in document.');
    } else if (data.total < 0) {
      warnings.push('Negative total detected (possible credit note or refund).');
    }

    if (data.subtotal === null || data.subtotal === undefined) {
      warnings.push('Subtotal amount was not found in document.');
    } else if (data.subtotal < 0) {
      warnings.push('Subtotal is negative.');
    }

    if (data.tax !== null && data.tax < 0) {
      warnings.push('Tax amount is negative.');
    }
    if (data.discount !== null && data.discount < 0) {
      warnings.push('Discount amount is negative.');
    }

    // 3. Mathematical Consistency Check
    const subtotalMinor = toMinorUnits(data.subtotal);
    const taxMinor = toMinorUnits(data.tax ?? data.tax_amount);
    const discountMinor = toMinorUnits(data.discount);
    const totalMinor = toMinorUnits(data.total ?? data.total_amount);

    const lineItemTotalsMinor = (data.line_items || [])
      .map((li) => toMinorUnits(li.line_total))
      .filter((m) => m !== null);

    const mathCheck = checkMathConsistency(
      subtotalMinor,
      taxMinor,
      discountMinor,
      totalMinor,
      lineItemTotalsMinor.length > 0 ? lineItemTotalsMinor : undefined
    );

    if (mathCheck.canValidate) {
      if (!mathCheck.consistent) {
        mathDiscrepancy = true;
        const subtotalStr = (subtotalMinor! / 100).toFixed(2);
        const taxStr = ((taxMinor || 0) / 100).toFixed(2);
        const discStr = ((discountMinor || 0) / 100).toFixed(2);
        const expectedStr = (mathCheck.expectedTotalMinor! / 100).toFixed(2);
        const actualStr = (totalMinor! / 100).toFixed(2);
        const diffStr = (mathCheck.differenceMinor! / 100).toFixed(2);

        warnings.push(
          `Financial Discrepancy: Subtotal (${curr} ${subtotalStr}) + Tax (${curr} ${taxStr}) - Discount (${curr} ${discStr}) = ${curr} ${expectedStr}, which does not match stated Total (${curr} ${actualStr}). Discrepancy: ${curr} ${diffStr}.`
        );
      }

      if (!mathCheck.lineItemsConsistent && mathCheck.lineItemsSumMinor !== null && subtotalMinor !== null) {
        const lineItemsStr = (mathCheck.lineItemsSumMinor / 100).toFixed(2);
        const subtotalStr = (subtotalMinor / 100).toFixed(2);
        warnings.push(
          `Line Items Discrepancy: Sum of line item totals (${curr} ${lineItemsStr}) does not match subtotal (${curr} ${subtotalStr}).`
        );
      }
    } else {
      // Distinguish missing fields from arithmetic discrepancies
      if (mathCheck.missingFields.length > 0) {
        // Only warn about missing tax or subtotal if total was present
        if (totalMinor !== null && !mathCheck.missingFields.includes('total')) {
          if (mathCheck.missingFields.includes('tax')) {
            warnings.push('Tax amount is missing or not specified; arithmetic check deferred.');
          }
          if (mathCheck.missingFields.includes('subtotal')) {
            warnings.push('Subtotal amount is missing; arithmetic check deferred.');
          }
        }
      }
    }

    // 4. Allowed Expense Category
    if (!data.category || !EXPENSE_CATEGORIES.includes(data.category as any)) {
      warnings.push(`Unrecognized category '${data.category}'. Defaulting to 'Unclassified'.`);
    }

    // 5. Currency Check
    if (!data.currency && !data.currency_code) {
      warnings.push('Currency not specified in document.');
    }

    // 6. Evidence Validation
    if (data.vendor_name && !data.evidence?.vendor_evidence) {
      warnings.push('Vendor name lacks supporting text excerpt evidence.');
    }
    if (data.total !== null && !data.evidence?.total_evidence) {
      warnings.push('Total amount lacks supporting text excerpt evidence.');
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      warnings,
      errors,
      mathDiscrepancy,
    };
  }
}
