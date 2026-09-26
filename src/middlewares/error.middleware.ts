import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util.js';
import { env } from '../config/env.config.js';

export class AppError extends Error {
  statusCode: number;
  errors?: any;

  constructor(message: string, statusCode = 400, errors?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('💥 Unhandled Error:', err);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || undefined;

  // Handle Postgres Unique Constraint Violation (23505)
  if (err.code === '23505') {
    statusCode = 409;
    message = 'Duplicate record found. A unique constraint was violated.';
    errors = { detail: err.detail };
  }

  // Handle Postgres Foreign Key Violation (23503)
  if (err.code === '23503') {
    statusCode = 400;
    message = 'Invalid reference. Related record does not exist.';
    errors = { detail: err.detail };
  }

  // Handle JSON Web Token Error
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid or malformed authentication token.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired. Please log in again.';
  }

  return sendError(
    res,
    message,
    statusCode,
    env.NODE_ENV === 'development' ? { ...errors, stack: err.stack } : errors
  );
};
