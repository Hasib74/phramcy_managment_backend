import { pool } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class ProductsService {
  /**
   * Search / List Products with pagination, category filter, generic filter & stock summary
   */
  static async getProducts(
    organizationId: string,
    filters: {
      search?: string;
      categoryId?: string;
      genericId?: string;
      manufacturerId?: string;
      requiresPrescription?: boolean;
      isActive?: boolean;
      page?: number;
      limit?: number;
    }
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let queryText = `
      SELECT 
        p.*,
        c.name as category_name,
        g.name as generic_name_db,
        m.name as manufacturer_name,
        df.name as dosage_form_name,
        df.short_code as dosage_form_code,
        u.name as primary_unit_name,
        u.short_code as primary_unit_code,
        COALESCE(SUM(s.quantity_available), 0) as total_stock_available
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      LEFT JOIN generics g ON p.generic_id = g.id
      LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
      LEFT JOIN dosage_forms df ON p.dosage_form_id = df.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      LEFT JOIN stocks s ON p.id = s.product_id
      WHERE p.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters.search) {
      queryText += ` AND (p.brand_name ILIKE $${paramIndex} OR p.generic_name ILIKE $${paramIndex} OR p.barcode = $${paramIndex + 1} OR p.sku = $${paramIndex + 1})`;
      params.push(`%${filters.search}%`, filters.search);
      paramIndex += 2;
    }

    if (filters.categoryId) {
      queryText += ` AND p.category_id = $${paramIndex}`;
      params.push(filters.categoryId);
      paramIndex++;
    }

    if (filters.genericId) {
      queryText += ` AND p.generic_id = $${paramIndex}`;
      params.push(filters.genericId);
      paramIndex++;
    }

    if (filters.manufacturerId) {
      queryText += ` AND p.manufacturer_id = $${paramIndex}`;
      params.push(filters.manufacturerId);
      paramIndex++;
    }

    if (filters.requiresPrescription !== undefined) {
      queryText += ` AND p.requires_prescription = $${paramIndex}`;
      params.push(filters.requiresPrescription);
      paramIndex++;
    }

    if (filters.isActive !== undefined) {
      queryText += ` AND p.is_active = $${paramIndex}`;
      params.push(filters.isActive);
      paramIndex++;
    }

    queryText += `
      GROUP BY p.id, c.name, g.name, m.name, df.name, df.short_code, u.name, u.short_code
      ORDER BY p.brand_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await pool.query(queryText, params);

    // Count query
    const countRes = await pool.query(
      'SELECT COUNT(*) as total FROM products WHERE organization_id = $1',
      [organizationId]
    );
    const total = parseInt(countRes.rows[0].total, 10);

    return {
      products: result.rows,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get Single Product By ID with its active batches and stock breakdown
   */
  static async getProductById(organizationId: string, productId: string, branchId?: string) {
    const productRes = await pool.query(
      `
      SELECT 
        p.*,
        c.name as category_name,
        g.name as generic_name_db,
        m.name as manufacturer_name,
        df.name as dosage_form_name,
        u.name as primary_unit_name,
        u.short_code as primary_unit_code
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      LEFT JOIN generics g ON p.generic_id = g.id
      LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
      LEFT JOIN dosage_forms df ON p.dosage_form_id = df.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      WHERE p.id = $1 AND p.organization_id = $2
      `,
      [productId, organizationId]
    );

    if (productRes.rows.length === 0) {
      throw new AppError('Product not found', 404);
    }

    const product = productRes.rows[0];

    // Fetch batches & stock
    let batchQuery = `
      SELECT 
        b.id as batch_id,
        b.batch_number,
        b.mfg_date,
        b.expiry_date,
        b.purchase_price,
        b.mrp,
        b.selling_price,
        b.wholesale_price,
        COALESCE(s.quantity_available, 0) as quantity_available,
        COALESCE(s.quantity_reserved, 0) as quantity_reserved,
        s.rack_location
      FROM product_batches b
      LEFT JOIN stocks s ON b.id = s.batch_id
      WHERE b.product_id = $1 AND b.organization_id = $2
    `;
    const batchParams: any[] = [productId, organizationId];

    if (branchId) {
      batchQuery += ` AND s.branch_id = $3`;
      batchParams.push(branchId);
    }

    batchQuery += ` ORDER BY b.expiry_date ASC`;

    const batchesRes = await pool.query(batchQuery, batchParams);

    return {
      ...product,
      batches: batchesRes.rows
    };
  }

  /**
   * Create New Product
   */
  static async createProduct(organizationId: string, data: any) {
    const result = await pool.query(
      `
      INSERT INTO products (
        organization_id, category_id, generic_id, manufacturer_id, dosage_form_id, primary_unit_id,
        brand_name, generic_name, strength, sku, barcode, pack_size, pieces_per_pack,
        route_of_administration, requires_prescription, is_narcotic, is_cold_chain,
        min_stock_alert_level, reorder_quantity, max_stock_level,
        default_purchase_price, mrp, selling_price, wholesale_price, vat_percent,
        shelf_location, image_url, description
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23, $24, $25,
        $26, $27, $28
      )
      RETURNING *
      `,
      [
        organizationId,
        data.categoryId || null,
        data.genericId || null,
        data.manufacturerId || null,
        data.dosageFormId || null,
        data.primaryUnitId || null,
        data.brandName,
        data.genericName || null,
        data.strength || null,
        data.sku || `SKU-${Date.now()}`,
        data.barcode || null,
        data.packSize || '1 Box',
        data.piecesPerPack || 1,
        data.routeOfAdministration || 'Oral',
        data.requiresPrescription || false,
        data.isNarcotic || false,
        data.isColdChain || false,
        data.minStockAlertLevel || 10,
        data.reorderQuantity || 50,
        data.maxStockLevel || 1000,
        data.defaultPurchasePrice || 0.0,
        data.mrp || 0.0,
        data.sellingPrice || 0.0,
        data.wholesalePrice || 0.0,
        data.vatPercent || 0.0,
        data.shelfLocation || null,
        data.imageUrl || null,
        data.description || null
      ]
    );

    return result.rows[0];
  }

  /**
   * Update Existing Product
   */
  static async updateProduct(organizationId: string, productId: string, data: any) {
    const fields: string[] = [];
    const params: any[] = [productId, organizationId];
    let idx = 3;

    const allowedUpdates = [
      'category_id', 'generic_id', 'manufacturer_id', 'dosage_form_id', 'primary_unit_id',
      'brand_name', 'generic_name', 'strength', 'sku', 'barcode', 'pack_size', 'pieces_per_pack',
      'requires_prescription', 'is_narcotic', 'is_cold_chain', 'min_stock_alert_level',
      'reorder_quantity', 'default_purchase_price', 'mrp', 'selling_price', 'wholesale_price',
      'vat_percent', 'shelf_location', 'image_url', 'description', 'is_active'
    ];

    for (const [key, value] of Object.entries(data)) {
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      if (allowedUpdates.includes(snakeKey)) {
        fields.push(`${snakeKey} = $${idx}`);
        params.push(value);
        idx++;
      }
    }

    if (fields.length === 0) {
      throw new AppError('No valid fields provided for update', 400);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await pool.query(
      `
      UPDATE products
      SET ${fields.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *
      `,
      params
    );

    if (result.rows.length === 0) {
      throw new AppError('Product not found or update failed', 404);
    }

    return result.rows[0];
  }

  /**
   * Generics Master List
   */
  static async getGenerics(organizationId: string) {
    const res = await pool.query(
      'SELECT * FROM generics WHERE organization_id = $1 OR organization_id IS NULL ORDER BY name ASC',
      [organizationId]
    );
    return res.rows;
  }

  /**
   * Categories Master List
   */
  static async getCategories(organizationId: string) {
    const res = await pool.query(
      'SELECT * FROM product_categories WHERE organization_id = $1 AND is_active = true ORDER BY name ASC',
      [organizationId]
    );
    return res.rows;
  }

  /**
   * Manufacturers Master List
   */
  static async getManufacturers(organizationId: string) {
    const res = await pool.query(
      'SELECT * FROM manufacturers WHERE organization_id = $1 AND is_active = true ORDER BY name ASC',
      [organizationId]
    );
    return res.rows;
  }

  /**
   * Dosage Forms & Units
   */
  static async getMetadata(organizationId: string) {
    const dfRes = await pool.query('SELECT * FROM dosage_forms WHERE organization_id = $1 OR organization_id IS NULL', [organizationId]);
    const unitsRes = await pool.query('SELECT * FROM units WHERE organization_id = $1 OR organization_id IS NULL', [organizationId]);
    return {
      dosageForms: dfRes.rows,
      units: unitsRes.rows
    };
  }
}
