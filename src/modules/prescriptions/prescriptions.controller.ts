import { Request, Response, NextFunction } from 'express';
import { PrescriptionsService } from './prescriptions.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class PrescriptionsController {
  static async createPrescription(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.body.branchId || req.branchId!;
      const result = await PrescriptionsService.createPrescription(req.organizationId!, branchId, req.body);
      return sendSuccess(res, 'Prescription uploaded successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getPrescriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PrescriptionsService.getPrescriptions(
        req.organizationId!,
        req.query.status as string,
        req.query.customerId as string
      );
      return sendSuccess(res, 'Prescriptions fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async reviewPrescription(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PrescriptionsService.reviewPrescription(
        req.organizationId!,
        req.params.id as string,
        req.user!.userId,
        req.body
      );
      return sendSuccess(res, 'Prescription reviewed successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
