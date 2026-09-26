import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/stocks', requirePermission('stock:view'), InventoryController.getStocks);
router.get('/fefo-recommendation', InventoryController.getFEFORecommendation);
router.get('/expiring-batches', InventoryController.getExpiringBatches);

router.post('/adjustments', requirePermission('stock:adjust'), InventoryController.createStockAdjustment);
router.post('/transfers', requirePermission('stock:transfer'), InventoryController.createTransfer);
router.patch('/transfers/:id/status', requirePermission('stock:transfer'), InventoryController.updateTransferStatus);

export const inventoryRoutes = router;
