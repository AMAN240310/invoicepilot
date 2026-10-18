import { Request, Response, NextFunction } from 'express';
import { OllamaService } from '../services/ollama.service.js';
import { config } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import fs from 'fs';

export class HealthController {
  static async getHealth(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const db = getDatabase();
      const dbCheck = db.prepare('SELECT 1 as ok').get() as { ok: number };

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          status: dbCheck?.ok === 1 ? 'connected' : 'error',
          path: config.dbPath,
          exists: fs.existsSync(config.dbPath),
        },
        storage: {
          dataDir: config.dataDir,
          uploadDir: config.uploadDir,
          maxFileSize: `${config.maxFileSizeBytes / 1024 / 1024} MB`,
        },
        ai: {
          mockMode: config.mockAiMode,
          configuredModel: config.ollama.model,
          ollamaBaseUrl: config.ollama.baseUrl,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'unhealthy',
        error: err.message,
      });
    }
  }

  static async getOllamaHealth(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const status = await OllamaService.checkHealth();
      res.json({
        success: true,
        ollama: status,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }
}
