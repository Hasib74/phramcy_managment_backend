import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.config.js';
import { errorHandler } from './middlewares/error.middleware.js';

// Route Modules
import { authRoutes } from './modules/auth/auth.routes.js';
import { organizationRoutes } from './modules/organizations/organizations.routes.js';
import { productRoutes } from './modules/products/products.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { purchaseRoutes } from './modules/purchases/purchases.routes.js';
import { posRoutes } from './modules/pos/pos.routes.js';
import { customerRoutes } from './modules/customers/customers.routes.js';
import { prescriptionRoutes } from './modules/prescriptions/prescriptions.routes.js';
import { accountingRoutes } from './modules/accounting/accounting.routes.js';
import { hrRoutes } from './modules/hr/hr.routes.js';
import { orderRoutes } from './modules/orders/orders.routes.js';
import { reportRoutes } from './modules/reports/reports.routes.js';
import { notificationRoutes } from './modules/notifications/notifications.routes.js';
import { correlationMiddleware } from './middlewares/correlation.middleware.js';

export const createApp = (): Express => {
  const app = express();

  // Security & Middleware
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Correlation ID Tracing & Structured HTTP Logger
  app.use(correlationMiddleware);

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests from this IP, please try again later.' }
  });
  app.use('/api/', limiter);

  // Health Check Endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'Pharmacy Business Operating System API'
    });
  });

  // API Domain Routes
  const prefix = env.API_PREFIX;
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/organizations`, organizationRoutes);
  app.use(`${prefix}/products`, productRoutes);
  app.use(`${prefix}/inventory`, inventoryRoutes);
  app.use(`${prefix}/purchases`, purchaseRoutes);
  app.use(`${prefix}/pos`, posRoutes);
  app.use(`${prefix}/customers`, customerRoutes);
  app.use(`${prefix}/prescriptions`, prescriptionRoutes);
  app.use(`${prefix}/accounting`, accountingRoutes);
  app.use(`${prefix}/hr`, hrRoutes);
  app.use(`${prefix}/orders`, orderRoutes);
  app.use(`${prefix}/reports`, reportRoutes);
  app.use(`${prefix}/notifications`, notificationRoutes);

  // 404 Handler
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: `Route not found: [${req.method}] ${req.originalUrl}`
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
