import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util.js';

export const requireTenant = (req: Request, res: Response, next: NextFunction) => {
  if (!req.organizationId) {
    return sendError(res, 'Tenant context missing. Request must belong to an authenticated organization.', 403);
  }
  next();
};

export const requireBranch = (req: Request, res: Response, next: NextFunction) => {
  if (!req.branchId) {
    return sendError(res, 'Branch context missing. Provide x-branch-id header or ensure user has a default branch assigned.', 400);
  }
  next();
};
