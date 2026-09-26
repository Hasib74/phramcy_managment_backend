import { Router } from 'express';
import { HRController } from './hr.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/employees', requirePermission('hr:manage'), HRController.getEmployees);
router.post('/employees', requirePermission('hr:manage'), HRController.createEmployee);

router.post('/attendance', requirePermission('hr:manage'), HRController.recordAttendance);
router.post('/payroll/process', requirePermission('payroll:manage'), HRController.processPayroll);

export const hrRoutes = router;
