import { Request, Response, NextFunction } from 'express';
import { OrganizationsService } from './organizations.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class OrganizationsController {
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrganizationsService.getOrganizationProfile(req.organizationId!);
      return sendSuccess(res, 'Organization profile fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrganizationsService.updateOrganizationSettings(req.organizationId!, req.body);
      return sendSuccess(res, 'Organization settings updated successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrganizationsService.getBranches(req.organizationId!);
      return sendSuccess(res, 'Branches fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrganizationsService.createBranch(req.organizationId!, req.body);
      return sendSuccess(res, 'Branch created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getWarehouses(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.query.branchId as string;
      const result = await OrganizationsService.getWarehouses(req.organizationId!, branchId);
      return sendSuccess(res, 'Warehouses fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createWarehouse(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrganizationsService.createWarehouse(req.organizationId!, req.body);
      return sendSuccess(res, 'Warehouse created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrganizationsService.getOrganizationUsers(req.organizationId!);
      return sendSuccess(res, 'Users fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrganizationsService.createOrganizationUser(req.organizationId!, req.body);
      return sendSuccess(res, 'User created and role assigned successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }
}
