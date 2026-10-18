import { getDatabase, runInTransaction, generateId } from './db/index.js';
import { StorageService } from './services/storage.service.js';
import { config } from './config/index.js';
import fs from 'fs';
import path from 'path';

export function seedDemoData(): void {
  console.log('🌱 Seeding synthetic demo invoices (labeled as sample data)...');
  const db = getDatabase();

  const sampleInvoices = [
    {
      filename: 'sample_aws_cloud_services.pdf',
      vendor: 'Amazon Web Services',
      invoiceNumber: 'INV-AWS-2026-9041',
      date: '2026-09-15',
      dueDate: '2026-10-15',
      currency: 'USD',
      subtotal: 18450, // $184.50
      tax: 1550, // $15.50
      discount: 0,
      total: 20000, // $200.00
      category: 'Software and Subscriptions',
      paymentStatus: 'paid',
      reviewStatus: 'approved',
      lineItems: [
        { description: 'AWS EC2 Compute Instances (t4g.xlarge)', quantity: 1, unitPrice: 12000, lineTotal: 12000 },
        { description: 'Amazon S3 Standard Storage (2.5 TB)', quantity: 1, unitPrice: 6450, lineTotal: 6450 },
      ],
      warnings: [],
    },
    {
      filename: 'sample_github_enterprise.pdf',
      vendor: 'GitHub, Inc.',
      invoiceNumber: 'GH-2026-8812',
      date: '2026-10-01',
      dueDate: '2026-10-01',
      currency: 'USD',
      subtotal: 4200, // $42.00
      tax: 336, // $3.36
      discount: 0,
      total: 4536, // $45.36
      category: 'Software and Subscriptions',
      paymentStatus: 'paid',
      reviewStatus: 'approved',
      lineItems: [
        { description: 'GitHub Team Subscription (2 seats)', quantity: 2, unitPrice: 2100, lineTotal: 4200 },
      ],
      warnings: [],
    },
    {
      filename: 'sample_staples_office_supplies.jpg',
      vendor: 'Staples Office Supplies',
      invoiceNumber: 'STP-94021',
      date: '2026-09-28',
      dueDate: '2026-10-28',
      currency: 'USD',
      subtotal: 8950, // $89.50
      tax: 716, // $7.16
      discount: 500, // $5.00
      total: 9166, // $91.66
      category: 'Office Supplies',
      paymentStatus: 'unpaid',
      reviewStatus: 'needs_review',
      lineItems: [
        { description: 'Ergonomic Desk Mat and Wrist Rest', quantity: 1, unitPrice: 3450, lineTotal: 3450 },
        { description: 'Recycled Copy Paper (Case of 5 reams)', quantity: 1, unitPrice: 5500, lineTotal: 5500 },
      ],
      warnings: ['Financial Discrepancy: Mathematical rounding on applied discount requires review.'],
    },
    {
      filename: 'sample_google_workspace.pdf',
      vendor: 'Google Cloud EMEA Limited',
      invoiceNumber: 'G-WS-44018',
      date: '2026-10-05',
      dueDate: '2026-10-20',
      currency: 'EUR',
      subtotal: 2400, // €24.00
      tax: 480, // €4.80
      discount: 0,
      total: 2880, // €28.80
      category: 'Software and Subscriptions',
      paymentStatus: 'paid',
      reviewStatus: 'approved',
      lineItems: [
        { description: 'Google Workspace Business Standard (2 Users)', quantity: 2, unitPrice: 1200, lineTotal: 2400 },
      ],
      warnings: [],
    },
    {
      filename: 'sample_delta_airlines_flight.pdf',
      vendor: 'Delta Air Lines',
      invoiceNumber: 'DL-7739120',
      date: '2026-10-10',
      dueDate: '2026-10-10',
      currency: 'USD',
      subtotal: 41200, // $412.00
      tax: 3850, // $38.50
      discount: 0,
      total: 45050, // $450.50
      category: 'Travel',
      paymentStatus: 'paid',
      reviewStatus: 'unreviewed',
      lineItems: [
        { description: 'Roundtrip Flight SFO -> JFK (Developer Conference)', quantity: 1, unitPrice: 41200, lineTotal: 41200 },
      ],
      warnings: [],
    },
    {
      filename: 'sample_uber_transportation.pdf',
      vendor: 'Uber Technologies, Inc.',
      invoiceNumber: 'UBR-TR-0912',
      date: '2026-10-11',
      dueDate: '2026-10-11',
      currency: 'USD',
      subtotal: 3420, // $34.20
      tax: 280, // $2.80
      discount: 0,
      total: 3700, // $37.00
      category: 'Transportation',
      paymentStatus: 'paid',
      reviewStatus: 'approved',
      lineItems: [
        { description: 'Airport Ride to Client Office', quantity: 1, unitPrice: 3420, lineTotal: 3420 },
      ],
      warnings: [],
    },
  ];

  runInTransaction((txDb) => {
    for (const item of sampleInvoices) {
      // Check if document already seeded
      const existing = txDb.prepare('SELECT id FROM documents WHERE original_filename = ?').get(item.filename);
      if (existing) continue;

      const docId = generateId();
      const invoiceId = generateId();
      const dummyContent = Buffer.from(
        `[SYNTHETIC SAMPLE INVOICE]\nVendor: ${item.vendor}\nInvoice: ${item.invoiceNumber}\nDate: ${item.date}\nTotal: ${item.total / 100} ${item.currency}\nItems:\n` +
          item.lineItems.map((li) => `- ${li.description}: $${li.lineTotal / 100}`).join('\n')
      );

      const saved = StorageService.saveFile(dummyContent, item.filename);
      const now = new Date().toISOString();

      txDb.prepare(`
        INSERT INTO documents (
          id, original_filename, stored_filename, file_hash, mime_type, file_size, storage_path, processing_status, uploaded_at, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
      `).run(
        docId,
        item.filename,
        saved.storedFilename,
        saved.fileHash,
        item.filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
        saved.fileSize,
        saved.storagePath,
        now,
        now
      );

      txDb.prepare(`
        INSERT INTO invoices (
          id, document_id, vendor_name, invoice_number, invoice_date, due_date,
          currency, subtotal_minor, tax_minor, discount_minor, total_minor,
          category, payment_status, review_status, duplicate_status, duplicate_of,
          extraction_data_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', NULL, ?, ?, ?)
      `).run(
        invoiceId,
        docId,
        item.vendor,
        item.invoiceNumber,
        item.date,
        item.dueDate,
        item.currency,
        item.subtotal,
        item.tax,
        item.discount,
        item.total,
        item.category,
        item.paymentStatus,
        item.reviewStatus,
        JSON.stringify({
          extracted: {
            vendor_name: item.vendor,
            invoice_number: item.invoiceNumber,
            invoice_date: item.date,
            due_date: item.dueDate,
            currency: item.currency,
            subtotal: item.subtotal / 100,
            tax: item.tax / 100,
            discount: item.discount / 100,
            total: item.total / 100,
            category: item.category,
            payment_status: item.paymentStatus,
            evidence: {
              vendor_evidence: item.vendor,
              invoice_number_evidence: item.invoiceNumber,
              date_evidence: item.date,
              total_evidence: `${item.total / 100} ${item.currency}`,
            },
          },
          warnings: item.warnings,
          modelUsed: 'sample-synthetic-generator',
          isSampleData: true,
        }),
        now,
        now
      );

      const insertLi = txDb.prepare(`
        INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price_minor, line_total_minor)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const li of item.lineItems) {
        insertLi.run(generateId(), invoiceId, li.description, li.quantity, li.unitPrice, li.lineTotal);
      }
    }
  });

  console.log('✅ Demo invoices successfully seeded and labeled as sample data.');
}

// Run if called directly
if (process.argv[1]?.includes('seed')) {
  seedDemoData();
}
