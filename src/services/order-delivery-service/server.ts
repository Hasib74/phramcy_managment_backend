import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../../config/env.config.js';
import { createServiceLogger } from '../../config/logger.js';
import { correlationMiddleware } from '../../middlewares/correlation.middleware.js';
import { errorHandler } from '../../middlewares/error.middleware.js';
import { orderRoutes } from '../../modules/orders/orders.routes.js';
import { checkDbConnection } from '../../database/connection.js';

const logger = createServiceLogger('order-delivery-service');
const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(correlationMiddleware);

app.get('/health', (req, res) => {
  res.json({ service: 'Order, Delivery & Website CMS Microservice', status: 'healthy', timestamp: new Date().toISOString() });
});

app.use(`${env.API_PREFIX}/orders`, orderRoutes);
app.use(errorHandler);

const PORT = process.env.ORDER_SERVICE_PORT || 5007;

checkDbConnection().then(() => {
  app.listen(PORT, () => {
    logger.info(`🚚 Order & Delivery Microservice is running on port ${PORT}`);
  });
});
