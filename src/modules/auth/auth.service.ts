import { pool, withTransaction } from '../../database/connection.js';
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/hash.util.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class AuthService {
  /**
   * Register a new Pharmacy SaaS Tenant (Organization, Main Branch, Store, Owner User & Roles)
   */
  static async registerOrganization(data: any) {
    return withTransaction(async (client) => {
      // Check slug existence
      const slugCheck = await client.query('SELECT id FROM organizations WHERE slug = $1', [data.slug]);
      if (slugCheck.rows.length > 0) {
        throw new AppError('Organization slug already exists. Please choose a different slug.', 409);
      }

      // 1. Create Organization
      const orgRes = await client.query(
        `
        INSERT INTO organizations (
          name, slug, business_type, owner_name, owner_email, owner_phone, currency, address_city
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          data.organizationName,
          data.slug,
          data.businessType,
          data.ownerName,
          data.ownerEmail,
          data.ownerPhone,
          data.currency || 'BDT',
          data.addressCity || null
        ]
      );
      const organization = orgRes.rows[0];

      // 2. Create Main Branch
      const branchRes = await client.query(
        `
        INSERT INTO branches (organization_id, code, name, is_main_branch, address_city)
        VALUES ($1, 'BR-MAIN', $2, true, $3)
        RETURNING *
        `,
        [organization.id, data.branchName || 'Main Branch', data.addressCity || null]
      );
      const branch = branchRes.rows[0];

      // 3. Create Default Store / Warehouse
      await client.query(
        `
        INSERT INTO warehouses (organization_id, branch_id, code, name, is_default)
        VALUES ($1, $2, 'WH-MAIN', 'Main Store', true)
        `,
        [organization.id, branch.id]
      );

      // 4. Create Owner User
      const pwdHash = await hashPassword(data.password);
      const userRes = await client.query(
        `
        INSERT INTO users (
          organization_id, default_branch_id, first_name, last_name, email, phone, password_hash, is_org_owner
        ) VALUES ($1, $2, $3, '', $4, $5, $6, true)
        RETURNING id, organization_id, default_branch_id, first_name, email, phone, is_org_owner, created_at
        `,
        [organization.id, branch.id, data.ownerName, data.ownerEmail, data.ownerPhone, pwdHash]
      );
      const user = userRes.rows[0];

      // 5. Assign OWNER Role
      const ownerRole = await client.query("SELECT id FROM roles WHERE code = 'OWNER' AND organization_id IS NULL");
      if (ownerRole.rows.length > 0) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user.id, ownerRole.rows[0].id]
        );
      }

      // 6. Generate Tokens
      const tokenPayload = {
        userId: user.id,
        organizationId: organization.id,
        branchId: branch.id,
        email: user.email,
        isSuperAdmin: false,
        isOrgOwner: true,
        roles: ['OWNER']
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ userId: user.id });

      return {
        organization,
        branch,
        user,
        tokens: {
          accessToken,
          refreshToken
        }
      };
    });
  }

  /**
   * User Login with Email and Password
   */
  static async login(email: string, password: string, organizationSlug?: string) {
    let queryText = `
      SELECT u.*, o.slug as org_slug, o.is_active as org_active, o.name as org_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.email = $1
    `;
    const params: any[] = [email];

    if (organizationSlug) {
      queryText += ` AND o.slug = $2`;
      params.push(organizationSlug);
    }

    const res = await pool.query(queryText, params);
    if (res.rows.length === 0) {
      throw new AppError('Invalid email or password', 401);
    }

    const user = res.rows[0];

    if (!user.is_active || user.status !== 'ACTIVE') {
      throw new AppError('User account is inactive or suspended. Please contact administrator.', 403);
    }

    if (user.organization_id && !user.org_active) {
      throw new AppError('Pharmacy organization account is suspended. Please contact support.', 403);
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    // Fetch user roles & permissions
    const rolesRes = await pool.query(
      `
      SELECT r.code, r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
      `,
      [user.id]
    );
    const roles = rolesRes.rows.map((r: { code: string }) => r.code);

    const tokenPayload = {
      userId: user.id,
      organizationId: user.organization_id,
      branchId: user.default_branch_id,
      email: user.email,
      isSuperAdmin: user.is_super_admin,
      isOrgOwner: user.is_org_owner,
      roles
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Update last login
    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    delete user.password_hash;

    return {
      user,
      roles,
      tokens: {
        accessToken,
        refreshToken
      }
    };
  }

  /**
   * Refresh Token
   */
  static async refreshToken(token: string) {
    try {
      const decoded = verifyRefreshToken(token);
      const res = await pool.query('SELECT * FROM users WHERE id = $1 AND status = $2', [decoded.userId, 'ACTIVE']);
      if (res.rows.length === 0) {
        throw new AppError('User not found or inactive', 401);
      }

      const user = res.rows[0];
      const rolesRes = await pool.query(
        `
        SELECT r.code
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
        `,
        [user.id]
      );
      const roles = rolesRes.rows.map((r: { code: string }) => r.code);

      const tokenPayload = {
        userId: user.id,
        organizationId: user.organization_id,
        branchId: user.default_branch_id,
        email: user.email,
        isSuperAdmin: user.is_super_admin,
        isOrgOwner: user.is_org_owner,
        roles
      };

      const accessToken = generateAccessToken(tokenPayload);
      const newRefreshToken = generateRefreshToken({ userId: user.id });

      return {
        accessToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      throw new AppError('Invalid or expired refresh token', 401);
    }
  }

  /**
   * Get Current User Profile
   */
  static async getCurrentUser(userId: string) {
    const userRes = await pool.query(
      `
      SELECT u.id, u.organization_id, u.default_branch_id, u.first_name, u.last_name, u.email, u.phone,
             u.avatar_url, u.status, u.is_org_owner, u.is_super_admin, u.created_at,
             o.name as organization_name, o.slug as organization_slug, o.currency, o.currency_symbol,
             b.name as default_branch_name, b.code as default_branch_code
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN branches b ON u.default_branch_id = b.id
      WHERE u.id = $1
      `,
      [userId]
    );

    if (userRes.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = userRes.rows[0];

    const rolesRes = await pool.query(
      `
      SELECT r.id, r.code, r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
      `,
      [userId]
    );

    const permissionsRes = await pool.query(
      `
      SELECT DISTINCT p.slug
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = $1
      `,
      [userId]
    );

    return {
      ...user,
      roles: rolesRes.rows,
      permissions: permissionsRes.rows.map((p: { slug: string }) => p.slug)
    };
  }
}
