import { getDatabase } from '../db/index.js';
import { DocumentRecord, InvoiceRecord } from '../types/index.js';

export interface ExactDuplicateMatch {
  isExact: boolean;
  existingDocument: DocumentRecord | null;
}

export interface ProbableDuplicateMatch {
  isProbable: boolean;
  matchedInvoice: InvoiceRecord | null;
  matchedDocument: DocumentRecord | null;
  matchReason: string | null;
}

export class DuplicateService {
  /**
   * Exact duplicate detection via SHA-256 file hash
   */
  static findExactDuplicate(fileHash: string, excludeDocumentId?: string): ExactDuplicateMatch {
    const db = getDatabase();
    let query = 'SELECT * FROM documents WHERE file_hash = ?';
    const params: any[] = [fileHash];

    if (excludeDocumentId) {
      query += ' AND id != ?';
      params.push(excludeDocumentId);
    }

    query += ' ORDER BY uploaded_at ASC LIMIT 1';
    const row = db.prepare(query).get(...params) as DocumentRecord | undefined;

    if (row) {
      return {
        isExact: true,
        existingDocument: row,
      };
    }

    return {
      isExact: false,
      existingDocument: null,
    };
  }

  /**
   * Probable duplicate detection by matching normalized Vendor, Invoice Number, Currency, and Total
   */
  static findProbableDuplicate(
    vendorName: string | null,
    invoiceNumber: string | null,
    currency: string | null,
    totalMinor: number | null,
    excludeInvoiceId?: string
  ): ProbableDuplicateMatch {
    if (!vendorName || !invoiceNumber) {
      return { isProbable: false, matchedInvoice: null, matchedDocument: null, matchReason: null };
    }

    const db = getDatabase();
    const normalizedVendor = this.normalizeString(vendorName);
    const normalizedInvNum = this.normalizeString(invoiceNumber);

    // Look for records with matching invoice number first
    let query = `
      SELECT i.*, d.original_filename, d.storage_path, d.uploaded_at 
      FROM invoices i
      JOIN documents d ON i.document_id = d.id
      WHERE i.invoice_number IS NOT NULL
    `;
    const params: any[] = [];

    if (excludeInvoiceId) {
      query += ' AND i.id != ?';
      params.push(excludeInvoiceId);
    }

    const candidates = db.prepare(query).all(...params) as any[];

    for (const cand of candidates) {
      const candVendorNorm = this.normalizeString(cand.vendor_name || '');
      const candInvNumNorm = this.normalizeString(cand.invoice_number || '');

      // Check if invoice number matches
      if (candInvNumNorm && candInvNumNorm === normalizedInvNum) {
        // If vendor matches or closely matches
        const vendorMatches =
          candVendorNorm.includes(normalizedVendor) || normalizedVendor.includes(candVendorNorm);

        if (vendorMatches) {
          // If total also matches, this is a very high probability duplicate
          const totalMatches = totalMinor !== null && cand.total_minor === totalMinor;
          const currencyMatches = (cand.currency || 'USD') === (currency || 'USD');

          let reason = `Matching invoice number '${invoiceNumber}' and vendor '${vendorName}'`;
          if (totalMatches && currencyMatches) {
            reason += ' with identical total amount and currency';
          }

          return {
            isProbable: true,
            matchedInvoice: cand as InvoiceRecord,
            matchedDocument: {
              id: cand.document_id,
              original_filename: cand.original_filename,
              stored_filename: '',
              file_hash: '',
              mime_type: '',
              file_size: 0,
              storage_path: cand.storage_path,
              processing_status: 'completed',
              processing_error: null,
              uploaded_at: cand.uploaded_at,
              processed_at: null,
            },
            matchReason: reason,
          };
        }
      }
    }

    return {
      isProbable: false,
      matchedInvoice: null,
      matchedDocument: null,
      matchReason: null,
    };
  }

  /**
   * Normalizes a string by converting to lowercase and stripping punctuation and excess whitespace
   */
  private static normalizeString(val: string): string {
    return val
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
}
