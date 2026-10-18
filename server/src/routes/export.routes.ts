import { Router } from 'express';
import { ExportController } from '../controllers/export.controller.js';

const router = Router();

// GET /api/export/csv - Export invoices as CSV
router.get('/csv', ExportController.exportCsv);

export default router;
