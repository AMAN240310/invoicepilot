import { Request, Response, NextFunction } from 'express';
import { CsvService } from '../services/csv.service.js';
import { QueryExportSchema } from '../validators/schemas.js';

export class ExportController {
  static async exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options = QueryExportSchema.parse(req.query);
      const result = CsvService.generateInvoicesCsv(options);

      if (result.count === 0) {
        res.status(200).json({
          success: false,
          message: 'No eligible invoice records found matching the specified export filters.',
          count: 0,
        });
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `invoicepilot-invoices-${dateStr}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Total-Count', result.count.toString());

      res.send(result.csv);
    } catch (err) {
      next(err);
    }
  }
}
