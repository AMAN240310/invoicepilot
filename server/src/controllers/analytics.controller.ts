import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../services/analytics.service.js';

export class AnalyticsController {
  static async getSummary(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = AnalyticsService.getSummary();
      res.json({ success: true, summary });
    } catch (err) {
      next(err);
    }
  }

  static async getMonthly(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currency = (req.query.currency as string) || 'USD';
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const monthly = AnalyticsService.getMonthlyExpenses(currency, startDate, endDate);
      res.json({ success: true, currency, monthly });
    } catch (err) {
      next(err);
    }
  }

  static async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currency = (req.query.currency as string) || 'USD';
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const categories = AnalyticsService.getCategoryExpenses(currency, startDate, endDate);
      res.json({ success: true, currency, categories });
    } catch (err) {
      next(err);
    }
  }

  static async getVendors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currency = (req.query.currency as string) || 'USD';
      const limit = parseInt((req.query.limit as string) || '10', 10);

      const vendors = AnalyticsService.getVendorTotals(currency, limit);
      res.json({ success: true, currency, vendors });
    } catch (err) {
      next(err);
    }
  }
}
