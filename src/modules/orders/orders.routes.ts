import { Router } from 'express';
import { OrdersController } from './orders.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

// Public or Tenant scoped
router.get('/website', authenticate, requireTenant, OrdersController.getWebsiteConfig);
router.put('/website', authenticate, requireTenant, requirePermission('website:manage'), OrdersController.updateWebsiteConfig);

router.get('/', authenticate, requireTenant, requirePermission('order:manage'), OrdersController.getOrders);
router.post('/', authenticate, requireTenant, OrdersController.placeOnlineOrder);
router.patch('/:id/status', authenticate, requireTenant, requirePermission('order:manage'), OrdersController.updateOrderStatus);

router.get('/riders', authenticate, requireTenant, requirePermission('delivery:manage'), OrdersController.getRiders);

export const orderRoutes = router;
