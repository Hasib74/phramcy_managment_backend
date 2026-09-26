import { pool, withTransaction } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { hashPassword } from '../../utils/hash.util.js';

export class OrganizationsService {
  /**
   * Get Organization Profile & Settings
   */
  static async getOrganizationProfile(organizationId: string) {
    const res = await pool.query(
      `
      SELECT id, name, slug, business_type, subscription_plan, owner_name, owner_email, owner_phone,
             logo_url, trade_license_no, drug_license_no, tax_identification_no, vat_registration_no,
             currency, currency_symbol, timezone, address_street, address_city, address_country,
             default_vat_rate, enable_fefo, enable_prescription_check, enable_loyalty_program,
             enable_online_store, enable_multi_branch, settings, is_active, created_at
      FROM organizations
      WHERE id = $1
      `,
      [organizationId]
    );

    if (res.rows.length === 0) {
      throw new AppError('Organization not found', 404);
    }
    return res.rows[0];
  }

  /**
   * Update Organization Settings & Feature Flags
   */
  static async updateOrganizationSettings(organizationId: string, data: any) {
    const res = await pool.query(
      `
      UPDATE organizations
      SET 
        name = COALESCE($2, name),
        logo_url = COALESCE($3, logo_url),
        trade_license_no = COALESCE($4, trade_license_no),
        drug_license_no = COALESCE($5, drug_license_no),
        vat_registration_no = COALESCE($6, vat_registration_no),
        default_vat_rate = COALESCE($7, default_vat_rate),
        enable_fefo = COALESCE($8, enable_fefo),
        enable_prescription_check = COALESCE($9, enable_prescription_check),
        enable_loyalty_program = COALESCE($10, enable_loyalty_program),
        enable_online_store = COALESCE($11, enable_online_store),
        enable_multi_branch = COALESCE($12, enable_multi_branch),
        address_street = COALESCE($13, address_street),
        address_city = COALESCE($14, address_city),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [
        organizationId,
        data.name || null,
        data.logoUrl || null,
        data.tradeLicenseNo || null,
        data.drugLicenseNo || null,
        data.vatRegistrationNo || null,
        data.defaultVatRate !== undefined ? data.defaultVatRate : null,
        data.enableFefo !== undefined ? data.enableFefo : null,
        data.enablePrescriptionCheck !== undefined ? data.enablePrescriptionCheck : null,
        data.enableLoyaltyProgram !== undefined ? data.enableLoyaltyProgram : null,
        data.enableOnlineStore !== undefined ? data.enableOnlineStore : null,
        data.enableMultiBranch !== undefined ? data.enableMultiBranch : null,
        data.addressStreet || null,
        data.addressCity || null
      ]
    );

    return res.rows[0];
  }

  /**
   * List Branches
   */
  static async getBranches(organizationId: string) {
    const res = await pool.query(
      `
      SELECT b.*, 
             (SELECT COUNT(*) FROM users WHERE default_branch_id = b.id) as total_users,
             (SELECT COUNT(*) FROM warehouses WHERE branch_id = b.id) as total_warehouses
      FROM branches b
      WHERE b.organization_id = $1 AND b.is_active = true
      ORDER BY b.is_main_branch DESC, b.name ASC
      `,
      [organizationId]
    );
    return res.rows;
  }

  /**
   * Create New Branch
   */
  static async createBranch(organizationId: string, data: any) {
    return withTransaction(async (client) => {
      const branchCode = data.code || `BR-${Date.now().toString().slice(-4)}`;

      const res = await client.query(
        `
        INSERT INTO branches (
          organization_id, code, name, branch_type, phone, email,
          address_street, address_city, is_main_branch, pos_invoice_prefix
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          organizationId,
          branchCode,
          data.name,
          data.branchType || 'RETAIL_OUTLET',
          data.phone || null,
          data.email || null,
          data.addressStreet || null,
          data.addressCity || null,
          data.isMainBranch || false,
          data.posInvoicePrefix || 'INV'
        ]
      );
      const branch = res.rows[0];

      // Automatically create a default store warehouse for this branch
      await client.query(
        `
        INSERT INTO warehouses (organization_id, branch_id, code, name, is_default)
        VALUES ($1, $2, $3, $4, true)
        `,
        [organizationId, branch.id, `WH-${branchCode}`, `${data.name} Store`]
      );

      return branch;
    });
  }

  /**
   * List Warehouses
   */
  static async getWarehouses(organizationId: string, branchId?: string) {
    let queryText = `
      SELECT w.*, b.name as branch_name
      FROM warehouses w
      LEFT JOIN branches b ON w.branch_id = b.id
      WHERE w.organization_id = $1 AND w.is_active = true
    `;
    const params: any[] = [organizationId];

    if (branchId) {
      queryText += ' AND w.branch_id = $2';
      params.push(branchId);
    }

    queryText += ' ORDER BY w.is_default DESC, w.name ASC';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Create Warehouse / Store Room
   */
  static async createWarehouse(organizationId: string, data: any) {
    const code = data.code || `WH-${Date.now().toString().slice(-4)}`;
    const res = await pool.query(
      `
      INSERT INTO warehouses (
        organization_id, branch_id, code, name, warehouse_type, location_description, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        organizationId,
        data.branchId || null,
        code,
        data.name,
        data.warehouseType || 'BRANCH_STORE',
        data.locationDescription || null,
        data.isDefault || false
      ]
    );
    return res.rows[0];
  }

  /**
   * List Users in Organization
   */
  static async getOrganizationUsers(organizationId: string) {
    const res = await pool.query(
      `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.status, u.is_org_owner, u.created_at,
             b.name as branch_name,
             ARRAY_AGG(r.name) as roles
      FROM users u
      LEFT JOIN branches b ON u.default_branch_id = b.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.organization_id = $1
      GROUP BY u.id, b.name
      ORDER BY u.created_at ASC
      `,
      [organizationId]
    );
    return res.rows;
  }

  /**
   * Create / Invite User (Staff, Pharmacist, Cashier, Accountant)
   */
  static async createOrganizationUser(organizationId: string, data: any) {
    return withTransaction(async (client) => {
      const pwdHash = await hashPassword(data.password || 'User@123456');

      const userRes = await client.query(
        `
        INSERT INTO users (
          organization_id, default_branch_id, first_name, last_name, email, phone, password_hash, is_org_owner
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)
        RETURNING id, organization_id, default_branch_id, first_name, last_name, email, phone, status, created_at
        `,
        [
          organizationId,
          data.branchId || null,
          data.firstName,
          data.lastName || '',
          data.email,
          data.phone || null,
          pwdHash
        ]
      );
      const user = userRes.rows[0];

      // Assign Role
      if (data.roleCode) {
        const roleRes = await client.query(
          "SELECT id FROM roles WHERE code = $1 AND (organization_id = $2 OR organization_id IS NULL)",
          [data.roleCode, organizationId]
        );
        if (roleRes.rows.length > 0) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
            user.id,
            roleRes.rows[0].id
          ]);
        }
      }

      return user;
    });
  }
}
