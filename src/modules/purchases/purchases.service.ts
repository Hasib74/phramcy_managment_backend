import { pool, withTransaction } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class PurchasesService {
  /**
   * List Suppliers
   */
  static async getSuppliers(organizationId: string, search?: string) {
    let queryText = 'SELECT * FROM suppliers WHERE organization_id = $1';
    const params: any[] = [organizationId];

    if (search) {
      queryText += ' AND (name ILIKE $2 OR company_name ILIKE $2 OR phone ILIKE $2)';
      params.push(`%${search}%`);
    }

    queryText += ' ORDER BY company_name ASC';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Create Supplier
   */
  static async createSupplier(organizationId: string, data: any) {
    const res = await pool.query(
      `
      INSERT INTO suppliers (
        organization_id, name, company_name, contact_person, phone, email,
        address_street, address_city, payment_terms_days, credit_limit, opening_balance, current_balance, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)
      RETURNING *
      `,
      [
        organizationId,
        data.name,
        data.companyName,
        data.contactPerson || null,
        data.phone,
        data.email || null,
        data.addressStreet || null,
        data.addressCity || null,
        data.paymentTermsDays || 30,
        data.creditLimit || 0.0,
        data.openingBalance || 0.0,
        data.notes || null
      ]
    );

    const supplier = res.rows[0];

    // If opening balance > 0, log in supplier ledger
    if (parseFloat(data.openingBalance) > 0) {
      await pool.query(
        `
        INSERT INTO supplier_ledgers (
          organization_id, supplier_id, entry_type, credit_amount, running_balance, description
        ) VALUES ($1, $2, 'OPENING_BALANCE', $3, $3, 'Opening balance payable')
        `,
        [organizationId, supplier.id, data.openingBalance]
      );
    }

    return supplier;
  }

  /**
   * Create Purchase Invoice (Receives Goods, Ingests Batches, Updates Stocks & Movements, Updates Supplier Balance & Ledger)
   */
  static async createPurchaseInvoice(organizationId: string, userId: string, data: any) {
    return withTransaction(async (client) => {
      // 1. Create Purchase Header
      const grandTotal = parseFloat(data.grandTotal);
      const paidAmount = parseFloat(data.paidAmount || '0');
      const dueAmount = grandTotal - paidAmount;
      const paymentStatus = paidAmount >= grandTotal ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

      const purchRes = await client.query(
        `
        INSERT INTO purchases (
          organization_id, branch_id, warehouse_id, supplier_id, purchase_order_id,
          invoice_number, purchase_date, subtotal, discount_amount, vat_amount,
          shipping_cost, other_charges, grand_total, paid_amount, due_amount,
          payment_status, invoice_document_url, notes, received_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19
        )
        RETURNING *
        `,
        [
          organizationId,
          data.branchId,
          data.warehouseId,
          data.supplierId,
          data.purchaseOrderId || null,
          data.invoiceNumber,
          data.purchaseDate || new Date(),
          data.subtotal,
          data.discountAmount || 0.0,
          data.vatAmount || 0.0,
          data.shippingCost || 0.0,
          data.otherCharges || 0.0,
          grandTotal,
          paidAmount,
          dueAmount,
          paymentStatus,
          data.invoiceDocumentUrl || null,
          data.notes || null,
          userId
        ]
      );
      const purchase = purchRes.rows[0];

      // 2. Process Line Items (Batches & Stocks)
      for (const item of data.items) {
        const itemQuantity = parseFloat(item.quantity);
        const freeQuantity = parseFloat(item.freeQuantity || '0');
        const totalReceivedQty = itemQuantity + freeQuantity;
        const unitCost = parseFloat(item.unitPurchaseCost);
        const mrp = parseFloat(item.mrp);
        const sellingPrice = parseFloat(item.sellingPrice || item.mrp);
        const wholesalePrice = parseFloat(item.wholesalePrice || '0');

        // Create or get Product Batch
        const batchRes = await client.query(
          `
          INSERT INTO product_batches (
            organization_id, product_id, batch_number, mfg_date, expiry_date,
            purchase_price, mrp, selling_price, wholesale_price, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
          ON CONFLICT (organization_id, product_id, batch_number)
          DO UPDATE SET 
            purchase_price = EXCLUDED.purchase_price,
            mrp = EXCLUDED.mrp,
            selling_price = EXCLUDED.selling_price,
            wholesale_price = EXCLUDED.wholesale_price,
            expiry_date = EXCLUDED.expiry_date
          RETURNING id
          `,
          [
            organizationId,
            item.productId,
            item.batchNumber,
            item.mfgDate || null,
            item.expiryDate,
            unitCost,
            mrp,
            sellingPrice,
            wholesalePrice
          ]
        );
        const batchId = batchRes.rows[0].id;

        // Insert Purchase Item record
        await client.query(
          `
          INSERT INTO purchase_items (
            purchase_id, product_id, batch_id, batch_number, mfg_date, expiry_date,
            quantity, free_quantity, unit_id, unit_purchase_cost, mrp, selling_price,
            wholesale_price, discount_amount, vat_amount, subtotal
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `,
          [
            purchase.id,
            item.productId,
            batchId,
            item.batchNumber,
            item.mfgDate || null,
            item.expiryDate,
            itemQuantity,
            freeQuantity,
            item.unitId || null,
            unitCost,
            mrp,
            sellingPrice,
            wholesalePrice,
            item.discountAmount || 0.0,
            item.vatAmount || 0.0,
            item.subtotal || itemQuantity * unitCost
          ]
        );

        // Update Stock
        const stockRes = await client.query(
          `
          INSERT INTO stocks (
            organization_id, branch_id, warehouse_id, product_id, batch_id, quantity_available
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (branch_id, warehouse_id, product_id, batch_id)
          DO UPDATE SET quantity_available = stocks.quantity_available + EXCLUDED.quantity_available, updated_at = CURRENT_TIMESTAMP
          RETURNING quantity_available
          `,
          [organizationId, data.branchId, data.warehouseId, item.productId, batchId, totalReceivedQty]
        );
        const newStockLevel = stockRes.rows[0].quantity_available;

        // Log Stock Movement
        await client.query(
          `
          INSERT INTO stock_movements (
            organization_id, branch_id, warehouse_id, product_id, batch_id,
            movement_type, reference_type, reference_id, quantity, unit_cost, total_cost, balance_after, notes, performed_by
          ) VALUES ($1, $2, $3, $4, $5, 'PURCHASE_IN', 'PURCHASE', $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            organizationId,
            data.branchId,
            data.warehouseId,
            item.productId,
            batchId,
            purchase.id,
            totalReceivedQty,
            unitCost,
            itemQuantity * unitCost,
            newStockLevel,
            `Purchase Invoice: ${data.invoiceNumber}`,
            userId
          ]
        );
      }

      // 3. Update Supplier Balance & Ledger
      const suppRes = await client.query(
        'SELECT current_balance FROM suppliers WHERE id = $1 FOR UPDATE',
        [data.supplierId]
      );
      const prevBal = parseFloat(suppRes.rows[0]?.current_balance || '0');
      const newBal = prevBal + dueAmount;

      await client.query('UPDATE suppliers SET current_balance = $1 WHERE id = $2', [newBal, data.supplierId]);

      await client.query(
        `
        INSERT INTO supplier_ledgers (
          organization_id, supplier_id, entry_type, reference_type, reference_id,
          reference_number, credit_amount, running_balance, description
        ) VALUES ($1, $2, 'PURCHASE_INVOICE', 'PURCHASE', $3, $4, $5, $6, $7)
        `,
        [
          organizationId,
          data.supplierId,
          purchase.id,
          data.invoiceNumber,
          grandTotal,
          newBal,
          `Goods received on invoice ${data.invoiceNumber}`
        ]
      );

      // 4. Record Payment if paid upfront
      if (paidAmount > 0) {
        const paymentNo = `SPAY-${Date.now()}`;
        await client.query(
          `
          INSERT INTO supplier_payments (
            organization_id, branch_id, supplier_id, purchase_id, payment_number,
            amount, payment_method, notes, paid_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            organizationId,
            data.branchId,
            data.supplierId,
            purchase.id,
            paymentNo,
            paidAmount,
            data.paymentMethod || 'CASH',
            'Upfront payment on invoice receiving',
            userId
          ]
        );

        await client.query(
          `
          INSERT INTO supplier_ledgers (
            organization_id, supplier_id, entry_type, reference_type, reference_id,
            reference_number, debit_amount, running_balance, description
          ) VALUES ($1, $2, 'PAYMENT', 'SUPPLIER_PAYMENT', $3, $4, $5, $6, $7)
          `,
          [
            organizationId,
            data.supplierId,
            purchase.id,
            paymentNo,
            paidAmount,
            newBal - paidAmount,
            `Payment made against invoice ${data.invoiceNumber}`
          ]
        );
      }

      return purchase;
    });
  }

  /**
   * Supplier Ledger History
   */
  static async getSupplierLedger(organizationId: string, supplierId: string) {
    const res = await pool.query(
      `
      SELECT * FROM supplier_ledgers
      WHERE organization_id = $1 AND supplier_id = $2
      ORDER BY entry_date ASC, created_at ASC
      `,
      [organizationId, supplierId]
    );
    return res.rows;
  }
}
