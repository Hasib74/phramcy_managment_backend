import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/hash.util.js';
import { sendError } from '../utils/response.util.js';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      organizationId?: string;
      branchId?: string;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authentication required. Missing Bearer token in Authorization header.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    req.organizationId = decoded.organizationId;
    req.branchId = (req.headers['x-branch-id'] as string) || decoded.branchId || undefined;
    next();
  } catch (error) {
    return sendError(res, 'Invalid or expired authentication token.', 401);
  }
};
