import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util.js';
import { pool } from '../database/connection.js';

export const requirePermission = (permissionSlug: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    // Super admin or organization owner bypasses granular permission check
    if (req.user.isSuperAdmin || req.user.isOrgOwner) {
      return next();
    }

    try {
      const result = await pool.query(
        `
        SELECT COUNT(*) as count
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = $1 AND p.slug = $2
        `,
        [req.user.userId, permissionSlug]
      );

      const hasPermission = parseInt(result.rows[0].count, 10) > 0;
      if (!hasPermission) {
        return sendError(
          res,
          `Access forbidden. You do not have the required permission: [${permissionSlug}]`,
          403
        );
      }

      next();
    } catch (error) {
      return sendError(res, 'Failed to verify permissions', 500, error);
    }
  };
};

export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    if (req.user.isSuperAdmin || req.user.isOrgOwner) {
      return next();
    }

    try {
      const result = await pool.query(
        `
        SELECT r.code
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
        `,
        [req.user.userId]
      );

      const userRoles = result.rows.map((r: { code: string }) => r.code);
      const hasRole = allowedRoles.some((role) => userRoles.includes(role));

      if (!hasRole) {
        return sendError(
          res,
          `Access forbidden. Requires one of the following roles: [${allowedRoles.join(', ')}]`,
          403
        );
      }

      next();
    } catch (error) {
      return sendError(res, 'Failed to verify roles', 500, error);
    }
  };
};
