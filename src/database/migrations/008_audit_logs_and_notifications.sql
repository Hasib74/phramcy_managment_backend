-- ============================================================================
-- Migration 008: Audit Logs, Notifications, System Settings & FEFO Views
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE audit_action_enum AS ENUM (
        'LOGIN',
        'LOGOUT',
        'CREATE',
        'UPDATE',
        'DELETE',
        'VOID_SALE',
        'REFUND_SALE',
        'STOCK_ADJUSTMENT',
        'PRICE_CHANGE',
        'ROLE_CHANGE',
        'PASSWORD_RESET',
        'EXPORT_DATA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
        'LOW_STOCK_ALERT',
        'EXPIRY_WARNING_90_DAYS',
        'EXPIRY_WARNING_60_DAYS',
        'EXPIRY_WARNING_30_DAYS',
        'BATCH_EXPIRED',
        'CUSTOMER_DUE_REMINDER',
        'SUPPLIER_DUE_ALERT',
        'NEW_ONLINE_ORDER',
        'ORDER_STATUS_UPDATE',
        'ATTENDANCE_ANOMALY',
        'PAYROLL_GENERATED',
        'SYSTEM_ANNOUNCEMENT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_priority_enum AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Immutable System Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    action audit_action_enum NOT NULL,
    module VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    
    old_state JSONB,
    new_state JSONB,
    change_summary TEXT,
    
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- 2. Notifications Engine
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for all branch users
    
    notification_type notification_type_enum NOT NULL,
    priority notification_priority_enum NOT NULL DEFAULT 'NORMAL',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    action_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_org_user ON notifications(organization_id, user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- 3. Dynamic Organization Settings Key-Value Store
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    setting_group VARCHAR(100) NOT NULL DEFAULT 'GENERAL', -- 'GENERAL', 'POS', 'INVENTORY', 'INVOICE_PRINT', 'SMS', 'PAYMENT_GATEWAY'
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_settings_org_group_key UNIQUE (organization_id, setting_group, setting_key)
);

-- ============================================================================
-- HELPER VIEWS FOR REAL-TIME PHARMACY REPORTING & FEFO ENGINE
-- ============================================================================

-- A. FEFO Available Batches View (Prioritizes nearest expiry batches first for POS)
CREATE OR REPLACE VIEW v_fefo_available_batches AS
SELECT 
    s.organization_id,
    s.branch_id,
    s.warehouse_id,
    p.id AS product_id,
    p.brand_name,
    p.generic_name,
    p.sku,
    p.barcode AS product_barcode,
    b.id AS batch_id,
    b.batch_number,
    b.mfg_date,
    b.expiry_date,
    (b.expiry_date - CURRENT_DATE) AS days_until_expiry,
    b.purchase_price,
    b.mrp,
    b.selling_price,
    b.wholesale_price,
    s.quantity_available,
    s.quantity_reserved,
    (s.quantity_available - s.quantity_reserved) AS net_sellable_quantity,
    s.rack_location
FROM stocks s
JOIN products p ON s.product_id = p.id
JOIN product_batches b ON s.batch_id = b.id
WHERE s.quantity_available > 0
  AND b.is_active = true
  AND b.expiry_date >= CURRENT_DATE
ORDER BY b.expiry_date ASC;

-- B. Product Stock Summary View (Consolidated per branch)
CREATE OR REPLACE VIEW v_product_stock_summary AS
SELECT 
    p.organization_id,
    s.branch_id,
    p.id AS product_id,
    p.brand_name,
    p.generic_name,
    p.strength,
    p.sku,
    p.min_stock_alert_level,
    p.reorder_quantity,
    p.selling_price,
    SUM(s.quantity_available) AS total_quantity_available,
    SUM(s.quantity_reserved) AS total_quantity_reserved,
    SUM(s.quantity_damaged) AS total_quantity_damaged,
    SUM(s.quantity_expired) AS total_quantity_expired,
    CASE 
        WHEN SUM(s.quantity_available) <= 0 THEN 'OUT_OF_STOCK'
        WHEN SUM(s.quantity_available) <= p.min_stock_alert_level THEN 'LOW_STOCK'
        ELSE 'IN_STOCK'
    END AS stock_status
FROM products p
LEFT JOIN stocks s ON p.id = s.product_id
WHERE p.is_active = true
GROUP BY p.organization_id, s.branch_id, p.id, p.brand_name, p.generic_name, p.strength, p.sku, p.min_stock_alert_level, p.reorder_quantity, p.selling_price;

-- C. Expiring Batches Risk View (Near expiry 90 / 60 / 30 days exposure)
CREATE OR REPLACE VIEW v_expiring_batches_alert AS
SELECT 
    b.organization_id,
    s.branch_id,
    p.id AS product_id,
    p.brand_name,
    p.generic_name,
    b.id AS batch_id,
    b.batch_number,
    b.expiry_date,
    (b.expiry_date - CURRENT_DATE) AS days_remaining,
    s.quantity_available,
    (s.quantity_available * b.purchase_price) AS capital_at_risk,
    CASE 
        WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED'
        WHEN (b.expiry_date - CURRENT_DATE) <= 30 THEN 'EXPIRING_30_DAYS'
        WHEN (b.expiry_date - CURRENT_DATE) <= 60 THEN 'EXPIRING_60_DAYS'
        WHEN (b.expiry_date - CURRENT_DATE) <= 90 THEN 'EXPIRING_90_DAYS'
        ELSE 'SAFE'
    END AS expiry_urgency
FROM product_batches b
JOIN products p ON b.product_id = p.id
JOIN stocks s ON b.id = s.batch_id
WHERE s.quantity_available > 0
  AND (b.expiry_date - CURRENT_DATE) <= 90
ORDER BY b.expiry_date ASC;
