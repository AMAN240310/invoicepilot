import express from 'express';
import cors from 'cors';
import documentRoutes from './routes/document.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import exportRoutes from './routes/export.routes.js';
import healthRoutes from './routes/health.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export function createApp(): express.Application {
  const app = express();

  // CORS allowing all local development ports (5173, 5174, 3000, etc.)
  app.use(
    cors({
      origin: [
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Safe API logging without recording sensitive document content
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api')) {
      const sanitizedQuery = { ...req.query };
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, Object.keys(sanitizedQuery).length > 0 ? sanitizedQuery : '');
    }
    next();
  });

  // Mount API Routes
  app.use('/api/documents', documentRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/health', healthRoutes);

  // 404 & Global Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
