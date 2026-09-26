import { Router } from 'express';
import { AccountingController } from './accounting.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

router.get('/chart-of-accounts', AccountingController.getChartOfAccounts);
router.post('/journal-entries', requirePermission('accounting:manage'), AccountingController.createJournalEntry);

router.get('/expenses', AccountingController.getExpenses);
router.post('/expenses', requirePermission('expense:manage'), AccountingController.createExpense);

router.get('/daily-closing', AccountingController.getDailyClosing);

export const accountingRoutes = router;
