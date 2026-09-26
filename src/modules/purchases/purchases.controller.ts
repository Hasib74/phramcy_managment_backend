import { Request, Response, NextFunction } from 'express';
import { PurchasesService } from './purchases.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class PurchasesController {
  static async getSuppliers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PurchasesService.getSuppliers(req.organizationId!, req.query.search as string);
      return sendSuccess(res, 'Suppliers fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PurchasesService.createSupplier(req.organizationId!, req.body);
      return sendSuccess(res, 'Supplier created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async createPurchaseInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PurchasesService.createPurchaseInvoice(
        req.organizationId!,
        req.user!.userId,
        req.body
      );
      return sendSuccess(res, 'Purchase invoice received & stock batches ingested successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getSupplierLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PurchasesService.getSupplierLedger(req.organizationId!, req.params.supplierId as string);
      return sendSuccess(res, 'Supplier ledger fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
