import { Router } from 'express';
import { ProductsController } from './products.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/tenant.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';

const router = Router();

// Apply auth & tenant isolation to all product routes
router.use(authenticate, requireTenant);

router.get('/', ProductsController.getProducts);
router.get('/categories', ProductsController.getCategories);
router.get('/generics', ProductsController.getGenerics);
router.get('/manufacturers', ProductsController.getManufacturers);
router.get('/metadata', ProductsController.getMetadata);
router.get('/:id', ProductsController.getProductById);

router.post('/', requirePermission('product:create'), ProductsController.createProduct);
router.put('/:id', requirePermission('product:update'), ProductsController.updateProduct);

export const productRoutes = router;
