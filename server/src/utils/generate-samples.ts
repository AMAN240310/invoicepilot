import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Generates a valid PDF buffer using PDFKit
 */
export function buildInvoicePdf(invoice: {
  title: string;
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  category: string;
  paymentStatus: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  notes?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text(invoice.title, { align: 'left' });
    doc.fontSize(10).font('Helvetica').text(`Issued by: ${invoice.vendor}`, { align: 'left' });
    doc.moveDown(1);

    // Metadata Grid
    doc.fontSize(10).font('Helvetica-Bold').text('Invoice Details:');
    doc.font('Helvetica');
    doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
    doc.text(`Invoice Date: ${invoice.invoiceDate}`);
    doc.text(`Due Date: ${invoice.dueDate}`);
    doc.text(`Currency: ${invoice.currency}`);
    doc.text(`Category: ${invoice.category}`);
    doc.text(`Payment Status: ${invoice.paymentStatus}`);
    doc.moveDown(1);

    // Line items table
    doc.font('Helvetica-Bold').text('Itemized Goods & Services:');
    doc.font('Helvetica');
    doc.moveDown(0.5);

    for (const item of invoice.lineItems) {
      doc.text(
        `• ${item.description} (Qty: ${item.quantity}) - ${invoice.currency} ${item.total.toFixed(2)}`
      );
    }
    doc.moveDown(1);

    // Financial Totals
    doc.font('Helvetica-Bold');
    doc.text(`Subtotal: ${invoice.currency} ${invoice.subtotal.toFixed(2)}`);
    doc.text(`Tax: ${invoice.currency} ${invoice.tax.toFixed(2)}`);
    doc.text(`Discount: ${invoice.currency} ${invoice.discount.toFixed(2)}`);
    doc.fontSize(14).text(`Total Amount Due: ${invoice.currency} ${invoice.total.toFixed(2)}`);
    doc.moveDown(1);

    if (invoice.notes) {
      doc.fontSize(9).font('Helvetica-Oblique').text(`Notes: ${invoice.notes}`);
    }

    doc.end();
  });
}

async function generateAllSamples() {
  const rootSamplesDir = path.resolve(import.meta.dirname, '../../../sample-invoices');
  const serverSamplesDir = path.resolve(import.meta.dirname, '../../sample-invoices');

  [rootSamplesDir, serverSamplesDir].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // 1. Digital Cloud Invoice
  const cloudPdf = await buildInvoicePdf({
    title: 'OFFICIAL TAX INVOICE',
    vendor: 'CloudStack Networks Inc.',
    invoiceNumber: 'CSN-2026-4491',
    invoiceDate: '2026-10-02',
    dueDate: '2026-11-02',
    currency: 'USD',
    subtotal: 470.0,
    tax: 37.6,
    discount: 0.0,
    total: 507.6,
    category: 'Software and Subscriptions',
    paymentStatus: 'paid',
    lineItems: [
      { description: 'Dedicated Kubernetes Cluster Node Pool', quantity: 1, unitPrice: 350.0, total: 350.0 },
      { description: 'Global Anycast CDN Traffic (10TB)', quantity: 1, unitPrice: 120.0, total: 120.0 },
    ],
    notes: 'Paid via Corporate Visa card ending in 4012.',
  });

  // 2. Exact Duplicate of Cloud Invoice
  const exactPdf = cloudPdf;

  // 3. Probable Duplicate (same vendor, invoice #, currency, total, but printed as customer duplicate)
  const probablePdf = await buildInvoicePdf({
    title: 'DUPLICATE CUSTOMER COPY',
    vendor: 'CloudStack Networks Inc.',
    invoiceNumber: 'CSN-2026-4491',
    invoiceDate: '2026-10-02',
    dueDate: '2026-11-02',
    currency: 'USD',
    subtotal: 470.0,
    tax: 37.6,
    discount: 0.0,
    total: 507.6,
    category: 'Software and Subscriptions',
    paymentStatus: 'paid',
    lineItems: [
      { description: 'Dedicated Kubernetes Cluster Node Pool', quantity: 1, unitPrice: 350.0, total: 350.0 },
      { description: 'Global Anycast CDN Traffic (10TB)', quantity: 1, unitPrice: 120.0, total: 120.0 },
    ],
    notes: 'Customer reprint copy requested from billing portal on 2026-10-15.',
  });

  // 4. Financial Discrepancy Invoice ($100 + $10 - $0 != $145.00)
  const discrepancyPdf = await buildInvoicePdf({
    title: 'COMMERCIAL INVOICE',
    vendor: 'Office Depot Logistics',
    invoiceNumber: 'ODL-99102',
    invoiceDate: '2026-10-08',
    dueDate: '2026-10-22',
    currency: 'USD',
    subtotal: 100.0,
    tax: 10.0,
    discount: 0.0,
    total: 145.0, // Stated total deliberately does not match math: $100 + $10 = $110 != $145
    category: 'Office Supplies',
    paymentStatus: 'unpaid',
    lineItems: [
      { description: 'Laser Printer Toner Cartridges (High Yield)', quantity: 1, unitPrice: 100.0, total: 100.0 },
    ],
    notes: 'Audit discrepancy flag test.',
  });

  // 5. European / Multi-Currency Invoice (EUR)
  const eurPdf = await buildInvoicePdf({
    title: 'FACTURE DE SERVICES',
    vendor: 'Atlassian Cloud Europe SAS',
    invoiceNumber: 'ATL-EU-2026-781',
    invoiceDate: '2026-10-12',
    dueDate: '2026-11-12',
    currency: 'EUR',
    subtotal: 210.0,
    tax: 42.0,
    discount: 10.0,
    total: 242.0,
    category: 'Software and Subscriptions',
    paymentStatus: 'paid',
    lineItems: [
      { description: 'Jira Software Premium (10 users)', quantity: 1, unitPrice: 150.0, total: 150.0 },
      { description: 'Confluence Standard (10 users)', quantity: 1, unitPrice: 60.0, total: 60.0 },
    ],
  });

  // Save to both sample dirs
  const files = [
    { name: 'digital_cloud_invoice.pdf', buf: cloudPdf },
    { name: 'exact_duplicate_invoice.pdf', buf: exactPdf },
    { name: 'probable_duplicate_invoice.pdf', buf: probablePdf },
    { name: 'math_discrepancy_invoice.pdf', buf: discrepancyPdf },
    { name: 'european_eur_invoice.pdf', buf: eurPdf },
  ];

  for (const f of files) {
    fs.writeFileSync(path.join(rootSamplesDir, f.name), f.buf);
    fs.writeFileSync(path.join(serverSamplesDir, f.name), f.buf);
  }

  console.log(`✅ Generated ${files.length} authentic, compliant PDF sample invoices.`);
}

generateAllSamples().catch(console.error);
