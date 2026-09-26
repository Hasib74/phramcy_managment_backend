import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../../config/env.config.js';
import { createServiceLogger } from '../../config/logger.js';
import { correlationMiddleware } from '../../middlewares/correlation.middleware.js';
import { errorHandler } from '../../middlewares/error.middleware.js';
import { accountingRoutes } from '../../modules/accounting/accounting.routes.js';
import { customerRoutes } from '../../modules/customers/customers.routes.js';
import { checkDbConnection } from '../../database/connection.js';

const logger = createServiceLogger('accounting-service');
const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(correlationMiddleware);

app.get('/health', (req, res) => {
  res.json({ service: 'Accounting & Customer CRM Microservice', status: 'healthy', timestamp: new Date().toISOString() });
});

app.use(`${env.API_PREFIX}/accounting`, accountingRoutes);
app.use(`${env.API_PREFIX}/customers`, customerRoutes);
app.use(errorHandler);

const PORT = process.env.ACCOUNTING_SERVICE_PORT || 5005;

checkDbConnection().then(() => {
  app.listen(PORT, () => {
    logger.info(`💰 Accounting & Finance Microservice is running on port ${PORT}`);
  });
});
