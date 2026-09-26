import { Request, Response, NextFunction } from 'express';
import { ProductsService } from './products.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class ProductsController {
  static async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.getProducts(req.organizationId!, {
        search: req.query.search as string,
        categoryId: req.query.categoryId as string,
        genericId: req.query.genericId as string,
        manufacturerId: req.query.manufacturerId as string,
        requiresPrescription: req.query.requiresPrescription ? req.query.requiresPrescription === 'true' : undefined,
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
      });
      return sendSuccess(res, 'Products fetched successfully', result.products, 200, result.meta);
    } catch (error) {
      next(error);
    }
  }

  static async getProductById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.getProductById(req.organizationId!, req.params.id as string, req.branchId);
      return sendSuccess(res, 'Product details fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.createProduct(req.organizationId!, req.body);
      return sendSuccess(res, 'Product created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.updateProduct(req.organizationId!, req.params.id as string, req.body);
      return sendSuccess(res, 'Product updated successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getGenerics(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.getGenerics(req.organizationId!);
      return sendSuccess(res, 'Generics fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.getCategories(req.organizationId!);
      return sendSuccess(res, 'Categories fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getManufacturers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.getManufacturers(req.organizationId!);
      return sendSuccess(res, 'Manufacturers fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async getMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.getMetadata(req.organizationId!);
      return sendSuccess(res, 'Dosage forms and units metadata fetched', result);
    } catch (error) {
      next(error);
    }
  }
}
