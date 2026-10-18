import { OllamaService } from './ollama.service.js';
import { ExtractedInvoiceSchema } from '../validators/schemas.js';
import { RawExtractedInvoice, ExpenseCategory, EXPENSE_CATEGORIES } from '../types/index.js';
import { config } from '../config/index.js';
import { detectCurrency, normalizeCurrency } from '../utils/currency.js';
import { cleanPlaceholder, normalizeDate, normalizePaymentStatus, cleanFinancialNumber } from '../utils/normalizer.js';

export class ExtractionService {
  private static SYSTEM_PROMPT = `You are a precision invoice information extraction engine. Extract facts only from the supplied document. Never invent missing values. Return null for missing or ambiguous information. Do NOT use zero (0) to represent missing financial values; only use 0 if the document explicitly specifies 0 (e.g. "Discount: 0.00").
Preserve invoice numbers as written. Normalize dates to YYYY-MM-DD.
Recognize explicit currency codes and symbols (e.g. INR, CAD, USD, EUR, GBP). Do not default to USD when document specifies INR or CAD.
Allowed payment_status values must be exactly: "unknown", "unpaid", "partially_paid", "paid". If status is not specified or absent, return "unknown".
Suggest a category only from the permitted category list:
- Software and Subscriptions
- Office Supplies
- Travel
- Food and Meals
- Utilities
- Marketing
- Equipment
- Professional Services
- Transportation
- Other
- Unclassified

Return supporting source text for important extracted fields in the evidence object. Return JSON matching the exact schema.`;

  /**
   * Main extraction pipeline with bounded repair attempt and fallback mock mode
   */
  static async extractFromText(
    documentText: string,
    modelOverride?: string
  ): Promise<{
    data: RawExtractedInvoice;
    rawResponse: string;
    repairAttempted: boolean;
    modelUsed: string;
    warningMessages: string[];
  }> {
    const warningMessages: string[] = [];

    // If Mock AI mode is enabled (for tests or environments without Ollama)
    if (config.mockAiMode) {
      const mockResult = this.heuristicExtraction(documentText);
      return {
        data: mockResult,
        rawResponse: JSON.stringify(mockResult),
        repairAttempted: false,
        modelUsed: 'mock-deterministic',
        warningMessages: ['Extracted via deterministic mock engine (OLLAMA disabled)'],
      };
    }

    const modelToUse = modelOverride || config.ollama.model;
    const prompt = `DOCUMENT CONTENT:
"""
${documentText.slice(0, 8000)}
"""

Extract the invoice data from the document above into a single JSON object.
Use EXACTLY these keys:
{
  "vendor_name": "name of seller/vendor or null",
  "invoice_number": "invoice number or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "currency_code": "3-letter currency code such as INR, CAD, USD, EUR, GBP or null",
  "subtotal": 0.00 or null,
  "tax_amount": 0.00 or null,
  "discount": 0.00 or null,
  "total_amount": 0.00 or null,
  "payment_status": "unknown" | "unpaid" | "partially_paid" | "paid",
  "line_items": [
    {
      "description": "item description",
      "quantity": 1,
      "unit_price": 0.00,
      "line_total": 0.00
    }
  ],
  "evidence": {
    "vendor_evidence": "exact text from document showing vendor name or null",
    "invoice_number_evidence": "exact text from document showing invoice number or null",
    "date_evidence": "exact text from document showing date or null",
    "total_evidence": "exact text from document showing total or null"
  }
}

Rules:
1. Return ONLY the JSON object.
2. If a value is missing or says "NOT PROVIDED" / "Not specified", use null. NEVER use 0 for missing values.
3. If payment status says "Not specified" or is absent, payment_status MUST be "unknown".
4. currency_code must be the currency explicitly mentioned in document (e.g. INR, CAD, EUR, GBP, USD).`;

    // Attempt 1
    const firstAttempt = await OllamaService.generateJson(prompt, this.SYSTEM_PROMPT, modelToUse);
    if (!firstAttempt.success) {
      throw new Error(`AI extraction failed: ${firstAttempt.error}`);
    }

    const parsedFirst = this.parseAndValidate(firstAttempt.rawText, documentText);

    if (parsedFirst.success && parsedFirst.data) {
      return {
        data: parsedFirst.data,
        rawResponse: firstAttempt.rawText,
        repairAttempted: false,
        modelUsed: modelToUse,
        warningMessages,
      };
    }

    // Attempt 2: Exactly one bounded repair attempt
    warningMessages.push(`Initial model output failed validation: ${parsedFirst.error}. Attempted repair.`);
    const repairPrompt = `The previous extraction JSON had issues: ${parsedFirst.error}
Previous Output:
${firstAttempt.rawText.slice(0, 2000)}

Please provide the corrected, valid JSON for this document using the exact required schema:
"""
${documentText.slice(0, 4000)}
"""`;

    const repairAttempt = await OllamaService.generateJson(repairPrompt, this.SYSTEM_PROMPT, modelToUse);
    if (!repairAttempt.success) {
      throw new Error(`AI repair attempt failed: ${repairAttempt.error}`);
    }

    const parsedRepair = this.parseAndValidate(repairAttempt.rawText, documentText);

    if (parsedRepair.success && parsedRepair.data) {
      return {
        data: parsedRepair.data,
        rawResponse: repairAttempt.rawText,
        repairAttempted: true,
        modelUsed: modelToUse,
        warningMessages,
      };
    }

    // If second attempt fails, fall back to heuristic extraction with review flag
    warningMessages.push(`AI JSON repair failed: ${parsedRepair.error}. Used heuristic recovery for manual review.`);
    const fallbackData = this.heuristicExtraction(documentText);
    return {
      data: fallbackData,
      rawResponse: repairAttempt.rawText || firstAttempt.rawText,
      repairAttempted: true,
      modelUsed: modelToUse,
      warningMessages,
    };
  }

  /**
   * Safely parses JSON string and validates with Zod, pre-normalizing field mappings and applying deterministic fallbacks
   */
  public static parseAndValidate(
    rawText: string,
    documentText?: string
  ): { success: boolean; data?: RawExtractedInvoice; error?: string } {
    try {
      let cleaned = rawText.trim();
      // Remove markdown code fences if model wrapped response in ```json ... ```
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      // Locate first '{' and last '}'
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      const parsedJson = JSON.parse(cleaned);

      // Pre-normalize common field aliases before Zod validation
      const preNormalized = {
        vendor_name: parsedJson.vendor_name || parsedJson.vendor || parsedJson.seller || null,
        invoice_number: parsedJson.invoice_number || parsedJson.invoice_no || parsedJson.receipt_number || null,
        invoice_date: parsedJson.invoice_date || parsedJson.date || null,
        due_date: parsedJson.due_date || parsedJson.payment_due || null,
        currency_code: parsedJson.currency_code || parsedJson.currency || null,
        currency: parsedJson.currency || parsedJson.currency_code || null,
        subtotal: parsedJson.subtotal !== undefined ? parsedJson.subtotal : null,
        tax_amount: parsedJson.tax_amount !== undefined ? parsedJson.tax_amount : parsedJson.tax !== undefined ? parsedJson.tax : null,
        tax: parsedJson.tax !== undefined ? parsedJson.tax : parsedJson.tax_amount !== undefined ? parsedJson.tax_amount : null,
        discount: parsedJson.discount !== undefined ? parsedJson.discount : null,
        total_amount: parsedJson.total_amount !== undefined ? parsedJson.total_amount : parsedJson.total !== undefined ? parsedJson.total : (parsedJson.total_due !== undefined ? parsedJson.total_due : null),
        total: parsedJson.total !== undefined ? parsedJson.total : parsedJson.total_amount !== undefined ? parsedJson.total_amount : (parsedJson.total_due !== undefined ? parsedJson.total_due : null),
        category: parsedJson.category || null,
        payment_status: parsedJson.payment_status || null,
        line_items: Array.isArray(parsedJson.line_items)
          ? parsedJson.line_items
          : Array.isArray(parsedJson.items)
          ? parsedJson.items.map((it: any) => ({
              description: it.description || it.name || 'Line Item',
              quantity: it.quantity ?? null,
              unit_price: it.unit_price ?? null,
              line_total: it.line_total ?? it.total ?? null,
            }))
          : [],
        evidence: parsedJson.evidence || {},
      };

      const validated = ExtractedInvoiceSchema.parse(preNormalized);

      // Deterministic currency resolution (never default to USD if document explicitly specifies INR, CAD, etc.)
      const detectedCurrency = normalizeCurrency(
        validated.currency_code || validated.currency,
        documentText
      );

      // Deterministic payment status resolution
      const paymentStatus = normalizePaymentStatus(validated.payment_status, documentText);

      // Deterministic check: if critical fields are null from LLM, run heuristic recovery on those fields
      let vendor = validated.vendor_name;
      let invNum = validated.invoice_number;
      let invDate = validated.invoice_date;
      let dueDate = validated.due_date;
      let subtotal = validated.subtotal ?? validated.tax !== null ? validated.subtotal : null;
      let tax = validated.tax ?? validated.tax_amount ?? null;
      let discount = validated.discount ?? null;
      let total = validated.total ?? validated.total_amount ?? null;
      let lineItems = validated.line_items;

      if (documentText) {
        const heuristic = this.heuristicExtraction(documentText);
        if (!vendor) vendor = heuristic.vendor_name;
        if (!invNum && !documentText.toLowerCase().includes('invoice number: not provided')) {
          invNum = heuristic.invoice_number;
        }
        if (!invDate) invDate = heuristic.invoice_date;
        if (!dueDate && !documentText.toLowerCase().includes('due date: not specified')) {
          dueDate = heuristic.due_date;
        }
        if (subtotal === null) subtotal = heuristic.subtotal;
        if (tax === null && documentText.toLowerCase().includes('tax')) tax = heuristic.tax;
        if (total === null) total = heuristic.total;
        if ((!lineItems || lineItems.length === 0) && heuristic.line_items.length > 0) {
          lineItems = heuristic.line_items;
        }
      }

      return {
        success: true,
        data: {
          vendor_name: vendor || null,
          invoice_number: invNum || null,
          invoice_date: invDate || null,
          due_date: dueDate || null,
          currency: detectedCurrency,
          currency_code: detectedCurrency,
          subtotal: subtotal ?? null,
          tax: tax ?? null,
          tax_amount: tax ?? null,
          discount: discount ?? null,
          total: total ?? null,
          total_amount: total ?? null,
          category: validated.category || this.inferCategory(documentText || '', vendor),
          payment_status: paymentStatus,
          line_items: (lineItems || []).map((li) => ({
            description: li.description || 'Line Item',
            quantity: li.quantity ?? null,
            unit_price: li.unit_price ?? null,
            line_total: li.line_total ?? null,
          })),
          evidence: {
            vendor_evidence: validated.evidence?.vendor_evidence || vendor || null,
            invoice_number_evidence: validated.evidence?.invoice_number_evidence || invNum || null,
            date_evidence: validated.evidence?.date_evidence || invDate || null,
            total_evidence: validated.evidence?.total_evidence || (total !== null ? String(total) : null),
          },
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Deterministic heuristic parser for mock mode, tests, or bounded fallback
   */
  public static heuristicExtraction(text: string): RawExtractedInvoice {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. Vendor Heuristics: First prominent line that isn't a document header or date
    let vendor: string | null = null;
    let vendorEvidence: string | null = null;
    for (const line of lines.slice(0, 6)) {
      const lower = line.toLowerCase();
      if (
        !lower.startsWith('invoice') &&
        !lower.startsWith('receipt') &&
        !lower.startsWith('tax invoice') &&
        !lower.startsWith('official') &&
        !lower.includes('gstin:') &&
        !lower.includes('date:') &&
        !lower.includes('page') &&
        line.length > 2 &&
        line.length < 60
      ) {
        vendor = cleanPlaceholder(line);
        vendorEvidence = line;
        break;
      }
    }

    // 2. Invoice Number Heuristics
    let invoiceNumber: string | null = null;
    let invoiceNumberEvidence: string | null = null;
    const invMatch = text.match(
      /\b(?:invoice\s*(?:number|num|no\b\.?|#)|receipt\s*(?:no\b\.?|num|number|#)|bill\s*(?:no\b\.?|number|num|#))[\t ]*[:#]?[\t ]*([^\n\r]+)/i
    );
    if (invMatch) {
      let rawVal = invMatch[1].trim();
      // If there are other fields on the same line like "Date: 2026-10-10", cut off at "Date:"
      rawVal = rawVal.replace(/\s+(?:date|due\s*date|bill\s*to)[\t ]*[:#].*$/i, '').trim();
      const cleaned = cleanPlaceholder(rawVal);
      if (cleaned) {
        invoiceNumber = cleaned;
        invoiceNumberEvidence = invMatch[0].trim();
      }
    }

    // 3. Date Heuristics
    let invoiceDate: string | null = null;
    let dateEvidence: string | null = null;
    let dueDate: string | null = null;

    const invDateMatch = text.match(/\b(?<!due\s*)date[\t ]*[:#]?[\t ]*([0-9\/\-\.]{8,12})/i);
    if (invDateMatch) {
      invoiceDate = normalizeDate(invDateMatch[1]);
      dateEvidence = invDateMatch[0];
    } else {
      // Direct ISO search
      const dateIso = text.match(/\b(20\d{2}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01]))\b/);
      if (dateIso) {
        invoiceDate = normalizeDate(dateIso[1]);
        dateEvidence = dateIso[0];
      }
    }

    const dueDateMatch = text.match(/\bdue\s*date[\t ]*[:#]?[\t ]*([^\n\r]+)/i);
    if (dueDateMatch) {
      let rawDue = dueDateMatch[1].trim();
      rawDue = rawDue.replace(/\s+(?:bill\s*to|date)[\t ]*[:#].*$/i, '').trim();
      dueDate = normalizeDate(rawDue);
    }

    // 4. Currency Heuristics
    const currency = detectCurrency(text) || 'USD';

    // 5. Financial Totals Heuristics
    let total: number | null = null;
    let subtotal: number | null = null;
    let tax: number | null = null;
    let discount: number | null = null;
    let totalEvidence: string | null = null;

    // Subtotal
    const subtotalMatch = text.match(/\b(?:subtotal|sub-total|net\s+amount)[^\d\n]*([0-9,]+\.[0-9]{2})/i);
    if (subtotalMatch) {
      subtotal = cleanFinancialNumber(subtotalMatch[1]);
    }

    // Tax
    const taxMatch = text.match(/\b(?:tax|vat|gst)[^\d\n]*([0-9,]+\.[0-9]{2})/i);
    if (taxMatch) {
      tax = cleanFinancialNumber(taxMatch[1]);
    }

    // Discount
    const discountMatch = text.match(/\bdiscount[^\d\n]*([0-9,]+\.[0-9]{2})/i);
    if (discountMatch) {
      discount = cleanFinancialNumber(discountMatch[1]);
    }

    // Total Due / Grand Total
    const totalMatch = text.match(/(?:\btotal\s+due|\bgrand\s+total|\bbalance\s+due|\bamount\s+due|(?<!sub)total)[^\d\n]*([0-9,]+\.[0-9]{2})/i);
    if (totalMatch) {
      total = cleanFinancialNumber(totalMatch[1]);
      totalEvidence = totalMatch[0].trim();
    }

    // 6. Payment Status Heuristics
    const paymentStatus = normalizePaymentStatus(null, text);

    // 7. Line Items Heuristics
    const lineItems: Array<{
      description: string;
      quantity: number | null;
      unit_price: number | null;
      line_total: number | null;
    }> = [];

    // Table parsing: look for lines between table header and Subtotal/Total
    let inTable = false;
    for (const line of lines) {
      if (/Description.*Qty.*Line/i.test(line)) {
        inTable = true;
        continue;
      }
      if (inTable) {
        if (/^(?:Subtotal|Tax|Discount|TOTAL|Payment)/i.test(line)) {
          break;
        }
        // Match item pattern: Description Qty [Currency] UnitPrice [Currency] LineTotal
        const itemMatch = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:[A-Z]{3}|[$€£₹])?\s*([0-9,]+\.[0-9]{2})\s+(?:[A-Z]{3}|[$€£₹])?\s*([0-9,]+\.[0-9]{2})$/i);
        if (itemMatch) {
          lineItems.push({
            description: itemMatch[1].trim(),
            quantity: parseFloat(itemMatch[2]),
            unit_price: cleanFinancialNumber(itemMatch[3]),
            line_total: cleanFinancialNumber(itemMatch[4]),
          });
        }
      }
      // Receipt style pattern: e.g. "Milk 1L 2 xX 62.00 124.00" or "Bread 1 x 45.00 45.00"
      if (!inTable) {
        const receiptItemMatch = line.match(/^(.+?)\s+(\d+)\s*(?:x|xX)\s*([0-9,]+\.[0-9]{2})\s+([0-9,]+\.[0-9]{2})$/i);
        if (receiptItemMatch) {
          lineItems.push({
            description: receiptItemMatch[1].trim(),
            quantity: parseFloat(receiptItemMatch[2]),
            unit_price: cleanFinancialNumber(receiptItemMatch[3]),
            line_total: cleanFinancialNumber(receiptItemMatch[4]),
          });
        }
      }
    }

    // Category Heuristics
    const category = this.inferCategory(text, vendor);

    return {
      vendor_name: vendor,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      currency,
      currency_code: currency,
      subtotal,
      tax,
      tax_amount: tax,
      discount,
      total,
      total_amount: total,
      category,
      payment_status: paymentStatus,
      line_items: lineItems.length > 0 ? lineItems : [
        {
          description: vendor ? `${vendor} Services/Goods` : 'General Item',
          quantity: 1,
          unit_price: total || subtotal,
          line_total: total || subtotal,
        },
      ],
      evidence: {
        vendor_evidence: vendorEvidence,
        invoice_number_evidence: invoiceNumberEvidence,
        date_evidence: dateEvidence,
        total_evidence: totalEvidence,
      },
    };
  }

  private static inferCategory(text: string, vendor: string | null): ExpenseCategory {
    // Remove synthetic testing disclaimers so "created for software testing" does not bias category
    const cleanText = text
      .replace(/created\s+for\s+software\s+testing/gi, '')
      .replace(/synthetic\s+test\s+document/gi, '')
      .replace(/synthetic\s+test\s+data/gi, '');
    const lower = `${vendor || ''} ${cleanText}`.toLowerCase();

    if (
      lower.includes('hosting') ||
      lower.includes('cloud') ||
      lower.includes('subscription') ||
      lower.includes('saas') ||
      lower.includes('metrics') ||
      lower.includes('github') ||
      lower.includes('aws') ||
      (lower.includes('software') && !lower.includes('office') && !lower.includes('paper'))
    ) {
      return 'Software and Subscriptions';
    }
    if (
      lower.includes('office') ||
      lower.includes('paper') ||
      lower.includes('staples') ||
      lower.includes('pen') ||
      lower.includes('notebook')
    ) {
      return 'Office Supplies';
    }
    if (
      lower.includes('keyboard') ||
      lower.includes('hub') ||
      lower.includes('laptop') ||
      lower.includes('monitor') ||
      lower.includes('hardware') ||
      lower.includes('equipment')
    ) {
      return 'Equipment';
    }
    if (
      lower.includes('design') ||
      lower.includes('consulting') ||
      lower.includes('legal') ||
      lower.includes('accounting') ||
      lower.includes('professional services')
    ) {
      return 'Professional Services';
    }
    if (
      lower.includes('restaurant') ||
      lower.includes('cafe') ||
      lower.includes('coffee') ||
      lower.includes('food') ||
      lower.includes('meal') ||
      lower.includes('mart') ||
      lower.includes('milk') ||
      lower.includes('bread') ||
      lower.includes('fruit')
    ) {
      return 'Food and Meals';
    }
    if (
      lower.includes('hotel') ||
      lower.includes('flight') ||
      lower.includes('airline') ||
      lower.includes('airbnb') ||
      lower.includes('travel')
    ) {
      return 'Travel';
    }
    if (
      lower.includes('electric') ||
      lower.includes('water') ||
      lower.includes('power') ||
      lower.includes('internet')
    ) {
      return 'Utilities';
    }
    if (
      lower.includes('marketing') ||
      lower.includes('advertising') ||
      lower.includes('ads') ||
      lower.includes('google ads')
    ) {
      return 'Marketing';
    }
    if (
      lower.includes('uber') ||
      lower.includes('lyft') ||
      lower.includes('taxi') ||
      lower.includes('transport')
    ) {
      return 'Transportation';
    }
    return 'Unclassified';
  }
}
