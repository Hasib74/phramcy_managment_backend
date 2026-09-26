import { Router } from 'express';
import { OrganizationsController } from './organizations.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

router.use(authenticate, requireTenant);

// Organization Profile & Settings
router.get('/profile', OrganizationsController.getProfile);
router.put('/settings', requirePermission('org:manage'), OrganizationsController.updateSettings);

// Branches Management
router.get('/branches', OrganizationsController.getBranches);
router.post('/branches', requirePermission('branch:manage'), OrganizationsController.createBranch);

// Warehouses Management
router.get('/warehouses', OrganizationsController.getWarehouses);
router.post('/warehouses', requirePermission('stock:adjust'), OrganizationsController.createWarehouse);

// User & Role Assignment
router.get('/users', requirePermission('user:manage'), OrganizationsController.getUsers);
router.post('/users', requirePermission('user:manage'), OrganizationsController.createUser);

export const organizationRoutes = router;
