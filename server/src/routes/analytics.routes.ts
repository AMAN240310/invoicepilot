import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';

const router = Router();

// GET /api/analytics/summary - High-level metrics
router.get('/summary', AnalyticsController.getSummary);

// GET /api/analytics/monthly - Monthly expenses
router.get('/monthly', AnalyticsController.getMonthly);

// GET /api/analytics/categories - Category breakdown
router.get('/categories', AnalyticsController.getCategories);

// GET /api/analytics/vendors - Vendor totals
router.get('/vendors', AnalyticsController.getVendors);

export default router;
