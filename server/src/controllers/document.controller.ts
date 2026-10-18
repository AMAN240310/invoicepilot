import { Request, Response, NextFunction } from 'express';
import { getDatabase, generateId } from '../db/index.js';
import { StorageService } from '../services/storage.service.js';
import { DocumentProcessor } from '../services/document.processor.js';
import { DocumentRecord, ProcessingLog } from '../types/index.js';
import fs from 'fs';

export class DocumentController {
  /**
   * Upload one or more documents (PDF, PNG, JPEG)
   */
  static async uploadDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: 'No files uploaded' });
        return;
      }

      const db = getDatabase();
      const createdDocuments: DocumentRecord[] = [];

      for (const file of files) {
        // Save file securely to upload directory and compute SHA-256
        const saved = StorageService.saveFile(file.buffer, file.originalname);
        const docId = generateId();
        const now = new Date().toISOString();

        const insertStmt = db.prepare(`
          INSERT INTO documents (
            id, original_filename, stored_filename, file_hash, mime_type, file_size, storage_path, processing_status, uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `);

        insertStmt.run(
          docId,
          file.originalname,
          saved.storedFilename,
          saved.fileHash,
          file.mimetype,
          saved.fileSize,
          saved.storagePath,
          now
        );

        const docRecord = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as unknown as DocumentRecord;
        createdDocuments.push(docRecord);

        // Asynchronously process the document (do not block the upload response)
        // Individual failures will not crash other uploads
        DocumentProcessor.processDocument(docId).catch((err) => {
          console.error(`Background processing error for document ${docId}:`, err);
        });
      }

      res.status(201).json({
        success: true,
        message: `Successfully uploaded ${createdDocuments.length} document(s). Processing in progress.`,
        documents: createdDocuments,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all documents with optional status filtering and pagination
   */
  static async getDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = getDatabase();
      const status = req.query.status as string | undefined;
      const page = parseInt((req.query.page as string) || '1', 10);
      const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
      const offset = (page - 1) * limit;

      let countQuery = 'SELECT COUNT(*) as count FROM documents';
      let selectQuery = 'SELECT * FROM documents';
      const params: any[] = [];

      if (status && status !== 'all') {
        countQuery += ' WHERE processing_status = ?';
        selectQuery += ' WHERE processing_status = ?';
        params.push(status);
      }

      selectQuery += ' ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';

      const totalCountRow = db.prepare(countQuery).get(...(status && status !== 'all' ? [status] : [])) as { count: number };
      const total = totalCountRow?.count || 0;

      const documents = db.prepare(selectQuery).all(...params, limit, offset) as unknown as DocumentRecord[];

      res.json({
        success: true,
        documents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get document by ID along with its invoice and processing logs
   */
  static async getDocumentById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as unknown as DocumentRecord | undefined;
      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const invoice = db.prepare('SELECT * FROM invoices WHERE document_id = ?').get(id);
      const logs = db
        .prepare('SELECT * FROM processing_logs WHERE document_id = ? ORDER BY created_at ASC')
        .all(id) as unknown as ProcessingLog[];

      res.json({
        success: true,
        document,
        invoice: invoice || null,
        logs,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Securely serve original document file (PDF or image) for in-browser review
   */
  static async serveFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRecord | undefined;
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      if (!fs.existsSync(doc.storage_path)) {
        res.status(404).json({ success: false, error: 'File missing from storage' });
        return;
      }

      res.setHeader('Content-Type', doc.mime_type);
      res.setHeader('Content-Disposition', `inline; filename="${doc.original_filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const stream = fs.createReadStream(doc.storage_path);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Trigger manual reprocessing of a document
   */
  static async reprocessDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRecord | undefined;
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Run synchronous processing so the user receives immediate feedback
      const result = await DocumentProcessor.processDocument(id);

      res.json({
        success: result.success,
        message: result.success ? 'Document processed successfully' : result.error,
        document: result.document,
        invoice: result.invoice,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete a document and its stored file, cascading to invoice and logs
   */
  static async deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const db = getDatabase();

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRecord | undefined;
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Delete file on disk
      StorageService.deleteFile(doc.storage_path);

      // Foreign keys with CASCADE will delete invoice, line items, and logs
      db.prepare('DELETE FROM documents WHERE id = ?').run(id);

      res.json({
        success: true,
        message: 'Document and associated invoice deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
