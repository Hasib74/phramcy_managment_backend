import { pool, withTransaction } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class OrdersService {
  /**
   * Get Storefront Website CMS Configuration
   */
  static async getWebsiteConfig(organizationId: string) {
    const res = await pool.query('SELECT * FROM websites WHERE organization_id = $1', [organizationId]);
    return res.rows[0] || null;
  }

  /**
   * Update Storefront CMS Settings
   */
  static async updateWebsiteConfig(organizationId: string, data: any) {
    const res = await pool.query(
      `
      INSERT INTO websites (
        organization_id, subdomain, custom_domain, site_title, tagline,
        primary_theme_color, secondary_theme_color, hero_headline, hero_description,
        contact_phone, contact_email, store_address, is_published
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (organization_id) DO UPDATE SET
        site_title = EXCLUDED.site_title,
        tagline = EXCLUDED.tagline,
        primary_theme_color = EXCLUDED.primary_theme_color,
        secondary_theme_color = EXCLUDED.secondary_theme_color,
        hero_headline = EXCLUDED.hero_headline,
        hero_description = EXCLUDED.hero_description,
        contact_phone = EXCLUDED.contact_phone,
        contact_email = EXCLUDED.contact_email,
        store_address = EXCLUDED.store_address,
        is_published = EXCLUDED.is_published,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        organizationId,
        data.subdomain,
        data.customDomain || null,
        data.siteTitle,
        data.tagline || null,
        data.primaryThemeColor || '#059669',
        data.secondaryThemeColor || '#10B981',
        data.heroHeadline || null,
        data.heroDescription || null,
        data.contactPhone || null,
        data.contactEmail || null,
        data.storeAddress || null,
        data.isPublished !== undefined ? data.isPublished : true
      ]
    );
    return res.rows[0];
  }

  /**
   * List Online Orders
   */
  static async getOrders(organizationId: string, status?: string) {
    let queryText = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM online_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (status) {
      queryText += ' AND o.order_status = $2';
      params.push(status);
    }

    queryText += ' ORDER BY o.order_date DESC';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Place Online Order (From Customer Web / Mobile App)
   */
  static async placeOnlineOrder(organizationId: string, data: any) {
    return withTransaction(async (client) => {
      const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

      const orderRes = await client.query(
        `
        INSERT INTO online_orders (
          organization_id, branch_id, customer_id, order_number, recipient_name,
          recipient_phone, delivery_address_street, delivery_address_city, subtotal,
          discount_amount, delivery_fee, grand_total, payment_method, order_status, customer_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PENDING', $14)
        RETURNING *
        `,
        [
          organizationId,
          data.branchId,
          data.customerId || null,
          orderNumber,
          data.recipientName,
          data.recipientPhone,
          data.deliveryAddressStreet,
          data.deliveryAddressCity || null,
          data.subtotal,
          data.discountAmount || 0,
          data.deliveryFee || 0,
          data.grandTotal,
          data.paymentMethod || 'COD',
          data.customerNotes || null
        ]
      );
      const order = orderRes.rows[0];

      for (const item of data.items) {
        await client.query(
          `
          INSERT INTO order_items (
            order_id, product_id, quantity, unit_price, total_price
          ) VALUES ($1, $2, $3, $4, $5)
          `,
          [order.id, item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice]
        );
      }

      // Log status timeline
      await client.query(
        `INSERT INTO order_status_timeline (order_id, status, remarks) VALUES ($1, 'PENDING', 'Order placed by customer')`,
        [order.id]
      );

      return order;
    });
  }

  /**
   * Update Order Status & Assign Delivery Rider
   */
  static async updateOrderStatus(
    organizationId: string,
    orderId: string,
    userId: string,
    status: string,
    riderId?: string,
    remarks?: string
  ) {
    return withTransaction(async (client) => {
      const ord = await client.query(
        'UPDATE online_orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3 RETURNING *',
        [status, orderId, organizationId]
      );
      if (ord.rows.length === 0) {
        throw new AppError('Order not found', 404);
      }

      if (riderId && status === 'ASSIGNED_TO_RIDER') {
        await client.query(
          `
          INSERT INTO delivery_assignments (order_id, rider_id, status)
          VALUES ($1, $2, 'ASSIGNED')
          `,
          [orderId, riderId]
        );
      }

      await client.query(
        `
        INSERT INTO order_status_timeline (order_id, status, remarks, changed_by)
        VALUES ($1, $2, $3, $4)
        `,
        [orderId, status, remarks || `Status changed to ${status}`, userId]
      );

      return ord.rows[0];
    });
  }

  /**
   * Delivery Riders List
   */
  static async getRiders(organizationId: string) {
    const res = await pool.query('SELECT * FROM delivery_riders WHERE organization_id = $1 AND is_active = true', [organizationId]);
    return res.rows;
  }
}
