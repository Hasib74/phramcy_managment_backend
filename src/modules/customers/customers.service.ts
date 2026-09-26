import { pool, withTransaction } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class CustomersService {
  static async getCustomers(organizationId: string, search?: string) {
    let queryText = 'SELECT * FROM customers WHERE organization_id = $1';
    const params: any[] = [organizationId];

    if (search) {
      queryText += ' AND (name ILIKE $2 OR phone ILIKE $2 OR customer_code ILIKE $2)';
      params.push(`%${search}%`);
    }

    queryText += ' ORDER BY name ASC';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  static async createCustomer(organizationId: string, data: any) {
    const code = `CUST-${Date.now().toString().slice(-6)}`;
    const res = await pool.query(
      `
      INSERT INTO customers (
        organization_id, customer_code, name, phone, email, gender,
        date_of_birth, blood_group, address_street, address_city,
        customer_type, credit_limit, opening_due, current_due, allergies, chronic_conditions, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $14, $15, $16)
      RETURNING *
      `,
      [
        organizationId,
        code,
        data.name,
        data.phone,
        data.email || null,
        data.gender || null,
        data.dateOfBirth || null,
        data.bloodGroup || null,
        data.addressStreet || null,
        data.addressCity || null,
        data.customerType || 'RETAIL',
        data.creditLimit || 0.0,
        data.openingDue || 0.0,
        data.allergies || null,
        data.chronicConditions || null,
        data.notes || null
      ]
    );
    return res.rows[0];
  }

  static async recordDuePayment(organizationId: string, branchId: string, userId: string, data: any) {
    return withTransaction(async (client) => {
      const paymentNo = `CPAY-${Date.now()}`;
      const amount = parseFloat(data.amount);

      const custRes = await client.query('SELECT current_due FROM customers WHERE id = $1 FOR UPDATE', [data.customerId]);
      if (custRes.rows.length === 0) {
        throw new AppError('Customer not found', 404);
      }
      const prevDue = parseFloat(custRes.rows[0].current_due || '0');
      const newDue = prevDue - amount;

      await client.query('UPDATE customers SET current_due = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newDue, data.customerId]);

      const payRes = await client.query(
        `
        INSERT INTO customer_payments (
          organization_id, branch_id, customer_id, sale_id, payment_number,
          amount, payment_method, transaction_reference, notes, received_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          organizationId,
          branchId,
          data.customerId,
          data.saleId || null,
          paymentNo,
          amount,
          data.paymentMethod || 'CASH',
          data.transactionReference || null,
          data.notes || null,
          userId
        ]
      );

      await client.query(
        `
        INSERT INTO customer_ledgers (
          organization_id, customer_id, entry_type, reference_type, reference_id,
          reference_number, credit_amount, running_balance, description
        ) VALUES ($1, $2, 'PAYMENT', 'CUSTOMER_PAYMENT', $3, $4, $5, $6, $7)
        `,
        [
          organizationId,
          data.customerId,
          payRes.rows[0].id,
          paymentNo,
          amount,
          newDue,
          `Due settlement payment: ${paymentNo}`
        ]
      );

      return payRes.rows[0];
    });
  }

  static async getCustomerLedger(organizationId: string, customerId: string) {
    const res = await pool.query(
      `
      SELECT * FROM customer_ledgers
      WHERE organization_id = $1 AND customer_id = $2
      ORDER BY entry_date ASC, created_at ASC
      `,
      [organizationId, customerId]
    );
    return res.rows;
  }
}
