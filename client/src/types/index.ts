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
  'Unclassified',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

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
  // Populated fields
  original_filename?: string;
  mime_type?: string;
  line_items?: InvoiceLineItem[];
  document?: DocumentRecord;
  duplicate_document?: DocumentRecord | null;
  validation_warnings?: string[];
  extraction_data?: {
    evidence?: {
      vendor_evidence?: string;
      invoice_number_evidence?: string;
      date_evidence?: string;
      total_evidence?: string;
    };
    modelUsed?: string;
    isSampleData?: boolean;
    mathDiscrepancy?: boolean;
  };
}

export interface ProcessingLog {
  id: string;
  document_id: string;
  processing_stage: string;
  status: 'started' | 'completed' | 'failed';
  duration_ms: number;
  error_code: string | null;
  created_at: string;
}

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
  recentInvoices: (InvoiceRecord & { original_filename: string })[];
  recentFailures: {
    id: string;
    original_filename: string;
    file_size: number;
    processing_error: string;
    uploaded_at: string;
  }[];
}

export interface MonthlyExpense {
  month: string;
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

export interface OllamaHealthStatus {
  isAvailable: boolean;
  baseUrl: string;
  selectedModel: string;
  availableModels: string[];
  error?: string;
}

export interface SystemHealth {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    status: string;
    path: string;
    exists: boolean;
  };
  storage: {
    dataDir: string;
    uploadDir: string;
    maxFileSize: string;
  };
  ai: {
    mockMode: boolean;
    configuredModel: string;
    ollamaBaseUrl: string;
  };
}
