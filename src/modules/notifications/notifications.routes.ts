import { Router } from 'express';
import { NotificationsController } from './notifications.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/', NotificationsController.getNotifications);
router.patch('/:id/read', NotificationsController.markAsRead);
router.get('/audit-logs', requirePermission('audit:view'), NotificationsController.getAuditLogs);

export const notificationRoutes = router;
