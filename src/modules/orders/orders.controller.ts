import { Request, Response, NextFunction } from 'express';
import { OrdersService } from './orders.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class OrdersController {
  static async getWebsiteConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrdersService.getWebsiteConfig(req.organizationId!);
      return sendSuccess(res, 'Website CMS config fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async updateWebsiteConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrdersService.updateWebsiteConfig(req.organizationId!, req.body);
      return sendSuccess(res, 'Website CMS config updated successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrdersService.getOrders(req.organizationId!, req.query.status as string);
      return sendSuccess(res, 'Orders fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async placeOnlineOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrdersService.placeOnlineOrder(req.organizationId!, req.body);
      return sendSuccess(res, 'Online order placed successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateOrderStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, riderId, remarks } = req.body;
      const result = await OrdersService.updateOrderStatus(
        req.organizationId!,
        req.params.id as string,
        req.user!.userId,
        status,
        riderId,
        remarks
      );
      return sendSuccess(res, 'Order status updated successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getRiders(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await OrdersService.getRiders(req.organizationId!);
      return sendSuccess(res, 'Delivery riders fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
