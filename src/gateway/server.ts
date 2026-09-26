import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { env } from '../config/env.config.js';
import { logger } from '../config/logger.js';
import { correlationMiddleware } from '../middlewares/correlation.middleware.js';
import { errorHandler } from '../middlewares/error.middleware.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(correlationMiddleware);

// Rate Limiting on API Gateway
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests on Gateway, please slow down.' }
});
app.use('/api/', limiter);

// Microservices Routing Map
const microservices = [
  { prefix: `${env.API_PREFIX}/auth`, target: process.env.AUTH_SERVICE_URL || 'http://localhost:5001', name: 'Auth & Tenancy Service' },
  { prefix: `${env.API_PREFIX}/products`, target: process.env.INVENTORY_SERVICE_URL || 'http://localhost:5002', name: 'Product & Inventory Service' },
  { prefix: `${env.API_PREFIX}/inventory`, target: process.env.INVENTORY_SERVICE_URL || 'http://localhost:5002', name: 'Product & Inventory Service' },
  { prefix: `${env.API_PREFIX}/pos`, target: process.env.POS_SERVICE_URL || 'http://localhost:5003', name: 'POS & Sales Service' },
  { prefix: `${env.API_PREFIX}/purchases`, target: process.env.PROCUREMENT_SERVICE_URL || 'http://localhost:5004', name: 'Procurement Service' },
  { prefix: `${env.API_PREFIX}/accounting`, target: process.env.ACCOUNTING_SERVICE_URL || 'http://localhost:5005', name: 'Accounting Service' },
  { prefix: `${env.API_PREFIX}/customers`, target: process.env.ACCOUNTING_SERVICE_URL || 'http://localhost:5005', name: 'Customer CRM Service' },
  { prefix: `${env.API_PREFIX}/hr`, target: process.env.HR_SERVICE_URL || 'http://localhost:5006', name: 'HR & Payroll Service' },
  { prefix: `${env.API_PREFIX}/orders`, target: process.env.ORDER_SERVICE_URL || 'http://localhost:5007', name: 'Order & Delivery Service' },
  { prefix: `${env.API_PREFIX}/reports`, target: process.env.REPORTS_SERVICE_URL || 'http://localhost:5008', name: 'Reports & BI Service' }
];

// Gateway Health Check & Microservices Status
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    gateway: 'API Gateway Reverse Proxy',
    timestamp: new Date().toISOString(),
    microservices: microservices.map((s) => ({
      name: s.name,
      prefix: s.prefix,
      target: s.target
    }))
  });
});

// Configure Reverse Proxies
for (const service of microservices) {
  app.use(
    service.prefix,
    createProxyMiddleware({
      target: service.target,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq, req: any) => {
          if (req.correlationId) {
            proxyReq.setHeader('X-Correlation-ID', req.correlationId);
          }
        },
        error: (err, req, res: any) => {
          logger.error(`Gateway proxy error forwarding to [${service.name}] (${service.target}):`, err);
          if (!res.headersSent) {
            res.status(503).json({
              success: false,
              message: `Service [${service.name}] is currently unavailable. Please check if the microservice is running.`,
              service: service.name
            });
          }
        }
      }
    })
  );
}

app.use(errorHandler);

const GATEWAY_PORT = process.env.GATEWAY_PORT || env.PORT || 5000;

app.listen(GATEWAY_PORT, () => {
  logger.info(`🌐 API Gateway running on port ${GATEWAY_PORT}`);
  logger.info(`📡 Health: http://localhost:${GATEWAY_PORT}/api/health`);
  microservices.forEach((s) => {
    logger.info(`   🔀 Route: ${s.prefix} -> ${s.target} (${s.name})`);
  });
});
