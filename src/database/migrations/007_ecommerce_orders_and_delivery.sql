-- ============================================================================
-- Migration 007: Automatic Website CMS, Online Orders, Delivery & Loyalty Engine
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
        'PENDING',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'ASSIGNED_TO_RIDER',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'RETURNED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE delivery_status_enum AS ENUM (
        'PENDING',
        'ASSIGNED',
        'ACCEPTED',
        'PICKED_UP',
        'IN_TRANSIT',
        'DELIVERED',
        'FAILED_ATTEMPT',
        'RETURNED_TO_BRANCH'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE rider_status_enum AS ENUM ('AVAILABLE', 'ON_DELIVERY', 'OFF_DUTY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Pharmacy Web Storefronts (Automatic Website Builder)
CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subdomain VARCHAR(100) UNIQUE NOT NULL, -- e.g. greenpharma.platform.com
    custom_domain VARCHAR(255) UNIQUE,     -- e.g. www.greenpharmabd.com
    
    site_title VARCHAR(200) NOT NULL,
    tagline VARCHAR(255),
    logo_url TEXT,
    favicon_url TEXT,
    primary_theme_color VARCHAR(20) DEFAULT '#059669',
    secondary_theme_color VARCHAR(20) DEFAULT '#10B981',
    
    hero_headline VARCHAR(255),
    hero_description TEXT,
    banner_images JSONB DEFAULT '[]'::jsonb,
    featured_categories JSONB DEFAULT '[]'::jsonb,
    
    about_us_html TEXT,
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    store_address TEXT,
    google_maps_embed_url TEXT,
    business_hours JSONB DEFAULT '{}'::jsonb,
    social_links JSONB DEFAULT '{}'::jsonb,
    
    seo_meta_title VARCHAR(200),
    seo_meta_description TEXT,
    seo_keywords TEXT,
    
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_website_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_websites_subdomain ON websites(subdomain);
CREATE INDEX IF NOT EXISTS idx_websites_custom_domain ON websites(custom_domain);

-- 2. Coupons & Marketing Campaigns
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    discount_type discount_type_enum NOT NULL DEFAULT 'PERCENTAGE',
    discount_value DECIMAL(10, 2) NOT NULL,
    min_order_amount DECIMAL(14, 2) DEFAULT 0.00,
    max_discount_amount DECIMAL(14, 2),
    
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    usage_limit_total INT DEFAULT 1000,
    usage_limit_per_customer INT DEFAULT 1,
    times_used INT DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_coupon_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_org_code ON coupons(organization_id, code);

-- 3. Delivery Zones
CREATE TABLE IF NOT EXISTS delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    zone_name VARCHAR(150) NOT NULL,
    postal_codes TEXT,
    delivery_charge DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
    min_order_free_delivery DECIMAL(10, 2),
    estimated_delivery_hours DECIMAL(4, 1) DEFAULT 2.0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Delivery Riders
CREATE TABLE IF NOT EXISTS delivery_riders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    vehicle_type VARCHAR(50) DEFAULT 'MOTORCYCLE', -- Bicycle, Motorcycle, Van, Foot
    vehicle_reg_number VARCHAR(50),
    driving_license_number VARCHAR(50),
    current_status rider_status_enum NOT NULL DEFAULT 'AVAILABLE',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Online Orders (From Web & Mobile Apps)
CREATE TABLE IF NOT EXISTS online_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    
    order_number VARCHAR(100) NOT NULL,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    recipient_name VARCHAR(150) NOT NULL,
    recipient_phone VARCHAR(50) NOT NULL,
    delivery_address_street TEXT NOT NULL,
    delivery_address_city VARCHAR(100),
    delivery_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
    
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(14, 2) DEFAULT 0.00,
    coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
    delivery_fee DECIMAL(14, 2) DEFAULT 0.00,
    vat_amount DECIMAL(14, 2) DEFAULT 0.00,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    payment_method VARCHAR(50) NOT NULL DEFAULT 'COD', -- 'COD', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'STRIPE'
    payment_status payment_status_enum NOT NULL DEFAULT 'UNPAID',
    payment_transaction_id VARCHAR(150),
    
    order_status order_status_enum NOT NULL DEFAULT 'PENDING',
    customer_notes TEXT,
    cancellation_reason TEXT,
    
    estimated_delivery_time TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_online_order_org_number UNIQUE (organization_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_online_orders_org ON online_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_online_orders_number ON online_orders(order_number);

-- 6. Online Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
    
    quantity DECIMAL(14, 3) NOT NULL,
    unit_price DECIMAL(14, 4) NOT NULL,
    discount_amount DECIMAL(14, 4) DEFAULT 0.0000,
    total_price DECIMAL(14, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 7. Order Status Timeline Audit
CREATE TABLE IF NOT EXISTS order_status_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
    status order_status_enum NOT NULL,
    remarks TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Delivery Assignments
CREATE TABLE IF NOT EXISTS delivery_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES delivery_riders(id) ON DELETE RESTRICT,
    status delivery_status_enum NOT NULL DEFAULT 'ASSIGNED',
    
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    
    cod_amount_collected DECIMAL(14, 2) DEFAULT 0.00,
    cod_settled_with_branch BOOLEAN DEFAULT false,
    failure_reason TEXT,
    customer_signature_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_rider ON delivery_assignments(rider_id);

-- 9. Loyalty Points Ledger
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'EARNED_ON_PURCHASE', 'REDEEMED_ON_POS', 'EXPIRED', 'MANUAL_ADJUST'
    points DECIMAL(10, 2) NOT NULL, -- Positive for earned, Negative for redeemed
    balance_after DECIMAL(10, 2) NOT NULL,
    reference_type VARCHAR(50), -- 'SALE', 'ORDER'
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id);
