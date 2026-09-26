import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../../config/env.config.js';
import { createServiceLogger } from '../../config/logger.js';
import { correlationMiddleware } from '../../middlewares/correlation.middleware.js';
import { errorHandler } from '../../middlewares/error.middleware.js';
import { productRoutes } from '../../modules/products/products.routes.js';
import { inventoryRoutes } from '../../modules/inventory/inventory.routes.js';
import { checkDbConnection } from '../../database/connection.js';

const logger = createServiceLogger('product-inventory-service');
const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(correlationMiddleware);

app.get('/health', (req, res) => {
  res.json({ service: 'Product & Inventory (FEFO) Microservice', status: 'healthy', timestamp: new Date().toISOString() });
});

app.use(`${env.API_PREFIX}/products`, productRoutes);
app.use(`${env.API_PREFIX}/inventory`, inventoryRoutes);
app.use(errorHandler);

const PORT = process.env.INVENTORY_SERVICE_PORT || 5002;

checkDbConnection().then(() => {
  app.listen(PORT, () => {
    logger.info(`💊 Product & Inventory (FEFO) Microservice is running on port ${PORT}`);
  });
});
