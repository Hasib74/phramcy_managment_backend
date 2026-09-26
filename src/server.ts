import { createApp } from './app.js';
import { env } from './config/env.config.js';
import { logger } from './config/logger.js';
import { checkDbConnection } from './database/connection.js';

const startServer = async () => {
  logger.info('⏳ Bootstrapping Pharmacy Business Operating System Backend Engine...');

  // Verify PostgreSQL Database Connection
  const isDbConnected = await checkDbConnection();
  if (!isDbConnected) {
    logger.warn('⚠️ Warning: Database connection failed. Please ensure PostgreSQL is running and credentials in .env are correct.');
  }

  const app = createApp();
  const PORT = env.PORT;

  const server = app.listen(PORT, () => {
    logger.info('===============================================================');
    logger.info(`🚀 Pharmacy Operating System Backend Engine is active!`);
    logger.info(`📡 URL: http://localhost:${PORT}`);
    logger.info(`🩺 Health check: http://localhost:${PORT}/api/health`);
    logger.info(`🌐 Environment: ${env.NODE_ENV}`);
    logger.info(`📋 API Prefix: ${env.API_PREFIX}`);
    logger.info('===============================================================');
  });

  const handleShutdown = async (signal: string) => {
    logger.info(`🛑 Received ${signal}. Gracefully shutting down...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
};

startServer().catch((err) => {
  logger.error('❌ Fatal server startup error:', err);
  process.exit(1);
});
