import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../../config/env.config.js';
import { createServiceLogger } from '../../config/logger.js';
import { correlationMiddleware } from '../../middlewares/correlation.middleware.js';
import { errorHandler } from '../../middlewares/error.middleware.js';
import { purchaseRoutes } from '../../modules/purchases/purchases.routes.js';
import { checkDbConnection } from '../../database/connection.js';

const logger = createServiceLogger('procurement-service');
const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(correlationMiddleware);

app.get('/health', (req, res) => {
  res.json({ service: 'Procurement & Supplier Microservice', status: 'healthy', timestamp: new Date().toISOString() });
});

app.use(`${env.API_PREFIX}/purchases`, purchaseRoutes);
app.use(errorHandler);

const PORT = process.env.PROCUREMENT_SERVICE_PORT || 5004;

checkDbConnection().then(() => {
  app.listen(PORT, () => {
    logger.info(`📦 Procurement & Supplier Microservice is running on port ${PORT}`);
  });
});
