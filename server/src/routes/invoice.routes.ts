import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';

const router = Router();

// GET /api/invoices - Search, filter, paginate invoices
router.get('/', InvoiceController.getInvoices);

// GET /api/invoices/:id - Get single invoice with full details
router.get('/:id', InvoiceController.getInvoiceById);

// PATCH /api/invoices/:id - Update invoice and line items
router.patch('/:id', InvoiceController.updateInvoice);

// POST /api/invoices/:id/approve - Approve invoice
router.post('/:id/approve', InvoiceController.approveInvoice);

// POST /api/invoices/:id/reject - Reject invoice
router.post('/:id/reject', InvoiceController.rejectInvoice);

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', InvoiceController.deleteInvoice);

export default router;
