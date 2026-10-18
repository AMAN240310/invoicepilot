import { DatabaseSync } from 'node:sqlite';
import { config } from '../config/index.js';
import crypto from 'crypto';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.dbPath);
    // Enable WAL mode, enforce foreign keys
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    initializeSchema(dbInstance);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Execute a function within a SQLite transaction.
 * Automatically rolls back on error.
 */
export function runInTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      processing_status TEXT NOT NULL DEFAULT 'pending',
      processing_error TEXT,
      uploaded_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status);
    CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      vendor_name TEXT,
      invoice_number TEXT,
      invoice_date TEXT,
      due_date TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      subtotal_minor INTEGER,
      tax_minor INTEGER,
      discount_minor INTEGER,
      total_minor INTEGER,
      category TEXT NOT NULL DEFAULT 'Unclassified',
      payment_status TEXT NOT NULL DEFAULT 'unknown',
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      duplicate_status TEXT NOT NULL DEFAULT 'none',
      duplicate_of TEXT,
      extraction_data_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (duplicate_of) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_document_id ON invoices(document_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_review_status ON invoices(review_status);
    CREATE INDEX IF NOT EXISTS idx_invoices_category ON invoices(category);
    CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_name);
    CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL,
      unit_price_minor INTEGER,
      line_total_minor INTEGER,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_line_items_invoice_id ON invoice_line_items(invoice_id);

    CREATE TABLE IF NOT EXISTS processing_logs (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      processing_stage TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error_code TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_processing_logs_doc_id ON processing_logs(document_id);
  `);
}
