import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

export const correlationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || (req.headers['x-request-id'] as string) || uuidv4();
  req.correlationId = correlationId;
  req.startTime = Date.now();

  res.setHeader('X-Correlation-ID', correlationId);

  // Log on response completion
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    const logData = {
      correlationId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
      organizationId: req.organizationId || null,
      userId: req.user?.userId || null,
      userAgent: req.headers['user-agent'] || null
    };

    if (res.statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.originalUrl} [${res.statusCode}] - ${duration}ms`, logData);
    } else if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.originalUrl} [${res.statusCode}] - ${duration}ms`, logData);
    } else {
      logger.info(`HTTP ${req.method} ${req.originalUrl} [${res.statusCode}] - ${duration}ms`, logData);
    }
  });

  next();
};
