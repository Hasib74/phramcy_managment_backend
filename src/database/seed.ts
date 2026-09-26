import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './connection.js';

async function seedDatabase() {
  console.log('🌱 Starting Database Seeding...');

  try {
    await withTransaction(async (client) => {
      // 1. Standard System Permissions
      console.log('🔹 Seeding System Permissions...');
      const permissions = [
        // Tenancy & Organization
        { module: 'ORGANIZATION', action: 'MANAGE', slug: 'org:manage', description: 'Full organization settings access' },
        { module: 'BRANCH', action: 'MANAGE', slug: 'branch:manage', description: 'Manage branches & locations' },
        { module: 'USER', action: 'MANAGE', slug: 'user:manage', description: 'Manage users and credentials' },
        { module: 'ROLE', action: 'MANAGE', slug: 'role:manage', description: 'Manage roles and permissions' },
        
        // Products & Inventory
        { module: 'PRODUCT', action: 'CREATE', slug: 'product:create', description: 'Add new products' },
        { module: 'PRODUCT', action: 'READ', slug: 'product:read', description: 'View product catalog' },
        { module: 'PRODUCT', action: 'UPDATE', slug: 'product:update', description: 'Edit product details' },
        { module: 'PRODUCT', action: 'DELETE', slug: 'product:delete', description: 'Archive products' },
        { module: 'BATCH', action: 'MANAGE', slug: 'batch:manage', description: 'Manage batches and expiry dates' },
        { module: 'STOCK', action: 'VIEW', slug: 'stock:view', description: 'View stock levels' },
        { module: 'STOCK', action: 'ADJUST', slug: 'stock:adjust', description: 'Perform stock adjustments' },
        { module: 'STOCK', action: 'TRANSFER', slug: 'stock:transfer', description: 'Transfer stock between branches' },
        
        // Purchases & Suppliers
        { module: 'SUPPLIER', action: 'MANAGE', slug: 'supplier:manage', description: 'Manage suppliers and ledgers' },
        { module: 'PURCHASE', action: 'CREATE', slug: 'purchase:create', description: 'Create purchase invoices' },
        { module: 'PURCHASE', action: 'READ', slug: 'purchase:read', description: 'View purchase invoices' },
        { module: 'PURCHASE', action: 'PAY', slug: 'purchase:pay', description: 'Make payments to suppliers' },
        
        // POS & Sales
        { module: 'POS', action: 'ACCESS', slug: 'pos:access', description: 'Access POS terminal' },
        { module: 'SALE', action: 'CREATE', slug: 'sale:create', description: 'Complete sales transactions' },
        { module: 'SALE', action: 'VIEW', slug: 'sale:view', description: 'View sales invoices' },
        { module: 'SALE', action: 'DISCOUNT', slug: 'sale:discount', description: 'Apply custom discounts on sales' },
        { module: 'SALE', action: 'REFUND', slug: 'sale:refund', description: 'Process sale returns and refunds' },
        { module: 'SALE', action: 'VOID', slug: 'sale:void', description: 'Void completed sales' },
        
        // Prescriptions & CRM
        { module: 'PRESCRIPTION', action: 'MANAGE', slug: 'prescription:manage', description: 'Review and dispense prescriptions' },
        { module: 'CUSTOMER', action: 'MANAGE', slug: 'customer:manage', description: 'Manage customer CRM & dues' },
        
        // Accounts & Expenses
        { module: 'ACCOUNTING', action: 'MANAGE', slug: 'accounting:manage', description: 'Manage chart of accounts & journals' },
        { module: 'EXPENSE', action: 'MANAGE', slug: 'expense:manage', description: 'Manage expenses & approvals' },
        { module: 'REPORT', action: 'VIEW_FINANCIAL', slug: 'report:financial', description: 'View financial P&L and Balance Sheet' },
        
        // HR & Payroll
        { module: 'HR', action: 'MANAGE', slug: 'hr:manage', description: 'Manage employees and attendance' },
        { module: 'PAYROLL', action: 'MANAGE', slug: 'payroll:manage', description: 'Process salary and payroll' },
        
        // Ecommerce & Website
        { module: 'WEBSITE', action: 'MANAGE', slug: 'website:manage', description: 'Manage web storefront CMS' },
        { module: 'ORDER', action: 'MANAGE', slug: 'order:manage', description: 'Process online orders' },
        { module: 'DELIVERY', action: 'MANAGE', slug: 'delivery:manage', description: 'Assign riders and deliveries' },
        
        // Audit & Analytics
        { module: 'AUDIT', action: 'VIEW', slug: 'audit:view', description: 'View audit logs' },
        { module: 'ANALYTICS', action: 'VIEW', slug: 'analytics:view', description: 'View business intelligence analytics' }
      ];

      for (const p of permissions) {
        await client.query(`
          INSERT INTO permissions (module, action, slug, description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;
        `, [p.module, p.action, p.slug, p.description]);
      }

      // 2. Global System Roles
      console.log('🔹 Seeding Default System Roles...');
      const defaultRoles = [
        { code: 'OWNER', name: 'Pharmacy Owner', description: 'Full administrative access across all modules' },
        { code: 'ADMIN', name: 'Branch Admin', description: 'Management of store operations, inventory, and users' },
        { code: 'MANAGER', name: 'Store Manager', description: 'Supervises sales, stock, and staff' },
        { code: 'PHARMACIST', name: 'Registered Pharmacist', description: 'Prescription dispensing, batch management & sales' },
        { code: 'CASHIER', name: 'POS Cashier', description: 'Fast counter sales, cart checkout, and payments' },
        { code: 'ACCOUNTANT', name: 'Accountant', description: 'Double-entry accounting, ledgers, and financial reports' },
        { code: 'HR_MANAGER', name: 'HR Manager', description: 'Employee records, attendance, and payroll' },
        { code: 'WAREHOUSE_STAFF', name: 'Warehouse / Stock Keeper', description: 'Stock receiving, batch entry, transfers' },
        { code: 'DELIVERY_RIDER', name: 'Delivery Rider', description: 'Order pickups, delivery confirmations, COD' }
      ];

      for (const r of defaultRoles) {
        await client.query(`
          INSERT INTO roles (name, code, description, is_system_role)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (organization_id, code) DO NOTHING;
        `, [r.name, r.code, r.description]);
      }

      // Assign all permissions to OWNER role
      const ownerRoleRes = await client.query("SELECT id FROM roles WHERE code = 'OWNER' AND organization_id IS NULL");
      if (ownerRoleRes.rows.length > 0) {
        const ownerRoleId = ownerRoleRes.rows[0].id;
        await client.query(`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1, id FROM permissions
          ON CONFLICT DO NOTHING;
        `, [ownerRoleId]);
      }

      // 3. Demo Organization & Branches
      console.log('🔹 Seeding Demo Pharmacy Organization (MediCare Central)...');
      const orgRes = await client.query(`
        INSERT INTO organizations (
          name, slug, business_type, subscription_plan, owner_name, owner_email, owner_phone,
          trade_license_no, drug_license_no, currency, currency_symbol, address_city, enable_fefo, enable_online_store, enable_multi_branch
        ) VALUES (
          'MediCare Central Pharmacy', 'medicare-central', 'RETAIL_PHARMACY', 'PROFESSIONAL',
          'Dr. Farhan Ahmed', 'admin@medicare.com', '+8801711000111',
          'TRAD/DH/2026/0988', 'DRUG/DGDA/2026/4551', 'BDT', '৳', 'Dhaka', true, true, true
        )
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `);
      const orgId = orgRes.rows[0].id;

      // Main Branch
      const branchRes = await client.query(`
        INSERT INTO branches (
          organization_id, code, name, branch_type, phone, email, address_city, address_street, is_main_branch
        ) VALUES (
          $1, 'BR-MAIN', 'Dhanmondi Main Branch', 'MAIN_BRANCH', '+8801711000112', 'dhanmondi@medicare.com', 'Dhaka', 'House 42, Road 7, Dhanmondi', true
        )
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `, [orgId]);
      const branchId = branchRes.rows[0].id;

      // Central Warehouse
      const whRes = await client.query(`
        INSERT INTO warehouses (
          organization_id, branch_id, code, name, warehouse_type, is_default
        ) VALUES (
          $1, $2, 'WH-MAIN', 'Main Store Room', 'BRANCH_STORE', true
        )
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `, [orgId, branchId]);
      const warehouseId = whRes.rows[0].id;

      // 4. Default Users
      console.log('🔹 Seeding Default Admin & Cashier Users...');
      const passwordHash = await bcrypt.hash('Admin@123456', 10);
      
      const adminUserRes = await client.query(`
        INSERT INTO users (
          organization_id, default_branch_id, first_name, last_name, email, phone, password_hash, is_org_owner
        ) VALUES (
          $1, $2, 'Dr. Farhan', 'Ahmed', 'admin@medicare.com', '+8801711000111', $3, true
        )
        ON CONFLICT (organization_id, email) DO UPDATE SET first_name = EXCLUDED.first_name
        RETURNING id;
      `, [orgId, branchId, passwordHash]);
      const adminUserId = adminUserRes.rows[0].id;

      const cashierUserRes = await client.query(`
        INSERT INTO users (
          organization_id, default_branch_id, first_name, last_name, email, phone, password_hash, is_org_owner
        ) VALUES (
          $1, $2, 'Kazi', 'Rakib', 'cashier@medicare.com', '+8801711000113', $3, false
        )
        ON CONFLICT (organization_id, email) DO UPDATE SET first_name = EXCLUDED.first_name
        RETURNING id;
      `, [orgId, branchId, passwordHash]);
      const cashierUserId = cashierUserRes.rows[0].id;

      // Attach Owner Role
      if (ownerRoleRes.rows.length > 0) {
        await client.query(`
          INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;
        `, [adminUserId, ownerRoleRes.rows[0].id]);
      }

      // Attach Cashier Role
      const cashierRoleRes = await client.query("SELECT id FROM roles WHERE code = 'CASHIER' AND organization_id IS NULL");
      if (cashierRoleRes.rows.length > 0) {
        await client.query(`
          INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;
        `, [cashierUserId, cashierRoleRes.rows[0].id]);
      }

      // 5. Standard Dosage Forms & Units
      console.log('🔹 Seeding Dosage Forms & Units...');
      const dosageForms = [
        { name: 'Tablet', short_code: 'Tab' },
        { name: 'Capsule', short_code: 'Cap' },
        { name: 'Syrup', short_code: 'Syr' },
        { name: 'Oral Suspension', short_code: 'Susp' },
        { name: 'Injection', short_code: 'Inj' },
        { name: 'Eye/Ear Drops', short_code: 'Drops' },
        { name: 'Ointment/Cream', short_code: 'Oint' },
        { name: 'Inhaler/Rotacap', short_code: 'Inh' },
        { name: 'Suppository', short_code: 'Supp' }
      ];
      for (const df of dosageForms) {
        await client.query(`
          INSERT INTO dosage_forms (organization_id, name, short_code)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;
        `, [orgId, df.name, df.short_code]);
      }

      const units = [
        { name: 'Piece', short_code: 'Pcs' },
        { name: 'Strip', short_code: 'Strip' },
        { name: 'Box', short_code: 'Box' },
        { name: 'Bottle', short_code: 'Btl' },
        { name: 'Vial', short_code: 'Vial' },
        { name: 'Tube', short_code: 'Tube' },
        { name: 'Ampoule', short_code: 'Amp' }
      ];
      for (const u of units) {
        await client.query(`
          INSERT INTO units (organization_id, name, short_code)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;
        `, [orgId, u.name, u.short_code]);
      }

      // 6. Standard Generics
      console.log('🔹 Seeding Standard Generics...');
      const generics = [
        { name: 'Paracetamol', therapeutic_class: 'Analgesic & Antipyretic' },
        { name: 'Omeprazole', therapeutic_class: 'Proton Pump Inhibitor (PPI)' },
        { name: 'Esomeprazole', therapeutic_class: 'Proton Pump Inhibitor (PPI)' },
        { name: 'Azithromycin', therapeutic_class: 'Macrolide Antibiotic' },
        { name: 'Cefixime', therapeutic_class: 'Cephalosporin Antibiotic' },
        { name: 'Metformin Hydrochloride', therapeutic_class: 'Antidiabetic' },
        { name: 'Losartan Potassium', therapeutic_class: 'Antihypertensive' },
        { name: 'Rosuvastatin', therapeutic_class: 'Lipid-lowering Statin' },
        { name: 'Montelukast Sodium', therapeutic_class: 'Leukotriene Receptor Antagonist' },
        { name: 'Fexofenadine', therapeutic_class: 'Antihistamine' }
      ];
      for (const g of generics) {
        await client.query(`
          INSERT INTO generics (organization_id, name, therapeutic_class)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;
        `, [orgId, g.name, g.therapeutic_class]);
      }

      // 7. Standard Manufacturers
      console.log('🔹 Seeding Pharmaceutical Manufacturers...');
      const manufacturers = [
        { name: 'Square Pharmaceuticals Ltd.', code: 'SQUARE', phone: '+88028881234' },
        { name: 'Beximco Pharmaceuticals Ltd.', code: 'BEXIMCO', phone: '+88028885678' },
        { name: 'Incepta Pharmaceuticals Ltd.', code: 'INCEPTA', phone: '+88028889012' },
        { name: 'Renata Limited', code: 'RENATA', phone: '+88028883456' },
        { name: 'ACI Healthcare Ltd.', code: 'ACI', phone: '+88028887890' }
      ];
      for (const m of manufacturers) {
        await client.query(`
          INSERT INTO manufacturers (organization_id, name, code, phone)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (organization_id, name) DO NOTHING;
        `, [orgId, m.name, m.code, m.phone]);
      }

      // 8. Categories
      console.log('🔹 Seeding Product Categories...');
      const categories = [
        { name: 'Prescription Medicines', slug: 'prescription-medicines' },
        { name: 'OTC & General Care', slug: 'otc-general-care' },
        { name: 'Baby & Maternal Care', slug: 'baby-maternal-care' },
        { name: 'Personal Care & Hygiene', slug: 'personal-care' },
        { name: 'Medical Devices & Diagnostics', slug: 'medical-devices' }
      ];
      for (const c of categories) {
        await client.query(`
          INSERT INTO product_categories (organization_id, name, slug)
          VALUES ($1, $2, $3)
          ON CONFLICT (organization_id, slug) DO NOTHING;
        `, [orgId, c.name, c.slug]);
      }

      // 9. Standard Chart of Accounts
      console.log('🔹 Seeding Chart of Accounts...');
      const accounts = [
        { code: '1010', name: 'Cash in Hand (Counter)', type: 'ASSET', is_sys: true },
        { code: '1020', name: 'Bank Account - Main Operating', type: 'ASSET', is_sys: true },
        { code: '1030', name: 'bKash Merchant Account', type: 'ASSET', is_sys: true },
        { code: '1040', name: 'Nagad Merchant Account', type: 'ASSET', is_sys: true },
        { code: '1100', name: 'Accounts Receivable (Customer Dues)', type: 'ASSET', is_sys: true },
        { code: '1200', name: 'Pharmacy Medicine Inventory', type: 'ASSET', is_sys: true },
        { code: '2010', name: 'Accounts Payable (Supplier Dues)', type: 'LIABILITY', is_sys: true },
        { code: '2020', name: 'VAT / Tax Payable', type: 'LIABILITY', is_sys: true },
        { code: '3010', name: "Owner's Equity Capital", type: 'EQUITY', is_sys: true },
        { code: '4010', name: 'Pharmacy Sales Revenue', type: 'REVENUE', is_sys: true },
        { code: '4020', name: 'Online Store Sales Revenue', type: 'REVENUE', is_sys: true },
        { code: '5010', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', is_sys: true },
        { code: '6010', name: 'Store Rent Expense', type: 'EXPENSE', is_sys: false },
        { code: '6020', name: 'Employee Salaries & Wages', type: 'EXPENSE', is_sys: false },
        { code: '6030', name: 'Electricity & Utility Bills', type: 'EXPENSE', is_sys: false },
        { code: '6040', name: 'Delivery & Transport Expense', type: 'EXPENSE', is_sys: false }
      ];

      for (const a of accounts) {
        await client.query(`
          INSERT INTO chart_of_accounts (organization_id, account_code, account_name, account_type, is_system_account)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (organization_id, account_code) DO NOTHING;
        `, [orgId, a.code, a.name, a.type, a.is_sys]);
      }

      // 10. Sample Products, Batches & FEFO Stocks
      console.log('🔹 Seeding Sample Products, Batches & Stocks...');
      const squareRes = await client.query("SELECT id FROM manufacturers WHERE code = 'SQUARE' AND organization_id = $1", [orgId]);
      const paraGenericRes = await client.query("SELECT id FROM generics WHERE name = 'Paracetamol' AND organization_id = $1", [orgId]);
      const tabRes = await client.query("SELECT id FROM dosage_forms WHERE name = 'Tablet' AND organization_id = $1", [orgId]);
      const stripRes = await client.query("SELECT id FROM units WHERE short_code = 'Strip' AND organization_id = $1", [orgId]);

      if (squareRes.rows.length && paraGenericRes.rows.length) {
        const prodRes = await client.query(`
          INSERT INTO products (
            organization_id, manufacturer_id, generic_id, dosage_form_id, primary_unit_id,
            brand_name, generic_name, strength, sku, barcode, pack_size,
            mrp, selling_price, default_purchase_price, min_stock_alert_level
          ) VALUES (
            $1, $2, $3, $4, $5,
            'Napa Extra 500mg/65mg', 'Paracetamol + Caffeine', '500mg+65mg', 'SKU-NAPA-EXT', '8901234567890', '10x10 Tablets',
            30.00, 30.00, 24.00, 20.00
          )
          ON CONFLICT (organization_id, sku) DO UPDATE SET brand_name = EXCLUDED.brand_name
          RETURNING id;
        `, [orgId, squareRes.rows[0].id, paraGenericRes.rows[0].id, tabRes.rows[0]?.id, stripRes.rows[0]?.id]);
        const napaId = prodRes.rows[0].id;

        // Batch 1 (Expiring soon: 3 months from now)
        const batch1Res = await client.query(`
          INSERT INTO product_batches (
            organization_id, product_id, batch_number, mfg_date, expiry_date, purchase_price, mrp, selling_price
          ) VALUES (
            $1, $2, 'BTH-2026-A1', CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE + INTERVAL '90 days', 24.00, 30.00, 30.00
          )
          ON CONFLICT (organization_id, product_id, batch_number) DO UPDATE SET selling_price = EXCLUDED.selling_price
          RETURNING id;
        `, [orgId, napaId]);
        const batch1Id = batch1Res.rows[0].id;

        // Batch 2 (Expiring later: 18 months from now)
        const batch2Res = await client.query(`
          INSERT INTO product_batches (
            organization_id, product_id, batch_number, mfg_date, expiry_date, purchase_price, mrp, selling_price
          ) VALUES (
            $1, $2, 'BTH-2026-B2', CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE + INTERVAL '540 days', 24.00, 30.00, 30.00
          )
          ON CONFLICT (organization_id, product_id, batch_number) DO UPDATE SET selling_price = EXCLUDED.selling_price
          RETURNING id;
        `, [orgId, napaId]);
        const batch2Id = batch2Res.rows[0].id;

        // Stocks
        await client.query(`
          INSERT INTO stocks (
            organization_id, branch_id, warehouse_id, product_id, batch_id, quantity_available, rack_location
          ) VALUES 
            ($1, $2, $3, $4, $5, 50.00, 'Rack A-1'),
            ($1, $2, $3, $4, $6, 150.00, 'Rack A-2')
          ON CONFLICT (branch_id, warehouse_id, product_id, batch_id) 
          DO UPDATE SET quantity_available = EXCLUDED.quantity_available;
        `, [orgId, branchId, warehouseId, napaId, batch1Id, batch2Id]);
      }

      // 11. Sample Customer
      console.log('🔹 Seeding Sample Customers...');
      await client.query(`
        INSERT INTO customers (
          organization_id, customer_code, name, phone, email, address_city, customer_type, credit_limit, loyalty_points
        ) VALUES (
          $1, 'CUST-001', 'Arifur Rahman', '+8801811223344', 'arif@gmail.com', 'Dhaka', 'REGULAR', 5000.00, 120.00
        )
        ON CONFLICT (organization_id, phone) DO UPDATE SET name = EXCLUDED.name;
      `, [orgId]);

      // 12. Auto Website Default Storefront Setup
      console.log('🔹 Seeding Automatic Pharmacy Storefront...');
      await client.query(`
        INSERT INTO websites (
          organization_id, subdomain, site_title, tagline, primary_theme_color, secondary_theme_color,
          hero_headline, hero_description, contact_phone, contact_email, store_address, is_published
        ) VALUES (
          $1, 'medicare', 'MediCare Central Pharmacy', 'Your Trusted Health & Medicine Partner',
          '#059669', '#10B981',
          'Order Genuine Medicines Delivered to Your Doorstep',
          'Upload your prescription or search our wide catalog of 100% authentic medicines.',
          '+8801711000111', 'support@medicare.com', 'House 42, Road 7, Dhanmondi, Dhaka', true
        )
        ON CONFLICT (organization_id) DO UPDATE SET site_title = EXCLUDED.site_title;
      `, [orgId]);

      console.log('🎉 Database Seeding Complete!');
      console.log('----------------------------------------------------');
      console.log('🔑 Default Demo Credentials:');
      console.log('   Organization Slug: medicare-central');
      console.log('   Admin: admin@medicare.com   | Pass: Admin@123456');
      console.log('   Cashier: cashier@medicare.com | Pass: Admin@123456');
      console.log('----------------------------------------------------');
    });
  } catch (error) {
    console.error('❌ Seeding Failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();
