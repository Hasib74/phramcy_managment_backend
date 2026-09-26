import { Router } from 'express';
import { ReportsController } from './reports.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/dashboard-overview', ReportsController.getDashboardOverview);

export const reportRoutes = router;
