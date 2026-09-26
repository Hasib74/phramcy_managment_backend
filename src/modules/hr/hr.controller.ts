import { Request, Response, NextFunction } from 'express';
import { HRService } from './hr.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class HRController {
  static async getEmployees(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = (req.query.branchId as string) || req.branchId;
      const result = await HRService.getEmployees(req.organizationId!, branchId, req.query.search as string);
      return sendSuccess(res, 'Employees fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.body.branchId || req.branchId;
      const result = await HRService.createEmployee(req.organizationId!, { ...req.body, branchId });
      return sendSuccess(res, 'Employee created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async recordAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.body.branchId || req.branchId!;
      const result = await HRService.recordAttendance(req.organizationId!, branchId, req.user!.userId, req.body);
      return sendSuccess(res, `Attendance ${result.action.toLowerCase()} recorded successfully`, result);
    } catch (error) {
      next(error);
    }
  }

  static async processPayroll(req: Request, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.body;
      const result = await HRService.processPayroll(req.organizationId!, req.user!.userId, parseInt(month, 10), parseInt(year, 10));
      return sendSuccess(res, 'Monthly payroll cycle processed successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
