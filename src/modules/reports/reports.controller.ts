import { Request, Response, NextFunction } from 'express';
import { ReportsService } from './reports.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class ReportsController {
  static async getDashboardOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = (req.query.branchId as string) || req.branchId;
      const result = await ReportsService.getDashboardOverview(req.organizationId!, branchId);
      return sendSuccess(res, 'Dashboard overview data fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
