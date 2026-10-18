export type ProcessingStatus = 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed';

export type ReviewStatus = 'unreviewed' | 'approved' | 'rejected' | 'needs_review';

export type PaymentStatus = 'unknown' | 'unpaid' | 'partially_paid' | 'paid';

export type DuplicateStatus = 'none' | 'exact' | 'probable';

export const EXPENSE_CATEGORIES = [
  'Software and Subscriptions',
  'Office Supplies',
  'Travel',
  'Food and Meals',
  'Utilities',
  'Marketing',
  'Equipment',
  'Professional Services',
  'Transportation',
  'Other',
  'Unclassified'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface DocumentRecord {
  id: string;
  original_filename: string;
  stored_filename: string;
  file_hash: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

export interface InvoiceLineItem {
  id?: string;
  invoice_id?: string;
  description: string;
  quantity: number | null;
  unit_price_minor: number | null;
  line_total_minor: number | null;
}

export interface InvoiceRecord {
  id: string;
  document_id: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal_minor: number | null;
  tax_minor: number | null;
  discount_minor: number | null;
  total_minor: number | null;
  category: ExpenseCategory;
  payment_status: PaymentStatus;
  review_status: ReviewStatus;
  duplicate_status: DuplicateStatus;
  duplicate_of: string | null;
  extraction_data_json: string | null;
  created_at: string;
  updated_at: string;
  // Joined or populated fields
  line_items?: InvoiceLineItem[];
  document?: DocumentRecord;
  duplicate_document?: DocumentRecord | null;
  validation_warnings?: string[];
}

export interface ProcessingLog {
  id?: string;
  document_id: string;
  processing_stage: string;
  status: 'started' | 'completed' | 'failed';
  duration_ms: number;
  error_code: string | null;
  created_at?: string;
}

export interface ExtractedFieldEvidence {
  value: string | number | null;
  evidence_text: string | null;
}

export interface RawExtractedInvoice {
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  currency_code?: string | null;
  subtotal: number | null;
  tax: number | null;
  tax_amount?: number | null;
  discount: number | null;
  total: number | null;
  total_amount?: number | null;
  category: string | null;
  payment_status: PaymentStatus;
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    line_total: number | null;
  }>;
  evidence: {
    vendor_evidence: string | null;
    invoice_number_evidence: string | null;
    date_evidence: string | null;
    total_evidence: string | null;
  };
}

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  mathDiscrepancy: boolean;
}
