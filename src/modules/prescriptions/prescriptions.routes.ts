import { Router } from 'express';
import { PrescriptionsController } from './prescriptions.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.post('/', PrescriptionsController.createPrescription);
router.get('/', PrescriptionsController.getPrescriptions);
router.patch('/:id/review', requirePermission('prescription:manage'), PrescriptionsController.reviewPrescription);

export const prescriptionRoutes = router;
