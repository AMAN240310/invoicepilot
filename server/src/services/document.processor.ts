import { getDatabase, runInTransaction, generateId } from '../db/index.js';
import { StorageService } from './storage.service.js';
import { PdfService } from './pdf.service.js';
import { OcrService } from './ocr.service.js';
import { ExtractionService } from './extraction.service.js';
import { ValidationService } from './validation.service.js';
import { DuplicateService } from './duplicate.service.js';
import { toMinorUnits, normalizeCurrency } from '../utils/currency.js';
import { DocumentRecord, InvoiceRecord, ProcessingStatus, ReviewStatus, DuplicateStatus, ExpenseCategory } from '../types/index.js';

export class DocumentProcessor {
  /**
   * Processes a document through the complete extraction, validation, and persistence pipeline
   */
  static async processDocument(documentId: string): Promise<{
    success: boolean;
    document: DocumentRecord;
    invoice?: InvoiceRecord;
    error?: string;
  }> {
    const db = getDatabase();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as DocumentRecord | undefined;

    if (!doc) {
      throw new Error(`Document with ID ${documentId} not found`);
    }

    // Update status to processing
    db.prepare('UPDATE documents SET processing_status = ?, processing_error = NULL WHERE id = ?').run(
      'processing',
      documentId
    );

    const startTime = Date.now();

    try {
      // Stage 1: Exact Duplicate Check
      this.logStage(documentId, 'exact_duplicate_check', 'started', 0);
      const exactDup = DuplicateService.findExactDuplicate(doc.file_hash, documentId);

      if (exactDup.isExact && exactDup.existingDocument) {
        this.logStage(documentId, 'exact_duplicate_check', 'completed', Date.now() - startTime);
        const errorMsg = `Exact duplicate file uploaded. Matches document ${exactDup.existingDocument.original_filename} (${exactDup.existingDocument.id}).`;
        
        db.prepare(
          `UPDATE documents 
           SET processing_status = 'completed', 
               processing_error = ?, 
               processed_at = datetime('now') 
           WHERE id = ?`
        ).run(errorMsg, documentId);

        const updatedDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as unknown as DocumentRecord;
        return {
          success: true,
          document: updatedDoc,
          error: errorMsg,
        };
      }
      this.logStage(documentId, 'exact_duplicate_check', 'completed', Date.now() - startTime);

      // Stage 2: Read file buffer
      const fileBuffer = StorageService.getFileBuffer(doc.storage_path);

      // Stage 3: Text Extraction (PDF text vs Image OCR)
      let stageStart = Date.now();
      let extractedText = '';
      this.logStage(documentId, 'text_extraction', 'started', 0);

      if (doc.mime_type === 'application/pdf') {
        const pdfResult = await PdfService.extractText(fileBuffer);
        if (pdfResult.isDigital && pdfResult.text.length > 0) {
          extractedText = pdfResult.text;
        } else {
          // Fallback to OCR for scanned PDFs
          try {
            extractedText = await OcrService.extractTextFromImage(fileBuffer);
          } catch (ocrErr: any) {
            extractedText = pdfResult.text || ''; // Fall back to whatever sparse text was available
          }
        }
      } else {
        // Image formats (PNG, JPEG)
        extractedText = await OcrService.extractTextFromImage(fileBuffer);
      }

      this.logStage(documentId, 'text_extraction', 'completed', Date.now() - stageStart);

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No readable text could be extracted from this document.');
      }

      // Stage 4: AI Extraction with structured schema and repair bounded attempt
      stageStart = Date.now();
      this.logStage(documentId, 'ai_extraction', 'started', 0);

      const aiResult = await ExtractionService.extractFromText(extractedText);
      this.logStage(documentId, 'ai_extraction', 'completed', Date.now() - stageStart);

      // Stage 5: Deterministic Financial & Business Rule Validation
      stageStart = Date.now();
      this.logStage(documentId, 'validation', 'started', 0);

      const valResult = ValidationService.validateExtractedInvoice(aiResult.data);
      this.logStage(documentId, 'validation', 'completed', Date.now() - stageStart);

      // Stage 6: Currency & Probable Duplicate Detection
      const finalCurrency = normalizeCurrency(
        aiResult.data.currency || aiResult.data.currency_code,
        extractedText
      );
      const subtotalMinor = toMinorUnits(aiResult.data.subtotal);
      const taxMinor = toMinorUnits(aiResult.data.tax ?? aiResult.data.tax_amount);
      const discountMinor = toMinorUnits(aiResult.data.discount);
      const totalMinor = toMinorUnits(aiResult.data.total ?? aiResult.data.total_amount);

      const probableDup = DuplicateService.findProbableDuplicate(
        aiResult.data.vendor_name,
        aiResult.data.invoice_number,
        finalCurrency,
        totalMinor
      );

      let duplicateStatus: DuplicateStatus = 'none';
      let duplicateOfId: string | null = null;
      if (probableDup.isProbable && probableDup.matchedInvoice) {
        duplicateStatus = 'probable';
        duplicateOfId = probableDup.matchedInvoice.document_id;
        valResult.warnings.push(`Probable duplicate: ${probableDup.matchReason}`);
      }

      // Determine initial review status
      let reviewStatus: ReviewStatus = 'unreviewed';
      if (valResult.warnings.length > 0 || valResult.mathDiscrepancy || duplicateStatus === 'probable') {
        reviewStatus = 'needs_review';
      }

      // Stage 7: Persist Invoice and Line Items inside a Transaction
      stageStart = Date.now();
      this.logStage(documentId, 'persistence', 'started', 0);

      const invoiceId = generateId();
      const now = new Date().toISOString();

      const savedInvoice = runInTransaction<InvoiceRecord>((txDb) => {
        // Delete any existing invoice for this document (e.g. on reprocess) to prevent duplicates
        txDb.prepare('DELETE FROM invoices WHERE document_id = ?').run(documentId);

        const insertInvoiceStmt = txDb.prepare(`
          INSERT INTO invoices (
            id, document_id, vendor_name, invoice_number, invoice_date, due_date,
            currency, subtotal_minor, tax_minor, discount_minor, total_minor,
            category, payment_status, review_status, duplicate_status, duplicate_of,
            extraction_data_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertInvoiceStmt.run(
          invoiceId,
          documentId,
          aiResult.data.vendor_name,
          aiResult.data.invoice_number,
          aiResult.data.invoice_date,
          aiResult.data.due_date,
          finalCurrency,
          subtotalMinor,
          taxMinor,
          discountMinor,
          totalMinor,
          (aiResult.data.category as ExpenseCategory) || 'Unclassified',
          aiResult.data.payment_status || 'unknown',
          reviewStatus,
          duplicateStatus,
          duplicateOfId,
          JSON.stringify({
            extracted: aiResult.data,
            warnings: [...aiResult.warningMessages, ...valResult.warnings],
            modelUsed: aiResult.modelUsed,
            mathDiscrepancy: valResult.mathDiscrepancy,
          }),
          now,
          now
        );

        // Insert Line Items
        const insertLineItemStmt = txDb.prepare(`
          INSERT INTO invoice_line_items (
            id, invoice_id, description, quantity, unit_price_minor, line_total_minor
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of aiResult.data.line_items) {
          insertLineItemStmt.run(
            generateId(),
            invoiceId,
            item.description || 'Line Item',
            item.quantity,
            toMinorUnits(item.unit_price),
            toMinorUnits(item.line_total)
          );
        }

        // Update document status
        const docStatus: ProcessingStatus = reviewStatus === 'needs_review' ? 'needs_review' : 'completed';
        txDb.prepare(
          `UPDATE documents 
           SET processing_status = ?, processing_error = NULL, processed_at = ? 
           WHERE id = ?`
        ).run(docStatus, now, documentId);

        const rec = txDb.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as unknown as InvoiceRecord;
        return rec;
      });

      this.logStage(documentId, 'persistence', 'completed', Date.now() - stageStart);

      const finalDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as unknown as DocumentRecord;
      return {
        success: true,
        document: finalDoc,
        invoice: savedInvoice,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logStage(documentId, 'processing', 'failed', Date.now() - startTime, 'PROC_ERROR');

      db.prepare(
        `UPDATE documents 
         SET processing_status = 'failed', processing_error = ?, processed_at = datetime('now') 
         WHERE id = ?`
      ).run(errorMsg, documentId);

      const failedDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as unknown as DocumentRecord;
      return {
        success: false,
        document: failedDoc,
        error: errorMsg,
      };
    }
  }

  private static logStage(
    documentId: string,
    stage: string,
    status: 'started' | 'completed' | 'failed',
    durationMs: number,
    errorCode: string | null = null
  ): void {
    try {
      const db = getDatabase();
      db.prepare(
        `INSERT INTO processing_logs (id, document_id, processing_stage, status, duration_ms, error_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(generateId(), documentId, stage, status, durationMs, errorCode);
    } catch {
      // Do not crash main process on logging failure
    }
  }
}
