import { getDatabase } from '../db/index.js';
import { sanitizeCsvField } from '../utils/security.js';
import { toMajorUnits } from '../utils/currency.js';
import { InvoiceRecord } from '../types/index.js';

export interface CsvExportOptions {
  approvedOnly?: boolean;
  category?: string;
  vendor?: string;
  startDate?: string;
  endDate?: string;
}

export class CsvService {
  /**
   * Generates a safe CSV string of invoices with formula injection protection and UTF-8 BOM
   */
  static generateInvoicesCsv(options: CsvExportOptions): { csv: string; count: number } {
    const db = getDatabase();

    let query = `
      SELECT i.*, d.original_filename
      FROM invoices i
      JOIN documents d ON i.document_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options.approvedOnly !== false) {
      query += ` AND i.review_status = 'approved'`;
    }

    if (options.category && options.category !== 'all') {
      query += ` AND i.category = ?`;
      params.push(options.category);
    }

    if (options.vendor) {
      query += ` AND i.vendor_name LIKE ?`;
      params.push(`%${options.vendor}%`);
    }

    if (options.startDate) {
      query += ` AND i.invoice_date >= ?`;
      params.push(options.startDate);
    }

    if (options.endDate) {
      query += ` AND i.invoice_date <= ?`;
      params.push(options.endDate);
    }

    query += ` ORDER BY i.invoice_date DESC, i.created_at DESC`;

    const records = db.prepare(query).all(...params) as unknown as (InvoiceRecord & { original_filename: string })[];

    const headers = [
      'Invoice ID',
      'Original File',
      'Vendor Name',
      'Invoice Number',
      'Invoice Date',
      'Due Date',
      'Currency',
      'Subtotal',
      'Tax',
      'Discount',
      'Total Amount',
      'Category',
      'Payment Status',
      'Review Status',
      'Duplicate Status',
      'Created At',
    ];

    const lines: string[] = [];
    // Prepend UTF-8 BOM so Excel opens with proper character encoding
    lines.push('\uFEFF' + headers.map(sanitizeCsvField).join(','));

    for (const rec of records) {
      const row = [
        sanitizeCsvField(rec.id),
        sanitizeCsvField(rec.original_filename),
        sanitizeCsvField(rec.vendor_name || ''),
        sanitizeCsvField(rec.invoice_number || ''),
        sanitizeCsvField(rec.invoice_date || ''),
        sanitizeCsvField(rec.due_date || ''),
        sanitizeCsvField(rec.currency || 'USD'),
        sanitizeCsvField(toMajorUnits(rec.subtotal_minor) ?? ''),
        sanitizeCsvField(toMajorUnits(rec.tax_minor) ?? ''),
        sanitizeCsvField(toMajorUnits(rec.discount_minor) ?? ''),
        sanitizeCsvField(toMajorUnits(rec.total_minor) ?? ''),
        sanitizeCsvField(rec.category),
        sanitizeCsvField(rec.payment_status),
        sanitizeCsvField(rec.review_status),
        sanitizeCsvField(rec.duplicate_status),
        sanitizeCsvField(rec.created_at),
      ];
      lines.push(row.join(','));
    }

    return {
      csv: lines.join('\r\n'),
      count: records.length,
    };
  }
}
