import { Request, Response, NextFunction } from 'express';
import { POSService } from './pos.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class POSController {
  static async searchProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req.query.q as string) || '';
      const branchId = (req.query.branchId as string) || req.branchId!;
      const result = await POSService.searchProducts(req.organizationId!, branchId, query);
      return sendSuccess(res, 'Products searched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async openSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { openingCash } = req.body;
      const branchId = req.body.branchId || req.branchId!;
      const result = await POSService.openSession(
        req.organizationId!,
        branchId,
        req.user!.userId,
        parseFloat(openingCash || '0')
      );
      return sendSuccess(res, 'POS session opened successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async closeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { closingCashCounted, notes } = req.body;
      const result = await POSService.closeSession(
        req.organizationId!,
        req.params.sessionId as string,
        parseFloat(closingCashCounted),
        notes
      );
      return sendSuccess(res, 'POS session closed successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.body.branchId || req.branchId!;
      const result = await POSService.checkoutSale(
        req.organizationId!,
        branchId,
        req.user!.userId,
        req.body
      );
      return sendSuccess(res, 'Sale completed successfully & invoice generated', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async holdSale(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.body.branchId || req.branchId!;
      const result = await POSService.holdSale(req.organizationId!, branchId, req.user!.userId, req.body);
      return sendSuccess(res, 'Sale held successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getHeldSales(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = (req.query.branchId as string) || req.branchId!;
      const result = await POSService.getHeldSales(req.organizationId!, branchId);
      return sendSuccess(res, 'Held sales fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async deleteHeldSale(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await POSService.deleteHeldSale(req.organizationId!, req.params.holdId as string);
      return sendSuccess(res, 'Held sale resumed/deleted successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
