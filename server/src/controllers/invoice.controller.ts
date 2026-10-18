import { Request, Response, NextFunction } from 'express';
import { getDatabase, runInTransaction, generateId } from '../db/index.js';
import { UpdateInvoiceSchema, QueryInvoicesSchema } from '../validators/schemas.js';
import { InvoiceRecord, InvoiceLineItem, DocumentRecord } from '../types/index.js';

export class InvoiceController {
  /**
   * Search, filter, sort, and paginate invoice records
   */
  static async getInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = QueryInvoicesSchema.parse(req.query);
      const db = getDatabase();

      let sql = `
        SELECT i.*, d.original_filename, d.mime_type
        FROM invoices i
        JOIN documents d ON i.document_id = d.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (query.search) {
        sql += ` AND (i.vendor_name LIKE ? OR i.invoice_number LIKE ? OR d.original_filename LIKE ?)`;
        const term = `%${query.search}%`;
        params.push(term, term, term);
      }

      if (query.category && query.category !== 'all') {
        sql += ` AND i.category = ?`;
        params.push(query.category);
      }

      if (query.review_status && query.review_status !== 'all') {
        sql += ` AND i.review_status = ?`;
        params.push(query.review_status);
      }

      if (query.payment_status && query.payment_status !== 'all') {
        sql += ` AND i.payment_status = ?`;
        params.push(query.payment_status);
      }

      if (query.duplicate_status && query.duplicate_status !== 'all') {
        sql += ` AND i.duplicate_status = ?`;
        params.push(query.duplicate_status);
      }

      if (query.currency && query.currency !== 'all') {
        sql += ` AND i.currency = ?`;
        params.push(query.currency);
      }

      if (query.startDate) {
        sql += ` AND i.invoice_date >= ?`;
        params.push(query.startDate);
      }

      if (query.endDate) {
        sql += ` AND i.invoice_date <= ?`;
        params.push(query.endDate);
      }

      // Count total matching
      const countSql = `SELECT COUNT(*) as count FROM (${sql})`;
      const totalRow = db.prepare(countSql).get(...params) as { count: number };
      const total = totalRow?.count || 0;

      // Safe sorting
      const allowedSortColumns: Record<string, string> = {
        created_at: 'i.created_at',
        invoice_date: 'i.invoice_date',
        total_minor: 'i.total_minor',
        vendor_name: 'i.vendor_name',
      };
      const sortCol = allowedSortColumns[query.sort] || 'i.created_at';
      const orderDir = query.order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const offset = (query.page - 1) * query.limit;
      sql += ` ORDER BY ${sortCol} ${orderDir} LIMIT ? OFFSET ?`;
      params.push(query.limit, offset);

      const invoices = db.prepare(sql).all(...params) as unknown as (InvoiceRecord & { original_filename: string; mime_type: string })[];

      res.json({
        success: true,
        invoices,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get invoice by ID with line items, document details, and duplicate reference
   */
  static async getInvoiceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as unknown as InvoiceRecord | undefined;
      if (!invoice) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      // Fetch associated document
      const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(invoice.document_id) as unknown as DocumentRecord | undefined;

      // Fetch line items
      const lineItems = db.prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ?').all(id) as unknown as InvoiceLineItem[];

      // Fetch duplicate document if flagged
      let duplicateDoc: DocumentRecord | null = null;
      if (invoice.duplicate_of) {
        duplicateDoc = (db.prepare('SELECT * FROM documents WHERE id = ?').get(invoice.duplicate_of) as unknown as DocumentRecord) || null;
      }

      // Parse extraction data and warnings
      let validationWarnings: string[] = [];
      let extractionData: any = null;
      if (invoice.extraction_data_json) {
        try {
          const parsed = JSON.parse(invoice.extraction_data_json);
          validationWarnings = parsed.warnings || [];
          extractionData = parsed.extracted || null;
        } catch {
          // ignore parsing error
        }
      }

      res.json({
        success: true,
        invoice: {
          ...invoice,
          document,
          line_items: lineItems,
          duplicate_document: duplicateDoc,
          validation_warnings: validationWarnings,
          extraction_data: extractionData,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update invoice fields, line items, and preserve user edits
   */
  static async updateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = UpdateInvoiceSchema.parse(req.body);
      const db = getDatabase();

      const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRecord | undefined;
      if (!existing) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      runInTransaction((txDb) => {
        const now = new Date().toISOString();

        const fields: string[] = [];
        const values: any[] = [];

        if (validatedData.vendor_name !== undefined) {
          fields.push('vendor_name = ?');
          values.push(validatedData.vendor_name);
        }
        if (validatedData.invoice_number !== undefined) {
          fields.push('invoice_number = ?');
          values.push(validatedData.invoice_number);
        }
        if (validatedData.invoice_date !== undefined) {
          fields.push('invoice_date = ?');
          values.push(validatedData.invoice_date);
        }
        if (validatedData.due_date !== undefined) {
          fields.push('due_date = ?');
          values.push(validatedData.due_date);
        }
        if (validatedData.currency !== undefined) {
          fields.push('currency = ?');
          values.push(validatedData.currency);
        }
        if (validatedData.subtotal_minor !== undefined) {
          fields.push('subtotal_minor = ?');
          values.push(validatedData.subtotal_minor);
        }
        if (validatedData.tax_minor !== undefined) {
          fields.push('tax_minor = ?');
          values.push(validatedData.tax_minor);
        }
        if (validatedData.discount_minor !== undefined) {
          fields.push('discount_minor = ?');
          values.push(validatedData.discount_minor);
        }
        if (validatedData.total_minor !== undefined) {
          fields.push('total_minor = ?');
          values.push(validatedData.total_minor);
        }
        if (validatedData.category !== undefined) {
          fields.push('category = ?');
          values.push(validatedData.category);
        }
        if (validatedData.payment_status !== undefined) {
          fields.push('payment_status = ?');
          values.push(validatedData.payment_status);
        }
        if (validatedData.review_status !== undefined) {
          fields.push('review_status = ?');
          values.push(validatedData.review_status);
        }

        fields.push('updated_at = ?');
        values.push(now);
        values.push(id);

        if (fields.length > 1) {
          txDb.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        }

        // Update line items if provided
        if (validatedData.line_items) {
          txDb.prepare('DELETE FROM invoice_line_items WHERE invoice_id = ?').run(id);
          const insertLi = txDb.prepare(`
            INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price_minor, line_total_minor)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const item of validatedData.line_items) {
            insertLi.run(
              item.id || generateId(),
              id,
              item.description,
              item.quantity || null,
              item.unit_price_minor || null,
              item.line_total_minor || null
            );
          }
        }
      });

      const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      res.json({
        success: true,
        message: 'Invoice updated successfully',
        invoice: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Explicitly approve invoice
   */
  static async approveInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE invoices SET review_status = 'approved', updated_at = ? WHERE id = ?`).run(now, id);

      const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      res.json({
        success: true,
        message: 'Invoice successfully approved',
        invoice: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Explicitly reject invoice
   */
  static async rejectInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE invoices SET review_status = 'rejected', updated_at = ? WHERE id = ?`).run(now, id);

      const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      res.json({
        success: true,
        message: 'Invoice rejected',
        invoice: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete invoice record
   */
  static async deleteInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      db.prepare('DELETE FROM invoices WHERE id = ?').run(id);

      res.json({
        success: true,
        message: 'Invoice deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
