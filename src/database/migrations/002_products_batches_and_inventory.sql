-- ============================================================================
-- Migration 002: Products, Generics, Dosage Forms, Batches (FEFO), & Inventory Movements
-- ============================================================================

-- Movement Types ENUM
DO $$ BEGIN
    CREATE TYPE stock_movement_type_enum AS ENUM (
        'PURCHASE_IN',
        'PURCHASE_RETURN_OUT',
        'SALE_OUT',
        'SALE_RETURN_IN',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'ADJUSTMENT_ADD',
        'ADJUSTMENT_SUB',
        'DAMAGE_OUT',
        'EXPIRED_OUT',
        'INITIAL_STOCK'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transfer_status_enum AS ENUM (
        'DRAFT',
        'REQUESTED',
        'APPROVED',
        'DISPATCHED',
        'RECEIVED',
        'REJECTED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE adjustment_reason_enum AS ENUM (
        'PHYSICAL_COUNT_DISCREPANCY',
        'DAMAGED_IN_STORE',
        'EXPIRED_ON_SHELF',
        'STORAGE_SPOILAGE',
        'THEFT_LOSS',
        'DATA_CORRECTION',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Product Categories
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_org_slug UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_org ON product_categories(organization_id);

-- 2. Manufacturers / Pharmaceutical Companies
CREATE TABLE IF NOT EXISTS manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),
    contact_person VARCHAR(150),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    origin_country VARCHAR(100) DEFAULT 'Bangladesh',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_manufacturer_org_name UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_manufacturers_org ON manufacturers(organization_id);

-- 3. Generics (Chemical/Salt formulations)
CREATE TABLE IF NOT EXISTS generics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL for global pharma master
    name VARCHAR(255) NOT NULL,
    therapeutic_class VARCHAR(150),
    description TEXT,
    side_effects TEXT,
    precautions TEXT,
    contraindications TEXT,
    pregnancy_category VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_generics_org ON generics(organization_id);
CREATE INDEX IF NOT EXISTS idx_generics_name ON generics(name);

-- 4. Dosage Forms (Tablet, Capsule, Syrup, Drops, Injection, Ointment, etc.)
CREATE TABLE IF NOT EXISTS dosage_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    short_code VARCHAR(30),
    icon_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Measurement Units (Piece, Strip, Box, Bottle, Vial, Tube, etc.)
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    short_code VARCHAR(20) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Products Master
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    generic_id UUID REFERENCES generics(id) ON DELETE SET NULL,
    manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE SET NULL,
    dosage_form_id UUID REFERENCES dosage_forms(id) ON DELETE SET NULL,
    primary_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    
    brand_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    strength VARCHAR(100), -- e.g., 500mg, 10mg/5ml
    sku VARCHAR(100),
    barcode VARCHAR(100),
    pack_size VARCHAR(100), -- e.g., 10x10 Tablets
    pieces_per_pack INT DEFAULT 1,
    
    route_of_administration VARCHAR(100), -- Oral, Topical, IV, etc.
    requires_prescription BOOLEAN DEFAULT false,
    is_narcotic BOOLEAN DEFAULT false,
    is_cold_chain BOOLEAN DEFAULT false, -- Temperature sensitive
    ideal_temperature_range VARCHAR(50), -- e.g. 2°C - 8°C
    
    min_stock_alert_level DECIMAL(12, 3) DEFAULT 10,
    reorder_quantity DECIMAL(12, 3) DEFAULT 50,
    max_stock_level DECIMAL(12, 3) DEFAULT 1000,
    
    default_purchase_price DECIMAL(14, 4) DEFAULT 0.0000,
    mrp DECIMAL(14, 4) NOT NULL DEFAULT 0.0000, -- Maximum Retail Price
    selling_price DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    wholesale_price DECIMAL(14, 4) DEFAULT 0.0000,
    special_discount_percent DECIMAL(5, 2) DEFAULT 0.00,
    vat_percent DECIMAL(5, 2) DEFAULT 0.00,
    
    shelf_location VARCHAR(100), -- e.g., Rack A-3
    image_url TEXT,
    description TEXT,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_org_sku UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_name ON products(brand_name);
CREATE INDEX IF NOT EXISTS idx_products_generic_name ON products(generic_name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- 7. Product Packaging Units (e.g. 1 Box = 10 Strips = 100 Pieces)
CREATE TABLE IF NOT EXISTS product_packaging_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    conversion_multiplier DECIMAL(12, 4) NOT NULL DEFAULT 1.0000, -- Multiplier relative to primary unit
    barcode VARCHAR(100),
    selling_price DECIMAL(14, 4),
    wholesale_price DECIMAL(14, 4),
    is_base_unit BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Product Batches (FEFO & Expiry Engine)
CREATE TABLE IF NOT EXISTS product_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    mfg_date DATE,
    expiry_date DATE NOT NULL,
    purchase_price DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    mrp DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    selling_price DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    wholesale_price DECIMAL(14, 4) DEFAULT 0.0000,
    barcode VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_batch_org_product_number UNIQUE (organization_id, product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_org_product ON product_batches(organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry_date ON product_batches(expiry_date); -- Critical for FEFO sorting
CREATE INDEX IF NOT EXISTS idx_batches_batch_number ON product_batches(batch_number);

-- 9. Stocks (Per Branch / Warehouse Per Batch)
CREATE TABLE IF NOT EXISTS stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
    quantity_available DECIMAL(14, 3) NOT NULL DEFAULT 0.000,
    quantity_reserved DECIMAL(14, 3) NOT NULL DEFAULT 0.000, -- Reserved in pending online orders/transfers
    quantity_damaged DECIMAL(14, 3) NOT NULL DEFAULT 0.000,
    quantity_expired DECIMAL(14, 3) NOT NULL DEFAULT 0.000,
    rack_location VARCHAR(100),
    last_counted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stock_location_batch UNIQUE (branch_id, warehouse_id, product_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_stocks_org_branch ON stocks(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_stocks_product_batch ON stocks(product_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_stocks_warehouse ON stocks(warehouse_id);

-- 10. Immutable Stock Movements Ledger
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    movement_type stock_movement_type_enum NOT NULL,
    reference_type VARCHAR(100), -- 'PURCHASE', 'SALE', 'TRANSFER', 'ADJUSTMENT', 'RETURN'
    reference_id UUID,
    quantity DECIMAL(14, 3) NOT NULL, -- Positive for IN, Negative for OUT
    unit_cost DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    total_cost DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    balance_after DECIMAL(14, 3) NOT NULL,
    notes TEXT,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_product ON stock_movements(organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);

-- 11. Stock Transfers (Inter-Branch / Warehouse)
CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    from_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    from_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    to_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    status transfer_status_enum NOT NULL DEFAULT 'REQUESTED',
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    dispatched_by UUID REFERENCES users(id) ON DELETE SET NULL,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    dispatched_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_transfer_org_number UNIQUE (organization_id, transfer_number)
);

CREATE INDEX IF NOT EXISTS idx_transfers_org ON stock_transfers(organization_id);

-- 12. Stock Transfer Items
CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    quantity_requested DECIMAL(14, 3) NOT NULL,
    quantity_dispatched DECIMAL(14, 3) DEFAULT 0.000,
    quantity_received DECIMAL(14, 3) DEFAULT 0.000,
    unit_cost DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    notes TEXT
);

-- 13. Stock Adjustments
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    adjustment_number VARCHAR(100) NOT NULL,
    adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason adjustment_reason_enum NOT NULL DEFAULT 'PHYSICAL_COUNT_DISCREPANCY',
    notes TEXT,
    adjusted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_adjustment_org_number UNIQUE (organization_id, adjustment_number)
);

-- 14. Stock Adjustment Items
CREATE TABLE IF NOT EXISTS stock_adjustment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    previous_quantity DECIMAL(14, 3) NOT NULL,
    new_quantity DECIMAL(14, 3) NOT NULL,
    difference_quantity DECIMAL(14, 3) NOT NULL, -- (+/-)
    unit_cost DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    total_cost_impact DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    notes TEXT
);
