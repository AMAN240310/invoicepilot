import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { getDatabase, closeDatabase, generateId, runInTransaction } from '../server/src/db/index.js';
import { StorageService } from '../server/src/services/storage.service.js';
import { PdfService } from '../server/src/services/pdf.service.js';
import { OcrService } from '../server/src/services/ocr.service.js';
import { ExtractionService } from '../server/src/services/extraction.service.js';
import { ValidationService } from '../server/src/services/validation.service.js';
import { DuplicateService } from '../server/src/services/duplicate.service.js';
import { CsvService } from '../server/src/services/csv.service.js';
import { sanitizeCsvField, sanitizeFilename, isPathInsideDirectory } from '../server/src/utils/security.js';
import {
  checkMathConsistency,
  toMinorUnits,
  toMajorUnits,
  detectCurrency,
  normalizeCurrency,
  formatCurrency,
} from '../server/src/utils/currency.js';
import {
  cleanPlaceholder,
  normalizeDate,
  normalizePaymentStatus,
  cleanFinancialNumber,
} from '../server/src/utils/normalizer.js';
import { DocumentProcessor } from '../server/src/services/document.processor.js';
import { ExtractedInvoiceSchema, UpdateInvoiceSchema } from '../server/src/validators/schemas.js';
import { config } from '../server/src/config/index.js';

let passedTests = 0;
let failedTests = 0;
const results: { name: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passedTests++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ PASS: ${name}`);
  } catch (err: any) {
    failedTests++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Reason: ${err.message}`);
  }
}

async function runTestSuite() {
  console.log('========================================================');
  console.log('🧪 Running InvoicePilot Automated Regression Test Suite');
  console.log('========================================================\n');

  // ====================================================================
  // TEST GROUP 1: Normalizer Unit Tests
  // ====================================================================
  console.log('--- 1. Data Normalizer & Placeholder Tests ---');

  await test('Normalizer: cleanPlaceholder converts placeholder strings to null and cleans labels', () => {
    assert.strictEqual(cleanPlaceholder('NOT PROVIDED'), null);
    assert.strictEqual(cleanPlaceholder('Not specified'), null);
    assert.strictEqual(cleanPlaceholder('none'), null);
    assert.strictEqual(cleanPlaceholder('N/A'), null);
    assert.strictEqual(cleanPlaceholder(''), null);
    assert.strictEqual(cleanPlaceholder('   '), null);
    assert.strictEqual(cleanPlaceholder('null'), null);
    assert.strictEqual(cleanPlaceholder('undefined'), null);

    // Strips label prefixes
    assert.strictEqual(cleanPlaceholder('Invoice Number: NST-2026-1042'), 'NST-2026-1042');
    assert.strictEqual(cleanPlaceholder('Due Date: Not specified'), null);
    assert.strictEqual(cleanPlaceholder('Vendor Name: Acme Corp'), 'Acme Corp');
  });

  await test('Normalizer: normalizeDate converts various formats to ISO YYYY-MM-DD or null', () => {
    assert.strictEqual(normalizeDate('2026-10-10'), '2026-10-10');
    assert.strictEqual(normalizeDate('2026/10/10'), '2026-10-10');
    assert.strictEqual(normalizeDate('16/10/2026'), '2026-10-16'); // Receipt OCR DD/MM/YYYY
    assert.strictEqual(normalizeDate('16-10-2026'), '2026-10-16');
    assert.strictEqual(normalizeDate('Not specified'), null);
    assert.strictEqual(normalizeDate('NOT PROVIDED'), null);
    assert.strictEqual(normalizeDate(''), null);
    assert.strictEqual(normalizeDate(null), null);
  });

  await test('Normalizer: normalizePaymentStatus restricts to exact allowed values', () => {
    // Missing status variants -> unknown
    assert.strictEqual(normalizePaymentStatus('Not specified'), 'unknown');
    assert.strictEqual(normalizePaymentStatus('not provided'), 'unknown');
    assert.strictEqual(normalizePaymentStatus(''), 'unknown');
    assert.strictEqual(normalizePaymentStatus(null), 'unknown');
    assert.strictEqual(normalizePaymentStatus('unknown'), 'unknown');

    // Paid variants
    assert.strictEqual(normalizePaymentStatus('paid'), 'paid');
    assert.strictEqual(normalizePaymentStatus('Card'), 'paid');
    assert.strictEqual(normalizePaymentStatus('Credit Card'), 'paid');
    assert.strictEqual(normalizePaymentStatus('Paid via Bank Transfer'), 'paid');

    // Partially paid and unpaid
    assert.strictEqual(normalizePaymentStatus('partially paid'), 'partially_paid');
    assert.strictEqual(normalizePaymentStatus('unpaid'), 'unpaid');
    assert.strictEqual(normalizePaymentStatus('due'), 'unpaid');

    // Contextual extraction
    assert.strictEqual(
      normalizePaymentStatus(null, 'Payment status: Not specified. Please verify the invoice.'),
      'unknown'
    );
    assert.strictEqual(normalizePaymentStatus(null, 'Receipt Total: 258.00\nPayment: Card'), 'paid');
  });

  await test('Normalizer: cleanFinancialNumber parses numbers, removes symbols, preserves null', () => {
    assert.strictEqual(cleanFinancialNumber(3100), 3100);
    assert.strictEqual(cleanFinancialNumber('INR 3,100.00'), 3100.0);
    assert.strictEqual(cleanFinancialNumber('CAD 118.17'), 118.17);
    assert.strictEqual(cleanFinancialNumber(' $1,234.56 '), 1234.56);
    assert.strictEqual(cleanFinancialNumber('0.00'), 0.0);
    assert.strictEqual(cleanFinancialNumber(null), null);
    assert.strictEqual(cleanFinancialNumber(''), null);
    assert.strictEqual(cleanFinancialNumber('NOT PROVIDED'), null);
  });

  // ====================================================================
  // TEST GROUP 2: Currency Detection & Multi-Currency Tests
  // ====================================================================
  console.log('\n--- 2. Currency Detection & Multi-Currency Isolation Tests ---');

  await test('Currency detection: accurately identifies INR, CAD, EUR, GBP, USD from codes & context', () => {
    // INR detection
    assert.strictEqual(detectCurrency('Subtotal INR 3,100.00 Tax INR 558.00'), 'INR');
    assert.strictEqual(detectCurrency('Jaipur, Rajasthan 302001, India\nGSTIN: 08TEST'), 'INR');
    assert.strictEqual(detectCurrency('Amount due: ₹ 5,000.00'), 'INR');

    // CAD detection
    assert.strictEqual(detectCurrency('Subtotal CAD 109.00 TOTAL DUE CAD 118.17'), 'CAD');
    assert.strictEqual(detectCurrency('100 Example Avenue, Toronto, ON, Canada'), 'CAD');
    assert.strictEqual(detectCurrency('Total: C$ 89.00'), 'CAD');

    // EUR and GBP detection
    assert.strictEqual(detectCurrency('Invoice Total: EUR 450.00'), 'EUR');
    assert.strictEqual(detectCurrency('Total: € 120.00'), 'EUR');
    assert.strictEqual(detectCurrency('Total: GBP 99.00'), 'GBP');
    assert.strictEqual(detectCurrency('Total: £ 75.00'), 'GBP');

    // USD detection
    assert.strictEqual(detectCurrency('Total: USD 150.00'), 'USD');
    assert.strictEqual(detectCurrency('Total: $ 150.00'), 'USD');
  });

  await test('Currency normalization: never defaults to USD when document specifies INR or CAD', () => {
    assert.strictEqual(normalizeCurrency('INR', 'Subtotal INR 3,100.00'), 'INR');
    assert.strictEqual(normalizeCurrency('CAD', 'Subtotal CAD 109.00'), 'CAD');
    assert.strictEqual(normalizeCurrency(null, 'Invoice from Jaipur, India. Subtotal INR 2,020.00'), 'INR');
    assert.strictEqual(normalizeCurrency(null, 'Toronto, ON, Canada. Analytics CAD 89.00'), 'CAD');
    // If currency candidate is generic '$' but document is in Canada, resolves to CAD
    assert.strictEqual(normalizeCurrency('$', 'Toronto, Canada - Total: $89.00'), 'CAD');
  });

  // ====================================================================
  // TEST GROUP 3: Financial Arithmetic & Line Items Tests
  // ====================================================================
  console.log('\n--- 3. Financial Validation & Arithmetic Discrepancy Tests ---');

  await test('Financial validation: verifies subtotal + tax - discount = total within 2 cents tolerance', () => {
    // Valid equation (3100.00 + 558.00 - 100.00 = 3558.00)
    const validMath = checkMathConsistency(310000, 55800, 10000, 355800);
    assert.strictEqual(validMath.canValidate, true);
    assert.strictEqual(validMath.consistent, true);
    assert.strictEqual(validMath.differenceMinor, 0);

    // Stated total discrepancy from 04_math_discrepancy (3100.00 + 558.00 - 0 = 3658.00 != 3668.00)
    const discrepancyMath = checkMathConsistency(310000, 55800, 0, 366800);
    assert.strictEqual(discrepancyMath.canValidate, true);
    assert.strictEqual(discrepancyMath.consistent, false);
    assert.strictEqual(discrepancyMath.expectedTotalMinor, 365800);
    assert.strictEqual(discrepancyMath.differenceMinor, 1000); // 10.00 INR discrepancy
  });

  await test('Financial validation: distinguishes missing amounts from arithmetic errors and never assumes zero for missing tax', () => {
    // Tax is missing (null) -> cannot validate arithmetic
    const missingTax = checkMathConsistency(310000, null, 0, 355800);
    assert.strictEqual(missingTax.canValidate, false);
    assert.strictEqual(missingTax.consistent, true); // Not flagged as arithmetic error!
    assert.ok(missingTax.missingFields.includes('tax'));

    // Subtotal is missing -> cannot validate arithmetic
    const missingSubtotal = checkMathConsistency(null, 55800, 0, 355800);
    assert.strictEqual(missingSubtotal.canValidate, false);
    assert.ok(missingSubtotal.missingFields.includes('subtotal'));
  });

  await test('Financial validation: compares line items sum against subtotal', () => {
    // Line items sum (2400.00 + 700.00 = 3100.00) equals subtotal (3100.00)
    const lineTotals = [240000, 70000];
    const check1 = checkMathConsistency(310000, 55800, 10000, 355800, lineTotals);
    assert.strictEqual(check1.lineItemsConsistent, true);
    assert.strictEqual(check1.lineItemsSumMinor, 310000);

    // Line items sum (1000.00) differs from subtotal (3100.00)
    const badLineTotals = [100000];
    const check2 = checkMathConsistency(310000, 55800, 10000, 355800, badLineTotals);
    assert.strictEqual(check2.lineItemsConsistent, false);
  });

  // ====================================================================
  // TEST GROUP 4: Zod Schema Validation & Extraction Schema Tests
  // ====================================================================
  console.log('\n--- 4. Schema Validation & Null Preservation Tests ---');

  await test('Schema validation: preprocesses missing values, preserves nulls and validates structure', () => {
    const rawInput = {
      vendor_name: '  Invoice Number: NOT PROVIDED  ', // will be cleaned
      invoice_number: 'NOT PROVIDED', // will become null
      invoice_date: '16/10/2026', // will become 2026-10-16
      due_date: 'Not specified', // will become null
      currency_code: 'cad', // will become CAD
      subtotal: 'CAD 109.00', // will become 109.0
      tax_amount: '14.17',
      discount: null, // preserves null
      total_amount: 118.17,
      payment_status: 'Not specified', // will become unknown
      line_items: [
        { description: 'Analytics subscription', quantity: 1, unit_price: '89.00', line_total: '89.00' },
      ],
      evidence: {
        vendor_evidence: 'Maple Metrics Inc.',
        invoice_number_evidence: null,
      },
    };

    const parsed = ExtractedInvoiceSchema.parse(rawInput);
    assert.strictEqual(parsed.invoice_number, null);
    assert.strictEqual(parsed.due_date, null);
    assert.strictEqual(parsed.invoice_date, '2026-10-16');
    assert.strictEqual(parsed.currency_code, 'CAD');
    assert.strictEqual(parsed.subtotal, 109.0);
    assert.strictEqual(parsed.discount, null);
    assert.strictEqual(parsed.payment_status, 'unknown');
    assert.strictEqual(parsed.line_items[0].unit_price, 89.0);
  });

  // ====================================================================
  // TEST GROUP 5: Regression Test on All 7 Target Documents
  // ====================================================================
  console.log('\n--- 5. Full Pipeline Regression on 7 Sample Documents ---');

  const sampleDir = path.resolve('sample-invoices');

  // Document 1: 01_valid_software_invoice.pdf
  await test('Sample 01: 01_valid_software_invoice.pdf (INR, Northstar, valid math)', async () => {
    const filePath = path.join(sampleDir, '01_valid_software_invoice.pdf');
    assert.ok(fs.existsSync(filePath), 'File must exist');
    const buf = fs.readFileSync(filePath);
    const pdf = await PdfService.extractText(buf);
    assert.ok(pdf.isDigital);

    const extracted = ExtractionService.heuristicExtraction(pdf.text);
    assert.strictEqual(extracted.vendor_name, 'Northstar Cloud Tools Ltd.');
    assert.strictEqual(extracted.invoice_number, 'NST-2026-1042');
    assert.strictEqual(extracted.invoice_date, '2026-10-10');
    assert.strictEqual(extracted.due_date, '2026-10-25');
    assert.strictEqual(extracted.currency, 'INR');
    assert.strictEqual(extracted.subtotal, 3100.0);
    assert.strictEqual(extracted.tax, 558.0);
    assert.strictEqual(extracted.discount, 100.0);
    assert.strictEqual(extracted.total, 3558.0);
    assert.strictEqual(extracted.payment_status, 'unknown');

    const validation = ValidationService.validateExtractedInvoice(extracted);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.mathDiscrepancy, false);
  });

  // Document 2: 02_valid_office_supplies.pdf
  await test('Sample 02: 02_valid_office_supplies.pdf (INR, Paper & Pixel Supplies, 3 line items)', async () => {
    const filePath = path.join(sampleDir, '02_valid_office_supplies.pdf');
    assert.ok(fs.existsSync(filePath), 'File must exist');
    const buf = fs.readFileSync(filePath);
    const pdf = await PdfService.extractText(buf);

    const extracted = ExtractionService.heuristicExtraction(pdf.text);
    assert.strictEqual(extracted.vendor_name, 'Paper & Pixel Supplies');
    assert.strictEqual(extracted.invoice_number, 'PPS-7781');
    assert.strictEqual(extracted.invoice_date, '2026-10-12');
    assert.strictEqual(extracted.currency, 'INR');
    assert.strictEqual(extracted.subtotal, 2020.0);
    assert.strictEqual(extracted.tax, 101.0);
    assert.strictEqual(extracted.discount, 0.0);
    assert.strictEqual(extracted.total, 2121.0);
    assert.strictEqual(extracted.payment_status, 'unknown');
    assert.strictEqual(extracted.category, 'Office Supplies');

    const validation = ValidationService.validateExtractedInvoice(extracted);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.mathDiscrepancy, false);
  });

  // Document 3: 03_valid_foreign_currency.pdf
  await test('Sample 03: 03_valid_foreign_currency.pdf (CAD strictly preserved, Maple Metrics)', async () => {
    const filePath = path.join(sampleDir, '03_valid_foreign_currency.pdf');
    assert.ok(fs.existsSync(filePath), 'File must exist');
    const buf = fs.readFileSync(filePath);
    const pdf = await PdfService.extractText(buf);

    const extracted = ExtractionService.heuristicExtraction(pdf.text);
    assert.strictEqual(extracted.vendor_name, 'Maple Metrics Inc.');
    assert.strictEqual(extracted.invoice_number, 'MM-CA-0098');
    assert.strictEqual(extracted.invoice_date, '2026-10-08');
    assert.strictEqual(extracted.currency, 'CAD'); // MUST NOT default to USD
    assert.strictEqual(extracted.subtotal, 109.0);
    assert.strictEqual(extracted.tax, 14.17);
    assert.strictEqual(extracted.discount, 5.0);
    assert.strictEqual(extracted.total, 118.17);
    assert.strictEqual(extracted.payment_status, 'unknown');

    const validation = ValidationService.validateExtractedInvoice(extracted);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.mathDiscrepancy, false);
  });

  // Document 4: 04_math_discrepancy.pdf
  await test('Sample 04: 04_math_discrepancy.pdf (BrightDesk, flags arithmetic discrepancy of 10 INR)', async () => {
    const filePath = path.join(sampleDir, '04_math_discrepancy.pdf');
    assert.ok(fs.existsSync(filePath), 'File must exist');
    const buf = fs.readFileSync(filePath);
    const pdf = await PdfService.extractText(buf);

    const extracted = ExtractionService.heuristicExtraction(pdf.text);
    assert.strictEqual(extracted.vendor_name, 'BrightDesk Equipment Co.');
    assert.strictEqual(extracted.invoice_number, 'BDE-5509');
    assert.strictEqual(extracted.currency, 'INR');
    assert.strictEqual(extracted.subtotal, 3100.0);
    assert.strictEqual(extracted.tax, 558.0);
    assert.strictEqual(extracted.discount, 0.0);
    assert.strictEqual(extracted.total, 3668.0); // Stated total

    // Discrepancy detection: Subtotal 3100 + Tax 558 - Discount 0 = 3658 != 3668
    const validation = ValidationService.validateExtractedInvoice(extracted);
    assert.strictEqual(validation.mathDiscrepancy, true);
    assert.ok(validation.warnings.some((w) => w.includes('Financial Discrepancy')));
    assert.ok(validation.warnings.some((w) => w.includes('INR 10.00') || w.includes('Discrepancy: 10.00')));
  });

  // Document 5: 05_receipt_ocr_test.png
  await test('Sample 05: 05_receipt_ocr_test.png (Tesseract OCR, Quickcart, ISO date 2026-10-16, Card -> paid)', async () => {
    const filePath = path.join(sampleDir, '05_receipt_ocr_test.png');
    assert.ok(fs.existsSync(filePath), 'File must exist');
    const buf = fs.readFileSync(filePath);
    const ocrText = await OcrService.extractTextFromImage(buf);
    assert.ok(ocrText.includes('QUICKCART'));

    const extracted = ExtractionService.heuristicExtraction(ocrText);
    assert.strictEqual(extracted.vendor_name, 'QUICKCART MINI MART');
    assert.strictEqual(extracted.invoice_number, 'QC-2026-0318');
    assert.strictEqual(extracted.invoice_date, '2026-10-16'); // Normalized from 16/10/2026!
    assert.strictEqual(extracted.currency, 'INR');
    assert.strictEqual(extracted.subtotal, 258.0);
    assert.strictEqual(extracted.total, 258.0);
    assert.strictEqual(extracted.payment_status, 'paid'); // Detected from "Payment: Card"!
  });

  // Document 6: 06_missing_fields.pdf
  await test('Sample 06: 06_missing_fields.pdf (Riverbend, NOT PROVIDED becomes null, Not specified becomes null)', async () => {
    const filePath = path.join(sampleDir, '06_missing_fields.pdf');
    assert.ok(fs.existsSync(filePath), 'File must exist');
    const buf = fs.readFileSync(filePath);
    const pdf = await PdfService.extractText(buf);

    const extracted = ExtractionService.heuristicExtraction(pdf.text);
    assert.strictEqual(extracted.vendor_name, 'Riverbend Design Services');
    assert.strictEqual(extracted.invoice_number, null); // MUST NOT be "NOT PROVIDED"
    assert.strictEqual(extracted.due_date, null); // MUST NOT be "Not specified"
    assert.strictEqual(extracted.invoice_date, '2026-10-15');
    assert.strictEqual(extracted.currency, 'INR');
    assert.strictEqual(extracted.subtotal, 5000.0);
    assert.strictEqual(extracted.tax, 900.0);
    assert.strictEqual(extracted.total, 5900.0);
    assert.strictEqual(extracted.payment_status, 'unknown');
  });

  // Document 7: 07_exact_duplicate_of_01.pdf
  await test('Sample 07: 07_exact_duplicate_of_01.pdf (identical SHA-256 hash flagged as exact duplicate)', () => {
    const file1 = path.join(sampleDir, '01_valid_software_invoice.pdf');
    const file7 = path.join(sampleDir, '07_exact_duplicate_of_01.pdf');
    const buf1 = fs.readFileSync(file1);
    const buf7 = fs.readFileSync(file7);

    const hash1 = StorageService.computeSha256(buf1);
    const hash7 = StorageService.computeSha256(buf7);
    assert.strictEqual(hash1, hash7);

    const db = getDatabase();
    const docId1 = generateId();
    const docId2 = generateId();

    db.prepare(`
      INSERT INTO documents (id, original_filename, stored_filename, file_hash, mime_type, file_size, storage_path, processing_status, uploaded_at)
      VALUES (?, '01_valid_software_invoice.pdf', '01_valid_software_invoice.pdf', ?, 'application/pdf', ?, 'dummy/path', 'completed', datetime('now'))
    `).run(docId1, hash1, buf1.length);

    const check = DuplicateService.findExactDuplicate(hash7, docId2);
    assert.strictEqual(check.isExact, true);
    assert.strictEqual(check.existingDocument?.id, docId1);

    // Clean up
    db.prepare('DELETE FROM documents WHERE id = ?').run(docId1);
  });

  // ====================================================================
  // TEST GROUP 6: Database Persistence, Reload & API Mapping
  // ====================================================================
  console.log('\n--- 6. Persistence & Reload Consistency Tests ---');

  await test('Database & API: saving and reloading preserves exact values including nulls and ISO dates', () => {
    const db = getDatabase();
    const docId = generateId();
    const invId = generateId();

    // 1. Initial Insert with nulls
    runInTransaction((txDb) => {
      txDb.prepare(`
        INSERT INTO documents (id, original_filename, stored_filename, file_hash, mime_type, file_size, storage_path, processing_status, uploaded_at)
        VALUES (?, 'persist_test.pdf', 'persist_test.pdf', 'dummy_hash_persist', 'application/pdf', 500, 'path', 'completed', datetime('now'))
      `).run(docId);

      txDb.prepare(`
        INSERT INTO invoices (
          id, document_id, vendor_name, invoice_number, invoice_date, due_date,
          currency, subtotal_minor, tax_minor, discount_minor, total_minor,
          category, payment_status, review_status, duplicate_status, created_at, updated_at
        ) VALUES (?, ?, 'Persist Vendor', null, '2026-10-15', null, 'CAD', 10900, 1417, null, 12317, 'Software and Subscriptions', 'unknown', 'unreviewed', 'none', datetime('now'), datetime('now'))
      `).run(invId, docId);
    });

    const initial = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invId) as any;
    assert.strictEqual(initial.vendor_name, 'Persist Vendor');
    assert.strictEqual(initial.invoice_number, null);
    assert.strictEqual(initial.due_date, null);
    assert.strictEqual(initial.discount_minor, null);
    assert.strictEqual(initial.currency, 'CAD');

    // 2. Update with nulls (confirm that null values can be saved)
    db.prepare(`
      UPDATE invoices SET
        vendor_name = ?,
        due_date = ?,
        discount_minor = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run('Updated Vendor', null, null, invId);

    const reloaded = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invId) as any;
    assert.strictEqual(reloaded.vendor_name, 'Updated Vendor');
    assert.strictEqual(reloaded.due_date, null);
    assert.strictEqual(reloaded.discount_minor, null);
    assert.strictEqual(reloaded.currency, 'CAD');

    // Clean up
    db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
  });

  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
