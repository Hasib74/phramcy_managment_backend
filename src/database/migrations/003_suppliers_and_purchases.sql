-- ============================================================================
-- Migration 003: Suppliers, Purchase Orders, Receiving, Batches Entry & Payables
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE po_status_enum AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_enum AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MFS_BKASH', 'MFS_NAGAD', 'MFS_ROCKET', 'CREDIT_ACCOUNT', 'ONLINE_GATEWAY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ledger_entry_type_enum AS ENUM ('OPENING_BALANCE', 'PURCHASE_INVOICE', 'PAYMENT', 'PURCHASE_RETURN', 'ADJUSTMENT_DEBIT', 'ADJUSTMENT_CREDIT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Suppliers Master
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    address_street TEXT,
    address_city VARCHAR(100),
    address_country VARCHAR(100) DEFAULT 'Bangladesh',
    trade_license_no VARCHAR(100),
    tax_id_no VARCHAR(100),
    drug_license_no VARCHAR(100),
    payment_terms_days INT DEFAULT 30,
    credit_limit DECIMAL(14, 2) DEFAULT 0.00,
    opening_balance DECIMAL(14, 2) DEFAULT 0.00,
    current_balance DECIMAL(14, 2) DEFAULT 0.00, -- Positive means pharmacy owes supplier
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_supplier_org_company UNIQUE (organization_id, company_name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);

-- 2. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number VARCHAR(100) NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    status po_status_enum NOT NULL DEFAULT 'DRAFT',
    total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_po_org_number UNIQUE (organization_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_org ON purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);

-- 3. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    quantity_ordered DECIMAL(14, 3) NOT NULL,
    quantity_received DECIMAL(14, 3) DEFAULT 0.000,
    estimated_unit_cost DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    total_cost DECIMAL(14, 4) NOT NULL DEFAULT 0.0000
);

-- 4. Purchases (Goods Receiving & Supplier Invoices)
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    
    invoice_number VARCHAR(100) NOT NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(14, 2) DEFAULT 0.00,
    vat_amount DECIMAL(14, 2) DEFAULT 0.00,
    shipping_cost DECIMAL(14, 2) DEFAULT 0.00,
    other_charges DECIMAL(14, 2) DEFAULT 0.00,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    due_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    payment_status payment_status_enum NOT NULL DEFAULT 'UNPAID',
    
    invoice_document_url TEXT,
    notes TEXT,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_purchase_org_invoice UNIQUE (organization_id, supplier_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_purchases_org ON purchases(organization_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);

-- 5. Purchase Items & Batches Integration
CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
    
    batch_number VARCHAR(100) NOT NULL,
    mfg_date DATE,
    expiry_date DATE NOT NULL,
    
    quantity DECIMAL(14, 3) NOT NULL,
    free_quantity DECIMAL(14, 3) DEFAULT 0.000, -- Free samples/bonus stock
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    
    unit_purchase_cost DECIMAL(14, 4) NOT NULL,
    mrp DECIMAL(14, 4) NOT NULL,
    selling_price DECIMAL(14, 4) NOT NULL,
    wholesale_price DECIMAL(14, 4) DEFAULT 0.0000,
    
    discount_percent DECIMAL(5, 2) DEFAULT 0.00,
    discount_amount DECIMAL(14, 4) DEFAULT 0.0000,
    vat_percent DECIMAL(5, 2) DEFAULT 0.00,
    vat_amount DECIMAL(14, 4) DEFAULT 0.0000,
    
    subtotal DECIMAL(14, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_batch ON purchase_items(batch_id);

-- 6. Supplier Payments
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
    
    payment_number VARCHAR(100) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(14, 2) NOT NULL,
    payment_method payment_method_enum NOT NULL DEFAULT 'CASH',
    
    bank_name VARCHAR(150),
    cheque_number VARCHAR(100),
    cheque_date DATE,
    transaction_reference VARCHAR(150),
    receipt_attachment_url TEXT,
    notes TEXT,
    paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_supplier_payment_org_no UNIQUE (organization_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_org ON supplier_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);

-- 7. Supplier Ledger
CREATE TABLE IF NOT EXISTS supplier_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type ledger_entry_type_enum NOT NULL,
    reference_type VARCHAR(50), -- 'PURCHASE', 'PAYMENT', 'RETURN'
    reference_id UUID,
    reference_number VARCHAR(100),
    
    debit_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,  -- Payment made to supplier (reduces liability)
    credit_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00, -- Goods purchased on credit (increases liability)
    running_balance DECIMAL(14, 2) NOT NULL,
    
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledgers_supplier ON supplier_ledgers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledgers_date ON supplier_ledgers(entry_date);

-- 8. Purchase Returns
CREATE TABLE IF NOT EXISTS purchase_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
    
    return_number VARCHAR(100) NOT NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
    
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    vat_amount DECIMAL(14, 2) DEFAULT 0.00,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    refund_status VARCHAR(50) DEFAULT 'ADJUSTED_TO_LEDGER', -- 'CASH_REFUND', 'ADJUSTED_TO_LEDGER'
    
    returned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_purchase_return_org_no UNIQUE (organization_id, return_number)
);

-- 9. Purchase Return Items
CREATE TABLE IF NOT EXISTS purchase_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    quantity DECIMAL(14, 3) NOT NULL,
    unit_cost DECIMAL(14, 4) NOT NULL,
    subtotal DECIMAL(14, 4) NOT NULL,
    reason TEXT
);
