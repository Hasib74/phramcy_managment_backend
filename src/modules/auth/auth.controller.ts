import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.registerOrganization(req.body);
      return sendSuccess(res, 'Pharmacy organization registered successfully!', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, organizationSlug } = req.body;
      const result = await AuthService.login(email, password, organizationSlug);
      return sendSuccess(res, 'Login successful!', result);
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refreshToken(refreshToken);
      return sendSuccess(res, 'Token refreshed successfully!', result);
    } catch (error) {
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.getCurrentUser(req.user!.userId);
      return sendSuccess(res, 'User profile fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
