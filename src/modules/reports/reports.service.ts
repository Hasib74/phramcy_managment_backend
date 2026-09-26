import { pool } from '../../database/connection.js';

export class ReportsService {
  /**
   * Executive Dashboard Summary (Today's and Month's KPIs)
   */
  static async getDashboardOverview(organizationId: string, branchId?: string) {
    let branchFilter = '';
    const params: any[] = [organizationId];

    if (branchId) {
      branchFilter = ' AND branch_id = $2';
      params.push(branchId);
    }

    // 1. Sales Today & Gross Profit
    const todaySalesRes = await pool.query(
      `
      SELECT 
        COALESCE(SUM(s.grand_total), 0) as today_sales,
        COALESCE(SUM(si.gross_profit), 0) as today_gross_profit,
        COUNT(DISTINCT s.id) as today_invoice_count
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      WHERE s.organization_id = $1 ${branchFilter}
        AND s.sale_date::date = CURRENT_DATE
        AND s.status = 'COMPLETED'
      `,
      params
    );

    // 2. Expenses Today
    const todayExpRes = await pool.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) as today_expenses
      FROM expenses
      WHERE organization_id = $1 ${branchFilter}
        AND expense_date = CURRENT_DATE
      `,
      params
    );

    // 3. Customer Total Dues (Receivables)
    const custDueRes = await pool.query(
      `
      SELECT COALESCE(SUM(current_due), 0) as total_customer_due, COUNT(*) as customers_with_due
      FROM customers
      WHERE organization_id = $1 AND current_due > 0
      `,
      [organizationId]
    );

    // 4. Supplier Total Dues (Payables)
    const suppDueRes = await pool.query(
      `
      SELECT COALESCE(SUM(current_balance), 0) as total_supplier_due, COUNT(*) as suppliers_with_due
      FROM suppliers
      WHERE organization_id = $1 AND current_balance > 0
      `,
      [organizationId]
    );

    // 5. Low Stock Count
    const lowStockRes = await pool.query(
      `
      SELECT COUNT(DISTINCT p.id) as low_stock_products_count
      FROM products p
      JOIN stocks s ON p.id = s.product_id
      WHERE p.organization_id = $1 ${branchFilter}
        AND s.quantity_available <= p.min_stock_alert_level
      `,
      params
    );

    // 6. Expiring Batches in 90 Days Count
    const expiringRes = await pool.query(
      `
      SELECT COUNT(DISTINCT b.id) as expiring_batches_count
      FROM product_batches b
      JOIN stocks s ON b.id = s.batch_id
      WHERE b.organization_id = $1 ${branchFilter}
        AND s.quantity_available > 0
        AND (b.expiry_date - CURRENT_DATE) <= 90
      `,
      params
    );

    // 7. Recent 7 Days Sales Trend
    const trendRes = await pool.query(
      `
      SELECT 
        d.date::date as day,
        COALESCE(SUM(s.grand_total), 0) as total_sales,
        COALESCE(SUM(si.gross_profit), 0) as total_profit
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval) d(date)
      LEFT JOIN sales s ON s.sale_date::date = d.date::date AND s.organization_id = $1 ${branchFilter} AND s.status = 'COMPLETED'
      LEFT JOIN sale_items si ON s.id = si.sale_id
      GROUP BY d.date
      ORDER BY d.date ASC
      `,
      params
    );

    // 8. Top Selling Medicines (Last 30 Days)
    const topMedicinesRes = await pool.query(
      `
      SELECT 
        p.brand_name,
        p.generic_name,
        SUM(si.quantity) as total_units_sold,
        SUM(si.total_price) as total_revenue,
        SUM(si.gross_profit) as total_profit
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.organization_id = $1 ${branchFilter}
        AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
        AND s.status = 'COMPLETED'
      GROUP BY p.id, p.brand_name, p.generic_name
      ORDER BY total_units_sold DESC
      LIMIT 10
      `,
      params
    );

    return {
      today: {
        sales: parseFloat(todaySalesRes.rows[0].today_sales),
        grossProfit: parseFloat(todaySalesRes.rows[0].today_gross_profit),
        netProfit: parseFloat(todaySalesRes.rows[0].today_gross_profit) - parseFloat(todayExpRes.rows[0].today_expenses),
        expenses: parseFloat(todayExpRes.rows[0].today_expenses),
        invoiceCount: parseInt(todaySalesRes.rows[0].today_invoice_count, 10)
      },
      receivablesAndPayables: {
        customerDue: parseFloat(custDueRes.rows[0].total_customer_due),
        customerCount: parseInt(custDueRes.rows[0].customers_with_due, 10),
        supplierDue: parseFloat(suppDueRes.rows[0].total_supplier_due),
        supplierCount: parseInt(suppDueRes.rows[0].suppliers_with_due, 10)
      },
      inventoryAlerts: {
        lowStockItems: parseInt(lowStockRes.rows[0].low_stock_products_count, 10),
        expiringBatches90Days: parseInt(expiringRes.rows[0].expiring_batches_count, 10)
      },
      salesTrend7Days: trendRes.rows,
      topSellingMedicines: topMedicinesRes.rows
    };
  }
}
