import { pool, withTransaction } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class AccountingService {
  /**
   * Get Chart of Accounts
   */
  static async getChartOfAccounts(organizationId: string) {
    const res = await pool.query(
      `
      SELECT * FROM chart_of_accounts
      WHERE organization_id = $1 AND is_active = true
      ORDER BY account_code ASC
      `,
      [organizationId]
    );
    return res.rows;
  }

  /**
   * Create Journal Entry (Double-Entry Bookkeeping)
   */
  static async createJournalEntry(organizationId: string, userId: string, data: any) {
    return withTransaction(async (client) => {
      const entryNo = `JRN-${Date.now()}`;
      const totalDebit = parseFloat(data.totalDebit);
      const totalCredit = parseFloat(data.totalCredit);

      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new AppError(`Unbalanced journal entry! Total Debit (${totalDebit}) must equal Total Credit (${totalCredit})`, 400);
      }

      const jrnRes = await client.query(
        `
        INSERT INTO journal_entries (
          organization_id, branch_id, entry_number, entry_date,
          reference_type, reference_id, reference_number, narration, total_debit, total_credit, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
        [
          organizationId,
          data.branchId || null,
          entryNo,
          data.entryDate || new Date(),
          data.referenceType || 'MANUAL',
          data.referenceId || null,
          data.referenceNumber || null,
          data.narration,
          totalDebit,
          totalCredit,
          userId
        ]
      );
      const journal = jrnRes.rows[0];

      for (const line of data.lines) {
        await client.query(
          `
          INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, memo
          ) VALUES ($1, $2, $3, $4, $5)
          `,
          [
            journal.id,
            line.accountId,
            parseFloat(line.debitAmount || '0'),
            parseFloat(line.creditAmount || '0'),
            line.memo || null
          ]
        );

        // Update account balance
        const netDiff = parseFloat(line.debitAmount || '0') - parseFloat(line.creditAmount || '0');
        await client.query(
          'UPDATE chart_of_accounts SET current_balance = current_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [netDiff, line.accountId]
        );
      }

      return journal;
    });
  }

  /**
   * List Expenses
   */
  static async getExpenses(organizationId: string, branchId?: string, startDate?: string, endDate?: string) {
    let queryText = `
      SELECT e.*, ec.name as category_name, b.name as branch_name, u.first_name as created_by_name
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      JOIN branches b ON e.branch_id = b.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (branchId) {
      queryText += ` AND e.branch_id = $${paramIndex}`;
      params.push(branchId);
      paramIndex++;
    }

    if (startDate) {
      queryText += ` AND e.expense_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      queryText += ` AND e.expense_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    queryText += ' ORDER BY e.expense_date DESC, e.created_at DESC';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Record Expense Voucher
   */
  static async createExpense(organizationId: string, userId: string, data: any) {
    const voucherNo = `EXP-${Date.now()}`;
    const amount = parseFloat(data.amount);
    const vat = parseFloat(data.vatAmount || '0');
    const total = amount + vat;

    const res = await pool.query(
      `
      INSERT INTO expenses (
        organization_id, branch_id, category_id, account_id, voucher_number,
        expense_date, title, amount, vat_amount, total_amount, payment_method, payee_name, receipt_attachment_url, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
      `,
      [
        organizationId,
        data.branchId,
        data.categoryId,
        data.accountId || null,
        voucherNo,
        data.expenseDate || new Date(),
        data.title,
        amount,
        vat,
        total,
        data.paymentMethod || 'CASH',
        data.payeeName || null,
        data.receiptAttachmentUrl || null,
        data.notes || null,
        userId
      ]
    );

    return res.rows[0];
  }

  /**
   * Daily Closing Summary
   */
  static async getDailyClosing(organizationId: string, branchId: string, date: string) {
    const res = await pool.query(
      `
      SELECT 
        $3::date as closing_date,
        COALESCE(SUM(s.grand_total), 0) as total_sales,
        COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method = 'CASH'), 0) as cash_sales,
        COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method = 'CARD'), 0) as card_sales,
        COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method LIKE 'MFS%'), 0) as mfs_sales,
        COALESCE(SUM(s.due_amount), 0) as credit_sales,
        (SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE organization_id = $1 AND branch_id = $2 AND payment_date = $3::date) as due_collected,
        (SELECT COALESCE(SUM(total_amount), 0) FROM expenses WHERE organization_id = $1 AND branch_id = $2 AND expense_date = $3::date) as total_expenses,
        (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE organization_id = $1 AND branch_id = $2 AND payment_date = $3::date) as total_supplier_payments
      FROM sales s
      LEFT JOIN sale_payments sp ON s.id = sp.sale_id
      WHERE s.organization_id = $1 AND s.branch_id = $2 AND s.sale_date::date = $3::date AND s.status = 'COMPLETED'
      `,
      [organizationId, branchId, date]
    );

    return res.rows[0];
  }
}
