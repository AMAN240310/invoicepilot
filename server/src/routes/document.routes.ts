import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller.js';
import { uploadMiddleware } from '../middleware/upload.middleware.js';

const router = Router();

// POST /api/documents/upload - Upload one or more documents
router.post('/upload', uploadMiddleware.array('documents', 10), DocumentController.uploadDocuments);

// GET /api/documents - List documents with pagination and status filter
router.get('/', DocumentController.getDocuments);

// GET /api/documents/:id - Get document by ID with logs
router.get('/:id', DocumentController.getDocumentById);

// GET /api/documents/:id/file - Stream document file for in-browser viewer
router.get('/:id/file', DocumentController.serveFile);

// POST /api/documents/:id/process - Retry processing
router.post('/:id/process', DocumentController.reprocessDocument);

// DELETE /api/documents/:id - Delete document and file
router.delete('/:id', DocumentController.deleteDocument);

export default router;
