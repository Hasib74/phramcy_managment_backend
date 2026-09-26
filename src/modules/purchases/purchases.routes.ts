import { Router } from 'express';
import { PurchasesController } from './purchases.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/suppliers', PurchasesController.getSuppliers);
router.post('/suppliers', requirePermission('supplier:manage'), PurchasesController.createSupplier);
router.get('/suppliers/:supplierId/ledger', PurchasesController.getSupplierLedger);

router.post('/invoices', requirePermission('purchase:create'), PurchasesController.createPurchaseInvoice);

export const purchaseRoutes = router;
