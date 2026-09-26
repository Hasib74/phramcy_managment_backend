import { pool, withTransaction } from '../../database/connection.js';
import { allocateBatchesFEFO } from '../../utils/fefo.util.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class InventoryService {
  /**
   * Get Current Stock Levels across Branches & Warehouses
   */
  static async getStocks(
    organizationId: string,
    filters: {
      branchId?: string;
      warehouseId?: string;
      search?: string;
      lowStockOnly?: boolean;
    }
  ) {
    let queryText = `
      SELECT 
        p.id as product_id,
        p.brand_name,
        p.generic_name,
        p.sku,
        p.barcode,
        p.min_stock_alert_level,
        p.reorder_quantity,
        b.id as branch_id,
        b.name as branch_name,
        w.id as warehouse_id,
        w.name as warehouse_name,
        pb.id as batch_id,
        pb.batch_number,
        pb.expiry_date,
        pb.purchase_price,
        pb.selling_price,
        s.quantity_available,
        s.quantity_reserved,
        s.quantity_damaged,
        s.rack_location
      FROM stocks s
      JOIN products p ON s.product_id = p.id
      JOIN product_batches pb ON s.batch_id = pb.id
      JOIN branches b ON s.branch_id = b.id
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters.branchId) {
      queryText += ` AND s.branch_id = $${paramIndex}`;
      params.push(filters.branchId);
      paramIndex++;
    }

    if (filters.warehouseId) {
      queryText += ` AND s.warehouse_id = $${paramIndex}`;
      params.push(filters.warehouseId);
      paramIndex++;
    }

    if (filters.search) {
      queryText += ` AND (p.brand_name ILIKE $${paramIndex} OR p.generic_name ILIKE $${paramIndex} OR pb.batch_number ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.lowStockOnly) {
      queryText += ` AND s.quantity_available <= p.min_stock_alert_level`;
    }

    queryText += ` ORDER BY p.brand_name ASC, pb.expiry_date ASC`;

    const result = await pool.query(queryText, params);
    return result.rows;
  }

  /**
   * FEFO Recommendation Engine: Recommends which batches to dispense first for a given product & branch
   */
  static async getFEFORecommendation(
    organizationId: string,
    branchId: string,
    productId: string,
    requestedQuantity: number
  ) {
    const batchesRes = await pool.query(
      `
      SELECT 
        pb.id as "batchId",
        pb.batch_number as "batchNumber",
        pb.expiry_date as "expiryDate",
        pb.purchase_price as "purchasePrice",
        pb.purchase_price as "unitCost",
        pb.selling_price as "sellingPrice",
        pb.mrp,
        (s.quantity_available - s.quantity_reserved) as "quantityAvailable"
      FROM stocks s
      JOIN product_batches pb ON s.batch_id = pb.id
      WHERE s.organization_id = $1 
        AND s.branch_id = $2 
        AND s.product_id = $3
        AND (s.quantity_available - s.quantity_reserved) > 0
        AND pb.expiry_date >= CURRENT_DATE
        AND pb.is_active = true
      ORDER BY pb.expiry_date ASC
      `,
      [organizationId, branchId, productId]
    );

    const availableBatches = batchesRes.rows.map((row: any) => ({
      ...row,
      quantityAvailable: parseFloat(row.quantityAvailable),
      purchasePrice: parseFloat(row.purchasePrice),
      unitCost: parseFloat(row.unitCost),
      sellingPrice: parseFloat(row.sellingPrice),
      mrp: parseFloat(row.mrp)
    }));

    const allocation = allocateBatchesFEFO(availableBatches, requestedQuantity);
    return allocation;
  }

  /**
   * Expiring Batches Risk Report (Batches expiring within 90 days or expired)
   */
  static async getExpiringBatches(organizationId: string, branchId?: string, daysThreshold = 90) {
    let queryText = `
      SELECT 
        b.organization_id,
        s.branch_id,
        br.name as branch_name,
        p.id as product_id,
        p.brand_name,
        p.generic_name,
        b.id as batch_id,
        b.batch_number,
        b.expiry_date,
        (b.expiry_date - CURRENT_DATE) as days_remaining,
        s.quantity_available,
        (s.quantity_available * b.purchase_price) as capital_at_risk,
        CASE 
          WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED'
          WHEN (b.expiry_date - CURRENT_DATE) <= 30 THEN 'CRITICAL_30_DAYS'
          WHEN (b.expiry_date - CURRENT_DATE) <= 60 THEN 'WARNING_60_DAYS'
          ELSE 'NOTICE_90_DAYS'
        END as risk_level
      FROM product_batches b
      JOIN products p ON b.product_id = p.id
      JOIN stocks s ON b.id = s.batch_id
      JOIN branches br ON s.branch_id = br.id
      WHERE b.organization_id = $1
        AND s.quantity_available > 0
        AND (b.expiry_date - CURRENT_DATE) <= $2
    `;
    const params: any[] = [organizationId, daysThreshold];

    if (branchId) {
      queryText += ` AND s.branch_id = $3`;
      params.push(branchId);
    }

    queryText += ` ORDER BY b.expiry_date ASC`;

    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Stock Adjustment (Loss/Damage/Theft/Count Correction)
   */
  static async createStockAdjustment(organizationId: string, userId: string, data: any) {
    return withTransaction(async (client) => {
      const adjNo = `ADJ-${Date.now()}`;

      // 1. Create adjustment header
      const adjRes = await client.query(
        `
        INSERT INTO stock_adjustments (
          organization_id, branch_id, warehouse_id, adjustment_number, reason, notes, adjusted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [organizationId, data.branchId, data.warehouseId, adjNo, data.reason, data.notes, userId]
      );
      const adjustment = adjRes.rows[0];

      // 2. Process items
      for (const item of data.items) {
        // Fetch current stock
        const stockRes = await client.query(
          `
          SELECT quantity_available, quantity_damaged, quantity_expired
          FROM stocks
          WHERE branch_id = $1 AND warehouse_id = $2 AND product_id = $3 AND batch_id = $4
          FOR UPDATE
          `,
          [data.branchId, data.warehouseId, item.productId, item.batchId]
        );

        if (stockRes.rows.length === 0) {
          throw new AppError(`Stock record not found for product batch`, 404);
        }

        const currentQty = parseFloat(stockRes.rows[0].quantity_available);
        const newQty = parseFloat(item.newQuantity);
        const diffQty = newQty - currentQty;

        // Fetch batch unit cost
        const batchRes = await client.query('SELECT purchase_price FROM product_batches WHERE id = $1', [item.batchId]);
        const unitCost = parseFloat(batchRes.rows[0]?.purchase_price || '0');
        const costImpact = diffQty * unitCost;

        // Insert adjustment item
        await client.query(
          `
          INSERT INTO stock_adjustment_items (
            adjustment_id, product_id, batch_id, previous_quantity, new_quantity, difference_quantity, unit_cost, total_cost_impact, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [adjustment.id, item.productId, item.batchId, currentQty, newQty, diffQty, unitCost, costImpact, item.notes]
        );

        // Update stock
        await client.query(
          `
          UPDATE stocks
          SET quantity_available = $1, updated_at = CURRENT_TIMESTAMP
          WHERE branch_id = $2 AND warehouse_id = $3 AND product_id = $4 AND batch_id = $5
          `,
          [newQty, data.branchId, data.warehouseId, item.productId, item.batchId]
        );

        // Insert movement ledger entry
        const movType = diffQty >= 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
        await client.query(
          `
          INSERT INTO stock_movements (
            organization_id, branch_id, warehouse_id, product_id, batch_id,
            movement_type, reference_type, reference_id, quantity, unit_cost, total_cost, balance_after, notes, performed_by
          ) VALUES ($1, $2, $3, $4, $5, $6, 'ADJUSTMENT', $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            organizationId,
            data.branchId,
            data.warehouseId,
            item.productId,
            item.batchId,
            movType,
            adjustment.id,
            diffQty,
            unitCost,
            costImpact,
            newQty,
            item.notes || data.reason,
            userId
          ]
        );
      }

      return adjustment;
    });
  }

  /**
   * Stock Transfer between Branches / Warehouses
   */
  static async createTransfer(organizationId: string, userId: string, data: any) {
    return withTransaction(async (client) => {
      const transferNo = `TRF-${Date.now()}`;

      const trfRes = await client.query(
        `
        INSERT INTO stock_transfers (
          organization_id, transfer_number, from_branch_id, to_branch_id,
          from_warehouse_id, to_warehouse_id, status, requested_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 'REQUESTED', $7, $8)
        RETURNING *
        `,
        [
          organizationId,
          transferNo,
          data.fromBranchId,
          data.toBranchId,
          data.fromWarehouseId,
          data.toWarehouseId,
          userId,
          data.notes
        ]
      );
      const transfer = trfRes.rows[0];

      for (const item of data.items) {
        await client.query(
          `
          INSERT INTO stock_transfer_items (
            transfer_id, product_id, batch_id, quantity_requested, notes
          ) VALUES ($1, $2, $3, $4, $5)
          `,
          [transfer.id, item.productId, item.batchId, item.quantityRequested, item.notes]
        );
      }

      return transfer;
    });
  }

  /**
   * Complete Dispatch / Receive Transfer Workflow
   */
  static async updateTransferStatus(
    organizationId: string,
    transferId: string,
    userId: string,
    status: 'APPROVED' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED'
  ) {
    return withTransaction(async (client) => {
      const trfRes = await client.query(
        'SELECT * FROM stock_transfers WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [transferId, organizationId]
      );
      if (trfRes.rows.length === 0) {
        throw new AppError('Stock transfer not found', 404);
      }
      const transfer = trfRes.rows[0];

      if (status === 'DISPATCHED') {
        // Deduct from sender branch/warehouse stock and reserve or mark OUT
        const items = await client.query('SELECT * FROM stock_transfer_items WHERE transfer_id = $1', [transferId]);
        for (const it of items.rows) {
          const qty = parseFloat(it.quantity_requested);

          await client.query(
            `
            UPDATE stocks
            SET quantity_available = quantity_available - $1, updated_at = CURRENT_TIMESTAMP
            WHERE branch_id = $2 AND warehouse_id = $3 AND product_id = $4 AND batch_id = $5
            `,
            [qty, transfer.from_branch_id, transfer.from_warehouse_id, it.product_id, it.batch_id]
          );

          // Fetch cost
          const batchRes = await client.query('SELECT purchase_price FROM product_batches WHERE id = $1', [it.batch_id]);
          const cost = parseFloat(batchRes.rows[0]?.purchase_price || '0');

          // Log OUT transfer movement
          await client.query(
            `
            INSERT INTO stock_movements (
              organization_id, branch_id, warehouse_id, product_id, batch_id,
              movement_type, reference_type, reference_id, quantity, unit_cost, total_cost, balance_after, performed_by
            ) VALUES ($1, $2, $3, $4, $5, 'TRANSFER_OUT', 'TRANSFER', $6, $7, $8, $9, 0, $10)
            `,
            [
              organizationId,
              transfer.from_branch_id,
              transfer.from_warehouse_id,
              it.product_id,
              it.batch_id,
              transferId,
              -qty,
              cost,
              -qty * cost,
              userId
            ]
          );

          await client.query('UPDATE stock_transfer_items SET quantity_dispatched = $1 WHERE id = $2', [qty, it.id]);
        }

        await client.query(
          'UPDATE stock_transfers SET status = $1, dispatched_by = $2, dispatched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [status, userId, transferId]
        );
      } else if (status === 'RECEIVED') {
        // Add into receiver branch/warehouse stock
        const items = await client.query('SELECT * FROM stock_transfer_items WHERE transfer_id = $1', [transferId]);
        for (const it of items.rows) {
          const qty = parseFloat(it.quantity_dispatched || it.quantity_requested);

          await client.query(
            `
            INSERT INTO stocks (
              organization_id, branch_id, warehouse_id, product_id, batch_id, quantity_available
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (branch_id, warehouse_id, product_id, batch_id)
            DO UPDATE SET quantity_available = stocks.quantity_available + EXCLUDED.quantity_available, updated_at = CURRENT_TIMESTAMP
            `,
            [organizationId, transfer.to_branch_id, transfer.to_warehouse_id, it.product_id, it.batch_id, qty]
          );

          const batchRes = await client.query('SELECT purchase_price FROM product_batches WHERE id = $1', [it.batch_id]);
          const cost = parseFloat(batchRes.rows[0]?.purchase_price || '0');

          await client.query(
            `
            INSERT INTO stock_movements (
              organization_id, branch_id, warehouse_id, product_id, batch_id,
              movement_type, reference_type, reference_id, quantity, unit_cost, total_cost, balance_after, performed_by
            ) VALUES ($1, $2, $3, $4, $5, 'TRANSFER_IN', 'TRANSFER', $6, $7, $8, $9, 0, $10)
            `,
            [
              organizationId,
              transfer.to_branch_id,
              transfer.to_warehouse_id,
              it.product_id,
              it.batch_id,
              transferId,
              qty,
              cost,
              qty * cost,
              userId
            ]
          );

          await client.query('UPDATE stock_transfer_items SET quantity_received = $1 WHERE id = $2', [qty, it.id]);
        }

        await client.query(
          'UPDATE stock_transfers SET status = $1, received_by = $2, received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [status, userId, transferId]
        );
      }

      return { transferId, status };
    });
  }
}
