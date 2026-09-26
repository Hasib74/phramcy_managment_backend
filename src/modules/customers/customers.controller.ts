import { Request, Response, NextFunction } from 'express';
import { CustomersService } from './customers.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class CustomersController {
  static async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await CustomersService.getCustomers(req.organizationId!, req.query.search as string);
      return sendSuccess(res, 'Customers fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await CustomersService.createCustomer(req.organizationId!, req.body);
      return sendSuccess(res, 'Customer created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async recordDuePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.body.branchId || req.branchId!;
      const result = await CustomersService.recordDuePayment(
        req.organizationId!,
        branchId,
        req.user!.userId,
        req.body
      );
      return sendSuccess(res, 'Customer due payment recorded successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await CustomersService.getCustomerLedger(req.organizationId!, req.params.id as string);
      return sendSuccess(res, 'Customer ledger fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
