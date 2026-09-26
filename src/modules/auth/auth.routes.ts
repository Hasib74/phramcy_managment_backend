import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateRequest } from '../../middlewares/validator.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { registerOrgSchema, loginSchema, refreshTokenSchema } from './auth.validation.js';

const router = Router();

router.post('/register', validateRequest({ body: registerOrgSchema }), AuthController.register);
router.post('/login', validateRequest({ body: loginSchema }), AuthController.login);
router.post('/refresh-token', validateRequest({ body: refreshTokenSchema }), AuthController.refreshToken);
router.get('/me', authenticate, AuthController.me);

export const authRoutes = router;
