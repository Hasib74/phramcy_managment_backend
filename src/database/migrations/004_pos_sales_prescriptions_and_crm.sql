-- ============================================================================
-- Migration 004: POS, Sales Invoicing, Split Payments, Prescriptions & Customer CRM
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE customer_type_enum AS ENUM ('RETAIL', 'WHOLESALE', 'VIP', 'CHRONIC_PATIENT', 'CORPORATE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE prescription_status_enum AS ENUM ('PENDING_REVIEW', 'APPROVED', 'DISPENSED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sale_status_enum AS ENUM ('COMPLETED', 'ON_HOLD', 'VOIDED', 'REFUNDED', 'PARTIALLY_REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sale_type_enum AS ENUM ('POS_RETAIL', 'POS_WHOLESALE', 'ONLINE_STORE', 'PRESCRIPTION_ORDER', 'SAMPLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE discount_type_enum AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Customers Master
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_code VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    gender VARCHAR(20),
    date_of_birth DATE,
    blood_group VARCHAR(10),
    address_street TEXT,
    address_city VARCHAR(100),
    customer_type customer_type_enum NOT NULL DEFAULT 'RETAIL',
    
    credit_limit DECIMAL(14, 2) DEFAULT 0.00,
    current_due DECIMAL(14, 2) DEFAULT 0.00,
    opening_due DECIMAL(14, 2) DEFAULT 0.00,
    loyalty_points DECIMAL(10, 2) DEFAULT 0.00,
    
    allergies TEXT,
    chronic_conditions TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_org_phone UNIQUE (organization_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- 2. Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    
    doctor_name VARCHAR(150),
    doctor_reg_no VARCHAR(100),
    hospital_name VARCHAR(200),
    prescription_date DATE DEFAULT CURRENT_DATE,
    
    prescription_file_url TEXT,
    diagnosis TEXT,
    status prescription_status_enum NOT NULL DEFAULT 'PENDING_REVIEW',
    pharmacist_notes TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_org ON prescriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id);

-- 3. Prescription Line Items
CREATE TABLE IF NOT EXISTS prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    medicine_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100), -- e.g. 1+0+1
    frequency VARCHAR(100), -- e.g. After meal
    duration_days INT,
    total_quantity_suggested DECIMAL(10, 2),
    is_dispensed BOOLEAN DEFAULT false,
    dispensed_quantity DECIMAL(10, 2) DEFAULT 0.00,
    instructions TEXT
);

-- 4. POS Sessions / Cash Registers
CREATE TABLE IF NOT EXISTS pos_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    terminal_id UUID REFERENCES pos_terminals(id) ON DELETE SET NULL,
    cashier_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    opening_cash_balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    total_cash_sales DECIMAL(14, 2) DEFAULT 0.00,
    total_card_sales DECIMAL(14, 2) DEFAULT 0.00,
    total_mfs_sales DECIMAL(14, 2) DEFAULT 0.00,
    total_credit_sales DECIMAL(14, 2) DEFAULT 0.00,
    total_sales_amount DECIMAL(14, 2) DEFAULT 0.00,
    total_cash_refunds DECIMAL(14, 2) DEFAULT 0.00,
    
    closing_cash_counted DECIMAL(14, 2),
    expected_cash_balance DECIMAL(14, 2),
    cash_discrepancy DECIMAL(14, 2) DEFAULT 0.00,
    
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_org ON pos_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_user ON pos_sessions(cashier_user_id);

-- 5. Sales Master Table
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    pos_session_id UUID REFERENCES pos_sessions(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    
    invoice_number VARCHAR(100) NOT NULL,
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sale_type sale_type_enum NOT NULL DEFAULT 'POS_RETAIL',
    
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    discount_type discount_type_enum DEFAULT 'FIXED_AMOUNT',
    discount_rate DECIMAL(5, 2) DEFAULT 0.00,
    discount_amount DECIMAL(14, 2) DEFAULT 0.00,
    vat_amount DECIMAL(14, 2) DEFAULT 0.00,
    round_off DECIMAL(6, 2) DEFAULT 0.00,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    paid_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    due_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    change_returned DECIMAL(14, 2) DEFAULT 0.00,
    
    payment_status payment_status_enum NOT NULL DEFAULT 'PAID',
    status sale_status_enum NOT NULL DEFAULT 'COMPLETED',
    
    is_offline_sync BOOLEAN DEFAULT false,
    client_offline_id VARCHAR(100),
    cashier_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sale_org_invoice UNIQUE (organization_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_org_branch ON sales(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

-- 6. Sale Items (FEFO batch linked)
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    
    quantity DECIMAL(14, 3) NOT NULL,
    unit_price DECIMAL(14, 4) NOT NULL, -- Retail/Wholesale price charged
    unit_cost DECIMAL(14, 4) NOT NULL DEFAULT 0.0000, -- Batch cost for COGS & Gross Profit calculation
    
    discount_amount DECIMAL(14, 4) DEFAULT 0.0000,
    vat_percent DECIMAL(5, 2) DEFAULT 0.00,
    vat_amount DECIMAL(14, 4) DEFAULT 0.0000,
    total_price DECIMAL(14, 4) NOT NULL,
    gross_profit DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_batch ON sale_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- 7. Sale Payments (Split Payment Support)
CREATE TABLE IF NOT EXISTS sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payment_method payment_method_enum NOT NULL DEFAULT 'CASH',
    amount DECIMAL(14, 2) NOT NULL,
    
    transaction_reference VARCHAR(150),
    card_last_four VARCHAR(10),
    card_type VARCHAR(50),
    mobile_account_number VARCHAR(50),
    payment_gateway_response JSONB,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

-- 8. Sale Returns & Refunds
CREATE TABLE IF NOT EXISTS sale_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    
    return_invoice_number VARCHAR(100) NOT NULL,
    return_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    vat_amount DECIMAL(14, 2) DEFAULT 0.00,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    refund_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    refund_method payment_method_enum DEFAULT 'CASH',
    
    is_restocked BOOLEAN DEFAULT true,
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sale_return_org_invoice UNIQUE (organization_id, return_invoice_number)
);

-- 9. Sale Return Items
CREATE TABLE IF NOT EXISTS sale_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    sale_item_id UUID REFERENCES sale_items(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    
    quantity DECIMAL(14, 3) NOT NULL,
    unit_price DECIMAL(14, 4) NOT NULL,
    refund_amount DECIMAL(14, 4) NOT NULL,
    condition VARCHAR(50) DEFAULT 'GOOD', -- 'GOOD' (can restock), 'DAMAGED', 'EXPIRED'
    reason TEXT
);

-- 10. POS Held Sales (For quick hold & resume)
CREATE TABLE IF NOT EXISTS held_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    cashier_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hold_reference VARCHAR(100) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    cart_items JSONB NOT NULL,
    held_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
