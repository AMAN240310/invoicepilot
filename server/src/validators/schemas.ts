import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../types/index.js';
import { cleanPlaceholder, normalizeDate, normalizePaymentStatus, cleanFinancialNumber } from '../utils/normalizer.js';

export const CategoryEnum = z.enum(EXPENSE_CATEGORIES);
export const PaymentStatusEnum = z.enum(['unknown', 'unpaid', 'partially_paid', 'paid']);
export const ReviewStatusEnum = z.enum(['unreviewed', 'approved', 'rejected', 'needs_review']);
export const DuplicateStatusEnum = z.enum(['none', 'exact', 'probable']);

export const LineItemSchema = z.object({
  description: z.preprocess((val) => cleanPlaceholder(val) || 'Line Item', z.string().default('Line Item')),
  quantity: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  unit_price: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  line_total: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
});

export const ExtractionEvidenceSchema = z.object({
  vendor_evidence: z.preprocess(cleanPlaceholder, z.string().nullable().optional().default(null)),
  invoice_number_evidence: z.preprocess(cleanPlaceholder, z.string().nullable().optional().default(null)),
  date_evidence: z.preprocess(cleanPlaceholder, z.string().nullable().optional().default(null)),
  total_evidence: z.preprocess(cleanPlaceholder, z.string().nullable().optional().default(null)),
});

export const ExtractedInvoiceSchema = z.object({
  vendor_name: z.preprocess(cleanPlaceholder, z.string().nullable().optional().default(null)),
  invoice_number: z.preprocess(cleanPlaceholder, z.string().nullable().optional().default(null)),
  invoice_date: z.preprocess(
    normalizeDate,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable().optional().default(null)
  ),
  due_date: z.preprocess(
    normalizeDate,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable().optional().default(null)
  ),
  currency_code: z.preprocess(
    (v) => (v ? String(v).trim().toUpperCase() : null),
    z.string().nullable().optional().default(null)
  ),
  currency: z.preprocess(
    (v) => (v ? String(v).trim().toUpperCase() : null),
    z.string().nullable().optional().default(null)
  ),
  subtotal: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  tax_amount: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  tax: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  discount: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  total_amount: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  total: z.preprocess(cleanFinancialNumber, z.number().nullable().optional().default(null)),
  category: CategoryEnum.nullable().optional().default('Unclassified'),
  payment_status: z.preprocess((v) => normalizePaymentStatus(v), PaymentStatusEnum).optional().default('unknown'),
  line_items: z.array(LineItemSchema).optional().default([]),
  evidence: ExtractionEvidenceSchema.optional().default({}),
});

export const UpdateInvoiceSchema = z.object({
  vendor_name: z.preprocess(cleanPlaceholder, z.string().nullable().optional()),
  invoice_number: z.preprocess(cleanPlaceholder, z.string().nullable().optional()),
  invoice_date: z.preprocess(
    normalizeDate,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  ),
  due_date: z.preprocess(
    normalizeDate,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  ),
  currency: z.string().min(1).max(10).optional(),
  subtotal_minor: z.number().int().nonnegative().nullable().optional(),
  tax_minor: z.number().int().nonnegative().nullable().optional(),
  discount_minor: z.number().int().nonnegative().nullable().optional(),
  total_minor: z.number().int().nonnegative().nullable().optional(),
  category: CategoryEnum.optional(),
  payment_status: PaymentStatusEnum.optional(),
  review_status: ReviewStatusEnum.optional(),
  line_items: z
    .array(
      z.object({
        id: z.string().optional(),
        description: z.string(),
        quantity: z.number().nullable().optional(),
        unit_price_minor: z.number().int().nullable().optional(),
        line_total_minor: z.number().int().nullable().optional(),
      })
    )
    .optional(),
});

export const QueryInvoicesSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  review_status: z.string().optional(),
  payment_status: z.string().optional(),
  duplicate_status: z.string().optional(),
  currency: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sort: z.enum(['created_at', 'invoice_date', 'total_minor', 'vendor_name']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const QueryExportSchema = z.object({
  approved_only: z.coerce.boolean().optional().default(true),
  category: z.string().optional(),
  vendor: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
