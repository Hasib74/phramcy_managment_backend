import { pool, withTransaction } from '../../database/connection.js';
import { allocateBatchesFEFO } from '../../utils/fefo.util.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class POSService {
  /**
   * Fast Counter Search: Search medicines by barcode, SKU, brand name, or generic name with FEFO batches
   */
  static async searchProducts(organizationId: string, branchId: string, query: string) {
    const res = await pool.query(
      `
      SELECT 
        p.id as product_id,
        p.brand_name,
        p.generic_name,
        p.strength,
        p.barcode as product_barcode,
        p.sku,
        p.requires_prescription,
        p.mrp,
        p.selling_price,
        p.vat_percent,
        df.name as dosage_form,
        u.short_code as unit,
        COALESCE(SUM(s.quantity_available - s.quantity_reserved), 0) as total_sellable_stock,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'batchId', pb.id,
            'batchNumber', pb.batch_number,
            'expiryDate', pb.expiry_date,
            'daysUntilExpiry', (pb.expiry_date - CURRENT_DATE),
            'quantityAvailable', s.quantity_available,
            'sellingPrice', pb.selling_price,
            'mrp', pb.mrp,
            'rackLocation', s.rack_location
          ) ORDER BY pb.expiry_date ASC
        ) FILTER (WHERE pb.id IS NOT NULL AND s.quantity_available > 0 AND pb.expiry_date >= CURRENT_DATE) as active_batches
      FROM products p
      LEFT JOIN dosage_forms df ON p.dosage_form_id = df.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      LEFT JOIN stocks s ON p.id = s.product_id AND s.branch_id = $2
      LEFT JOIN product_batches pb ON s.batch_id = pb.id AND pb.is_active = true
      WHERE p.organization_id = $1 
        AND p.is_active = true
        AND (
          p.barcode = $3
          OR pb.barcode = $3
          OR p.brand_name ILIKE $4
          OR p.generic_name ILIKE $4
          OR p.sku = $3
        )
      GROUP BY p.id, df.name, u.short_code
      LIMIT 25
      `,
      [organizationId, branchId, query, `%${query}%`]
    );

    return res.rows;
  }

  /**
   * Open Cash Register Session
   */
  static async openSession(organizationId: string, branchId: string, userId: string, openingCash: number) {
    // Check if user has an active session
    const existing = await pool.query(
      `SELECT id FROM pos_sessions WHERE organization_id = $1 AND cashier_user_id = $2 AND status = 'OPEN'`,
      [organizationId, userId]
    );
    if (existing.rows.length > 0) {
      throw new AppError('You already have an active open POS session. Please close it first.', 400);
    }

    const res = await pool.query(
      `
      INSERT INTO pos_sessions (
        organization_id, branch_id, cashier_user_id, opening_cash_balance, status
      ) VALUES ($1, $2, $3, $4, 'OPEN')
      RETURNING *
      `,
      [organizationId, branchId, userId, openingCash]
    );

    return res.rows[0];
  }

  /**
   * Close Cash Register Session
   */
  static async closeSession(organizationId: string, sessionId: string, closingCashCounted: number, notes?: string) {
    return withTransaction(async (client) => {
      const sessRes = await client.query(
        'SELECT * FROM pos_sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [sessionId, organizationId]
      );
      if (sessRes.rows.length === 0) {
        throw new AppError('POS session not found', 404);
      }
      const session = sessRes.rows[0];
      if (session.status === 'CLOSED') {
        throw new AppError('POS session is already closed', 400);
      }

      // Aggregate all sales completed in this session
      const salesRes = await client.query(
        `
        SELECT 
          COALESCE(SUM(s.grand_total), 0) as total_sales,
          COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method = 'CASH'), 0) as cash_collected,
          COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method = 'CARD'), 0) as card_collected,
          COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method LIKE 'MFS%'), 0) as mfs_collected,
          COALESCE(SUM(s.due_amount), 0) as credit_sales
        FROM sales s
        LEFT JOIN sale_payments sp ON s.id = sp.sale_id
        WHERE s.pos_session_id = $1 AND s.status = 'COMPLETED'
        `,
        [sessionId]
      );
      const stats = salesRes.rows[0];

      const openingCash = parseFloat(session.opening_cash_balance);
      const cashCollected = parseFloat(stats.cash_collected);
      const expectedCash = openingCash + cashCollected;
      const discrepancy = closingCashCounted - expectedCash;

      const updated = await client.query(
        `
        UPDATE pos_sessions
        SET 
          closed_at = CURRENT_TIMESTAMP,
          total_cash_sales = $1,
          total_card_sales = $2,
          total_mfs_sales = $3,
          total_credit_sales = $4,
          total_sales_amount = $5,
          closing_cash_counted = $6,
          expected_cash_balance = $7,
          cash_discrepancy = $8,
          status = 'CLOSED',
          notes = $9
        WHERE id = $10
        RETURNING *
        `,
        [
          cashCollected,
          stats.card_collected,
          stats.mfs_collected,
          stats.credit_sales,
          stats.total_sales,
          closingCashCounted,
          expectedCash,
          discrepancy,
          notes || null,
          sessionId
        ]
      );

      return updated.rows[0];
    });
  }

  /**
   * Complete POS Sale Checkout (Auto FEFO or Explicit Batch deduction, Split payments, Stock Movements, Customer Ledger)
   */
  static async checkoutSale(organizationId: string, branchId: string, userId: string, data: any) {
    return withTransaction(async (client) => {
      // 1. Generate Invoice Number
      const branchRes = await client.query('SELECT pos_invoice_prefix FROM branches WHERE id = $1', [branchId]);
      const prefix = branchRes.rows[0]?.pos_invoice_prefix || 'INV';
      const invoiceNumber = `${prefix}-${Date.now().toString().slice(-8)}`;

      const subtotal = parseFloat(data.subtotal);
      const discountAmount = parseFloat(data.discountAmount || '0');
      const vatAmount = parseFloat(data.vatAmount || '0');
      const roundOff = parseFloat(data.roundOff || '0');
      const grandTotal = parseFloat(data.grandTotal || (subtotal - discountAmount + vatAmount + roundOff).toString());
      const paidAmount = parseFloat(data.paidAmount || '0');
      const dueAmount = grandTotal - paidAmount;
      const changeReturned = parseFloat(data.changeReturned || '0');
      const paymentStatus = dueAmount <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

      // 2. Insert Sale Header
      const saleRes = await client.query(
        `
        INSERT INTO sales (
          organization_id, branch_id, pos_session_id, customer_id, prescription_id,
          invoice_number, sale_type, subtotal, discount_type, discount_value,
          discount_amount, vat_amount, round_off, grand_total, paid_amount,
          due_amount, change_returned, payment_status, status, cashier_user_id, notes
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, 'COMPLETED', $19, $20
        )
        RETURNING *
        `,
        [
          organizationId,
          branchId,
          data.posSessionId || null,
          data.customerId || null,
          data.prescriptionId || null,
          invoiceNumber,
          data.saleType || 'POS_RETAIL',
          subtotal,
          data.discountType || 'FIXED_AMOUNT',
          data.discountValue || discountAmount,
          discountAmount,
          vatAmount,
          roundOff,
          grandTotal,
          paidAmount,
          dueAmount,
          changeReturned,
          paymentStatus,
          userId,
          data.notes || null
        ]
      );
      const sale = saleRes.rows[0];

      // 3. Process Cart Items & Stock Deductions
      const processedItems = [];
      for (const item of data.items) {
        const reqQty = parseFloat(item.quantity);

        // If batch is explicitly specified:
        if (item.batchId) {
          const batchRes = await client.query(
            `
            SELECT pb.*, s.quantity_available, s.warehouse_id
            FROM product_batches pb
            JOIN stocks s ON pb.id = s.batch_id
            WHERE pb.id = $1 AND s.branch_id = $2
            FOR UPDATE
            `,
            [item.batchId, branchId]
          );

          if (batchRes.rows.length === 0) {
            throw new AppError(`Batch ${item.batchId} not found in this branch`, 404);
          }

          const batch = batchRes.rows[0];
          const avail = parseFloat(batch.quantity_available);
          if (avail < reqQty) {
            throw new AppError(`Insufficient stock for batch ${batch.batch_number}. Available: ${avail}, Requested: ${reqQty}`, 400);
          }

          const unitPrice = parseFloat(item.unitPrice || batch.selling_price);
          const unitCost = parseFloat(batch.purchase_price);
          const itemTotalPrice = unitPrice * reqQty - parseFloat(item.discountAmount || '0');
          const grossProfit = itemTotalPrice - (unitCost * reqQty);

          // Deduct stock
          await client.query(
            `
            UPDATE stocks
            SET quantity_available = quantity_available - $1, updated_at = CURRENT_TIMESTAMP
            WHERE branch_id = $2 AND batch_id = $3
            `,
            [reqQty, branchId, batch.id]
          );

          // Insert Sale Item
          const siRes = await client.query(
            `
            INSERT INTO sale_items (
              sale_id, organization_id, branch_id, product_id, batch_id, unit_id,
              quantity, unit_price, unit_cost, discount_amount, vat_amount, total_price, gross_profit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
            `,
            [
              sale.id,
              organizationId,
              branchId,
              item.productId,
              batch.id,
              item.unitId || null,
              reqQty,
              unitPrice,
              unitCost,
              item.discountAmount || 0.0,
              item.vatAmount || 0.0,
              itemTotalPrice,
              grossProfit
            ]
          );
          processedItems.push(siRes.rows[0]);

          // Record stock movement
          await client.query(
            `
            INSERT INTO stock_movements (
              organization_id, branch_id, warehouse_id, product_id, batch_id,
              movement_type, reference_type, reference_id, quantity, unit_cost, total_cost, balance_after, performed_by
            ) VALUES ($1, $2, $3, $4, $5, 'SALE_OUT', 'SALE', $6, $7, $8, $9, $10, $11)
            `,
            [
              organizationId,
              branchId,
              batch.warehouse_id,
              item.productId,
              batch.id,
              sale.id,
              -reqQty,
              unitCost,
              -reqQty * unitCost,
              avail - reqQty,
              userId
            ]
          );
        } else {
          // Automatic FEFO Allocation
          const batchesRes = await client.query(
            `
            SELECT pb.id as "batchId", pb.batch_number as "batchNumber", pb.expiry_date as "expiryDate",
                   pb.purchase_price as "purchasePrice", pb.purchase_price as "unitCost",
                   pb.selling_price as "sellingPrice", pb.mrp, s.quantity_available as "quantityAvailable",
                   s.warehouse_id as "warehouseId"
            FROM stocks s
            JOIN product_batches pb ON s.batch_id = pb.id
            WHERE s.organization_id = $1 AND s.branch_id = $2 AND s.product_id = $3
              AND s.quantity_available > 0 AND pb.expiry_date >= CURRENT_DATE AND pb.is_active = true
            ORDER BY pb.expiry_date ASC
            FOR UPDATE
            `,
            [organizationId, branchId, item.productId]
          );

          const available = batchesRes.rows.map((r: any) => ({
            ...r,
            quantityAvailable: parseFloat(r.quantityAvailable),
            purchasePrice: parseFloat(r.purchasePrice),
            unitCost: parseFloat(r.unitCost),
            sellingPrice: parseFloat(r.sellingPrice),
            mrp: parseFloat(r.mrp)
          }));

          const fefoAlloc = allocateBatchesFEFO(available, reqQty);
          if (!fefoAlloc.fulfilled) {
            throw new AppError(`Not enough active non-expired stock for product ID ${item.productId}. Required: ${reqQty}, Available: ${fefoAlloc.allocatedQuantity}`, 400);
          }

          for (const alloc of fefoAlloc.allocations) {
            const batchInfo = batchesRes.rows.find((b: any) => b.batchId === alloc.batchId);
            const warehouseId = batchInfo?.warehouseId;
            const grossProfit = alloc.totalPrice - alloc.totalCost;

            await client.query(
              `
              UPDATE stocks
              SET quantity_available = quantity_available - $1, updated_at = CURRENT_TIMESTAMP
              WHERE branch_id = $2 AND batch_id = $3
              `,
              [alloc.allocatedQuantity, branchId, alloc.batchId]
            );

            const siRes = await client.query(
              `
              INSERT INTO sale_items (
                sale_id, organization_id, branch_id, product_id, batch_id,
                quantity, unit_price, unit_cost, total_price, gross_profit
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              RETURNING *
              `,
              [
                sale.id,
                organizationId,
                branchId,
                item.productId,
                alloc.batchId,
                alloc.allocatedQuantity,
                alloc.unitPrice,
                alloc.unitCost,
                alloc.totalPrice,
                grossProfit
              ]
            );
            processedItems.push(siRes.rows[0]);

            await client.query(
              `
              INSERT INTO stock_movements (
                organization_id, branch_id, warehouse_id, product_id, batch_id,
                movement_type, reference_type, reference_id, quantity, unit_cost, total_cost, balance_after, performed_by
              ) VALUES ($1, $2, $3, $4, $5, 'SALE_OUT', 'SALE', $6, $7, $8, $9, 0, $10)
              `,
              [
                organizationId,
                branchId,
                warehouseId,
                item.productId,
                alloc.batchId,
                sale.id,
                -alloc.allocatedQuantity,
                alloc.unitCost,
                -alloc.totalCost,
                userId
              ]
            );
          }
        }
      }

      // 4. Record Split Payments
      if (data.payments && data.payments.length > 0) {
        for (const p of data.payments) {
          await client.query(
            `
            INSERT INTO sale_payments (
              sale_id, organization_id, payment_method, amount,
              transaction_reference, card_last_four, received_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              sale.id,
              organizationId,
              p.paymentMethod,
              p.amount,
              p.transactionReference || null,
              p.cardLastFour || null,
              userId
            ]
          );
        }
      }

      // 5. Update Customer CRM Due & Loyalty
      if (data.customerId) {
        const custRes = await client.query('SELECT current_due, loyalty_points FROM customers WHERE id = $1 FOR UPDATE', [data.customerId]);
        if (custRes.rows.length > 0) {
          const currentDue = parseFloat(custRes.rows[0].current_due || '0');
          const newDue = currentDue + dueAmount;

          // Points earned: 1 point per 100 currency units
          const pointsEarned = Math.floor(grandTotal / 100);

          await client.query(
            `
            UPDATE customers
            SET current_due = $1, loyalty_points = loyalty_points + $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            `,
            [newDue, pointsEarned, data.customerId]
          );

          if (dueAmount > 0) {
            await client.query(
              `
              INSERT INTO customer_ledgers (
                organization_id, customer_id, entry_type, reference_type, reference_id,
                reference_number, debit_amount, running_balance, description
              ) VALUES ($1, $2, 'SALE_INVOICE', 'SALE', $3, $4, $5, $6, $7)
              `,
              [
                organizationId,
                data.customerId,
                sale.id,
                invoiceNumber,
                dueAmount,
                newDue,
                `Credit sale on invoice ${invoiceNumber}`
              ]
            );
          }
        }
      }

      return {
        ...sale,
        items: processedItems
      };
    });
  }

  /**
   * Hold Cart
   */
  static async holdSale(organizationId: string, branchId: string, userId: string, data: any) {
    const holdRef = `HOLD-${Date.now().toString().slice(-6)}`;
    const res = await pool.query(
      `
      INSERT INTO held_sales (
        organization_id, branch_id, cashier_user_id, hold_reference, customer_id, cart_items
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [organizationId, branchId, userId, holdRef, data.customerId || null, JSON.stringify(data.cartItems)]
    );
    return res.rows[0];
  }

  /**
   * Get Held Carts
   */
  static async getHeldSales(organizationId: string, branchId: string) {
    const res = await pool.query(
      `
      SELECT hs.*, c.name as customer_name, c.phone as customer_phone
      FROM held_sales hs
      LEFT JOIN customers c ON hs.customer_id = c.id
      WHERE hs.organization_id = $1 AND hs.branch_id = $2
      ORDER BY hs.held_at DESC
      `,
      [organizationId, branchId]
    );
    return res.rows;
  }

  /**
   * Resume / Delete Held Cart
   */
  static async deleteHeldSale(organizationId: string, holdId: string) {
    await pool.query('DELETE FROM held_sales WHERE id = $1 AND organization_id = $2', [holdId, organizationId]);
    return { success: true };
  }
}
