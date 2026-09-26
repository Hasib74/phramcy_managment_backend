import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class InventoryController {
  static async getStocks(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await InventoryService.getStocks(req.organizationId!, {
        branchId: (req.query.branchId as string) || req.branchId,
        warehouseId: req.query.warehouseId as string,
        search: req.query.search as string,
        lowStockOnly: req.query.lowStockOnly === 'true'
      });
      return sendSuccess(res, 'Stock levels fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getFEFORecommendation(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, quantity } = req.query;
      const branchId = (req.query.branchId as string) || req.branchId;

      if (!productId || !quantity || !branchId) {
        return res.status(400).json({ success: false, message: 'productId, quantity, and branchId are required' });
      }

      const result = await InventoryService.getFEFORecommendation(
        req.organizationId!,
        branchId,
        productId as string,
        parseFloat(quantity as string)
      );

      return sendSuccess(res, 'FEFO batch recommendation calculated', result);
    } catch (error) {
      next(error);
    }
  }

  static async getExpiringBatches(req: Request, res: Response, next: NextFunction) {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 90;
      const branchId = (req.query.branchId as string) || req.branchId;
      const result = await InventoryService.getExpiringBatches(req.organizationId!, branchId, days);
      return sendSuccess(res, 'Expiring batches fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createStockAdjustment(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await InventoryService.createStockAdjustment(
        req.organizationId!,
        req.user!.userId,
        req.body
      );
      return sendSuccess(res, 'Stock adjustment completed successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async createTransfer(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await InventoryService.createTransfer(
        req.organizationId!,
        req.user!.userId,
        req.body
      );
      return sendSuccess(res, 'Stock transfer requested successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateTransferStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      const result = await InventoryService.updateTransferStatus(
        req.organizationId!,
        req.params.id as string,
        req.user!.userId,
        status
      );
      return sendSuccess(res, `Stock transfer ${status.toLowerCase()} successfully`, result);
    } catch (error) {
      next(error);
    }
  }
}
