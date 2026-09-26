import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { env } from './env.config.js';

const logDirectory = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Custom log format for structured JSON in production
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Custom log format for readable colored output in development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, correlationId, service, stack, ...meta }) => {
    let log = `[${timestamp}] [${level}]`;
    if (service) log += ` [${service}]`;
    if (correlationId) log += ` [CID: ${correlationId}]`;
    log += `: ${message}`;

    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

// Daily Rotate File for Combined Logs
const combinedRotateTransport = new DailyRotateFile({
  filename: path.join(logDirectory, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '50m',
  maxFiles: '30d',
  level: 'info',
  format: jsonFormat
});

// Daily Rotate File for Errors
const errorRotateTransport = new DailyRotateFile({
  filename: path.join(logDirectory, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '60d',
  level: 'error',
  format: jsonFormat
});

// Daily Rotate File for Critical Business & Security Audits
const auditRotateTransport = new DailyRotateFile({
  filename: path.join(logDirectory, 'audit-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '50m',
  maxFiles: '90d',
  level: 'info',
  format: jsonFormat
});

// Main Winston Logger Instance
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: {
    service: 'pharmacy-os-gateway',
    environment: env.NODE_ENV
  },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'production' ? jsonFormat : consoleFormat
    }),
    combinedRotateTransport,
    errorRotateTransport
  ],
  exitOnError: false
});

/**
 * Create a scoped child logger for individual microservices
 */
export const createServiceLogger = (serviceName: string) => {
  return logger.child({ service: serviceName });
};

/**
 * Dedicated Audit Logger for sensitive financial and stock operations
 */
export const auditLogger = winston.createLogger({
  level: 'info',
  defaultMeta: { type: 'AUDIT_LOG', environment: env.NODE_ENV },
  transports: [auditRotateTransport]
});
