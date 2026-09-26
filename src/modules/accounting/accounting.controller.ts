import { Request, Response, NextFunction } from 'express';
import { AccountingService } from './accounting.service.js';
import { sendSuccess } from '../../utils/response.util.js';

export class AccountingController {
  static async getChartOfAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AccountingService.getChartOfAccounts(req.organizationId!);
      return sendSuccess(res, 'Chart of accounts fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createJournalEntry(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AccountingService.createJournalEntry(req.organizationId!, req.user!.userId, req.body);
      return sendSuccess(res, 'Journal entry recorded successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = (req.query.branchId as string) || req.branchId;
      const result = await AccountingService.getExpenses(
        req.organizationId!,
        branchId,
        req.query.startDate as string,
        req.query.endDate as string
      );
      return sendSuccess(res, 'Expenses fetched successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async createExpense(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = req.body.branchId || req.branchId!;
      const result = await AccountingService.createExpense(req.organizationId!, req.user!.userId, {
        ...req.body,
        branchId
      });
      return sendSuccess(res, 'Expense voucher recorded successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getDailyClosing(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = (req.query.branchId as string) || req.branchId!;
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const result = await AccountingService.getDailyClosing(req.organizationId!, branchId, date);
      return sendSuccess(res, 'Daily closing report generated', result);
    } catch (error) {
      next(error);
    }
  }
}
