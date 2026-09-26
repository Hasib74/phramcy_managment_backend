import { Router } from 'express';
import { POSController } from './pos.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/search', POSController.searchProducts);
router.post('/sessions/open', POSController.openSession);
router.post('/sessions/:sessionId/close', POSController.closeSession);

router.post('/checkout', requirePermission('sale:create'), POSController.checkout);

router.post('/hold', POSController.holdSale);
router.get('/held', POSController.getHeldSales);
router.delete('/held/:holdId', POSController.deleteHeldSale);

export const posRoutes = router;
