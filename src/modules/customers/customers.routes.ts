import { Router } from 'express';
import { CustomersController } from './customers.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/', CustomersController.getCustomers);
router.post('/', requirePermission('customer:manage'), CustomersController.createCustomer);
router.post('/due-payments', requirePermission('customer:manage'), CustomersController.recordDuePayment);
router.get('/:id/ledger', CustomersController.getCustomerLedger);

export const customerRoutes = router;
