import { getDatabase } from '../db/index.js';
import { toMajorUnits } from '../utils/currency.js';

export interface CurrencyTotal {
  currency: string;
  total_minor: number;
  total_major: number;
}

export interface AnalyticsSummary {
  totalInvoiceCount: number;
  totalRecordedValues: CurrencyTotal[];
  totalApprovedExpenses: CurrencyTotal[];
  needsReviewCount: number;
  possibleDuplicatesCount: number;
  recentInvoices: any[];
  recentFailures: any[];
}

export interface MonthlyExpense {
  month: string; // YYYY-MM
  currency: string;
  total_minor: number;
  total_major: number;
  count: number;
}

export interface CategoryExpense {
  category: string;
  currency: string;
  total_minor: number;
  total_major: number;
  count: number;
}

export interface VendorExpense {
  vendor: string;
  currency: string;
  total_minor: number;
  total_major: number;
  count: number;
}

export class AnalyticsService {
  /**
   * Returns top-level summary metrics with strict currency separation
   */
  static getSummary(): AnalyticsSummary {
    const db = getDatabase();

    // Total invoice count
    const countRow = db.prepare('SELECT COUNT(*) as count FROM invoices').get() as { count: number };
    const totalInvoiceCount = countRow?.count || 0;

    // Total recorded values by currency
    const recordedRows = db
      .prepare(
        `SELECT currency, SUM(total_minor) as sum_minor 
         FROM invoices 
         WHERE total_minor IS NOT NULL 
         GROUP BY currency`
      )
      .all() as { currency: string; sum_minor: number }[];

    const totalRecordedValues: CurrencyTotal[] = recordedRows.map((r) => ({
      currency: r.currency || 'USD',
      total_minor: r.sum_minor || 0,
      total_major: toMajorUnits(r.sum_minor) || 0,
    }));

    // Total approved expenses by currency
    const approvedRows = db
      .prepare(
        `SELECT currency, SUM(total_minor) as sum_minor 
         FROM invoices 
         WHERE review_status = 'approved' AND total_minor IS NOT NULL 
         GROUP BY currency`
      )
      .all() as { currency: string; sum_minor: number }[];

    const totalApprovedExpenses: CurrencyTotal[] = approvedRows.map((r) => ({
      currency: r.currency || 'USD',
      total_minor: r.sum_minor || 0,
      total_major: toMajorUnits(r.sum_minor) || 0,
    }));

    // Invoices requiring review
    const reviewRow = db
      .prepare(`SELECT COUNT(*) as count FROM invoices WHERE review_status = 'needs_review' OR review_status = 'unreviewed'`)
      .get() as { count: number };
    const needsReviewCount = reviewRow?.count || 0;

    // Invoices flagged as probable duplicate
    const duplicateRow = db
      .prepare(`SELECT COUNT(*) as count FROM invoices WHERE duplicate_status = 'probable' OR duplicate_status = 'exact'`)
      .get() as { count: number };
    const possibleDuplicatesCount = duplicateRow?.count || 0;

    // Recent invoices
    const recentInvoices = db
      .prepare(
        `SELECT i.*, d.original_filename
         FROM invoices i
         JOIN documents d ON i.document_id = d.id
         ORDER BY i.created_at DESC
         LIMIT 6`
      )
      .all();

    // Recent document failures
    const recentFailures = db
      .prepare(
        `SELECT id, original_filename, file_size, processing_error, uploaded_at
         FROM documents
         WHERE processing_status = 'failed'
         ORDER BY uploaded_at DESC
         LIMIT 5`
      )
      .all();

    return {
      totalInvoiceCount,
      totalRecordedValues,
      totalApprovedExpenses,
      needsReviewCount,
      possibleDuplicatesCount,
      recentInvoices,
      recentFailures,
    };
  }

  /**
   * Monthly expenses breakdown grouped by Year-Month and currency
   */
  static getMonthlyExpenses(currency: string = 'USD', startDate?: string, endDate?: string): MonthlyExpense[] {
    const db = getDatabase();

    let query = `
      SELECT substr(invoice_date, 1, 7) as month, currency, SUM(total_minor) as sum_minor, COUNT(*) as count
      FROM invoices
      WHERE invoice_date IS NOT NULL AND total_minor IS NOT NULL AND currency = ?
    `;
    const params: any[] = [currency];

    if (startDate) {
      query += ` AND invoice_date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND invoice_date <= ?`;
      params.push(endDate);
    }

    query += ` GROUP BY substr(invoice_date, 1, 7) ORDER BY month ASC`;

    const rows = db.prepare(query).all(...params) as {
      month: string;
      currency: string;
      sum_minor: number;
      count: number;
    }[];

    return rows.map((r) => ({
      month: r.month,
      currency: r.currency,
      total_minor: r.sum_minor,
      total_major: toMajorUnits(r.sum_minor) || 0,
      count: r.count,
    }));
  }

  /**
   * Category breakdown grouped by expense category and currency
   */
  static getCategoryExpenses(currency: string = 'USD', startDate?: string, endDate?: string): CategoryExpense[] {
    const db = getDatabase();

    let query = `
      SELECT category, currency, SUM(total_minor) as sum_minor, COUNT(*) as count
      FROM invoices
      WHERE total_minor IS NOT NULL AND currency = ?
    `;
    const params: any[] = [currency];

    if (startDate) {
      query += ` AND invoice_date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND invoice_date <= ?`;
      params.push(endDate);
    }

    query += ` GROUP BY category ORDER BY sum_minor DESC`;

    const rows = db.prepare(query).all(...params) as {
      category: string;
      currency: string;
      sum_minor: number;
      count: number;
    }[];

    return rows.map((r) => ({
      category: r.category,
      currency: r.currency,
      total_minor: r.sum_minor,
      total_major: toMajorUnits(r.sum_minor) || 0,
      count: r.count,
    }));
  }

  /**
   * Vendor totals breakdown
   */
  static getVendorTotals(currency: string = 'USD', limit: number = 10): VendorExpense[] {
    const db = getDatabase();

    const query = `
      SELECT COALESCE(vendor_name, 'Unknown Vendor') as vendor, currency, SUM(total_minor) as sum_minor, COUNT(*) as count
      FROM invoices
      WHERE total_minor IS NOT NULL AND currency = ?
      GROUP BY vendor
      ORDER BY sum_minor DESC
      LIMIT ?
    `;

    const rows = db.prepare(query).all(currency, limit) as {
      vendor: string;
      currency: string;
      sum_minor: number;
      count: number;
    }[];

    return rows.map((r) => ({
      vendor: r.vendor,
      currency: r.currency,
      total_minor: r.sum_minor,
      total_major: toMajorUnits(r.sum_minor) || 0,
      count: r.count,
    }));
  }
}
