-- ============================================================================
-- Migration 001: Core Tenancy, Organizations, Branches, Warehouses & RBAC Auth
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM Types
DO $$ BEGIN
    CREATE TYPE subscription_plan_enum AS ENUM ('FREE', 'STARTER', 'BUSINESS', 'PROFESSIONAL', 'ENTERPRISE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE business_type_enum AS ENUM ('SMALL_PHARMACY', 'RETAIL_PHARMACY', 'WHOLESALE_PHARMACY', 'PHARMACY_ONLINE', 'PHARMACY_CHAIN', 'ENTERPRISE_GROUP');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE branch_type_enum AS ENUM ('MAIN_BRANCH', 'SUB_BRANCH', 'RETAIL_OUTLET', 'WHOLESALE_DEPOT', 'ONLINE_FULFILLMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE warehouse_type_enum AS ENUM ('CENTRAL_WAREHOUSE', 'BRANCH_STORE', 'QUARANTINE_AREA', 'COLD_ROOM', 'DAMAGED_RETURN_HOLD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Organizations (Multi-tenant Root)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    business_type business_type_enum NOT NULL DEFAULT 'RETAIL_PHARMACY',
    subscription_plan subscription_plan_enum NOT NULL DEFAULT 'STARTER',
    owner_name VARCHAR(150),
    owner_email VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50) NOT NULL,
    logo_url TEXT,
    trade_license_no VARCHAR(100),
    drug_license_no VARCHAR(100),
    tax_identification_no VARCHAR(100),
    vat_registration_no VARCHAR(100),
    currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
    currency_symbol VARCHAR(10) NOT NULL DEFAULT '৳',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Dhaka',
    address_street TEXT,
    address_city VARCHAR(100),
    address_state VARCHAR(100),
    address_postal_code VARCHAR(20),
    address_country VARCHAR(100) DEFAULT 'Bangladesh',
    default_vat_rate DECIMAL(5, 2) DEFAULT 0.00,
    enable_fefo BOOLEAN DEFAULT true,
    enable_prescription_check BOOLEAN DEFAULT true,
    enable_loyalty_program BOOLEAN DEFAULT false,
    enable_online_store BOOLEAN DEFAULT false,
    enable_multi_branch BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_email ON organizations(owner_email);

-- 2. Branches
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    branch_type branch_type_enum NOT NULL DEFAULT 'RETAIL_OUTLET',
    phone VARCHAR(50),
    email VARCHAR(255),
    address_street TEXT,
    address_city VARCHAR(100),
    address_state VARCHAR(100),
    address_postal_code VARCHAR(20),
    address_country VARCHAR(100) DEFAULT 'Bangladesh',
    is_main_branch BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    pos_invoice_prefix VARCHAR(20) DEFAULT 'INV',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_branch_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(organization_id);

-- 3. Warehouses / Storage Locations
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    warehouse_type warehouse_type_enum NOT NULL DEFAULT 'BRANCH_STORE',
    location_description TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_warehouse_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_warehouses_org ON warehouses(organization_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_branch ON warehouses(branch_id);

-- 4. POS Terminals / Counters
CREATE TABLE IF NOT EXISTS pos_terminals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    terminal_code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    hardware_identifier VARCHAR(255),
    ip_address VARCHAR(45),
    is_active BOOLEAN DEFAULT true,
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_terminal_branch_code UNIQUE (branch_id, terminal_code)
);

-- 5. Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permissions_slug ON permissions(slug);

-- 6. Roles
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL for system-wide defaults
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_role_org_code UNIQUE (organization_id, code)
);

-- 7. Role Permissions Mapping
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 8. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    default_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    status user_status_enum NOT NULL DEFAULT 'ACTIVE',
    is_super_admin BOOLEAN DEFAULT false,
    is_org_owner BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_email_per_org UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- 9. User Roles Mapping
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 10. User Branch Access (For multi-branch staff)
CREATE TABLE IF NOT EXISTS user_branch_access (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    PRIMARY KEY (user_id, branch_id)
);
