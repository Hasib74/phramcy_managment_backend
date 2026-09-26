import { Request, Response, NextFunction } from 'express';
import { NotificationsService } from './notifications.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class NotificationsController {
  static async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const unreadOnly = req.query.unreadOnly === 'true';
      const result = await NotificationsService.getNotifications(req.organizationId!, req.user!.userId, unreadOnly);
      return sendSuccess(res, 'Notifications fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await NotificationsService.markAsRead(req.organizationId!, req.params.id as string);
      return sendSuccess(res, 'Notification marked as read', result);
    } catch (error) {
      next(error);
    }
  }

  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const result = await NotificationsService.getAuditLogs(req.organizationId!, limit);
      return sendSuccess(res, 'Audit logs fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
