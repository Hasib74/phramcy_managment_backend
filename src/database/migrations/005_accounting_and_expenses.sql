-- ============================================================================
-- Migration 005: Accounting, Double-Entry General Ledger, Customer Due & Expenses
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE account_type_enum AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_status_enum AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    account_code VARCHAR(50) NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    account_type account_type_enum NOT NULL,
    parent_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    
    current_balance DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    is_system_account BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_org_code UNIQUE (organization_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_org ON chart_of_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON chart_of_accounts(account_type);

-- 2. Journal Entries (Double Entry Header)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    entry_number VARCHAR(100) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    reference_type VARCHAR(100), -- 'SALE', 'PURCHASE', 'PAYMENT', 'EXPENSE', 'MANUAL'
    reference_id UUID,
    reference_number VARCHAR(100),
    
    narration TEXT NOT NULL,
    total_debit DECIMAL(16, 2) NOT NULL,
    total_credit DECIMAL(16, 2) NOT NULL,
    is_posted BOOLEAN DEFAULT true,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_journal_org_number UNIQUE (organization_id, entry_number),
    CONSTRAINT chk_debit_equals_credit CHECK (total_debit = total_credit)
);

CREATE INDEX IF NOT EXISTS idx_journals_org ON journal_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_journals_date ON journal_entries(entry_date);

-- 3. Journal Entry Lines (Double Entry Details)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    
    debit_amount DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    credit_amount DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    memo TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_id);

-- 4. Customer Payments (Receivables Settlement)
CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    
    payment_number VARCHAR(100) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(14, 2) NOT NULL,
    payment_method payment_method_enum NOT NULL DEFAULT 'CASH',
    
    transaction_reference VARCHAR(150),
    notes TEXT,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_payment_org_no UNIQUE (organization_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);

-- 5. Customer Due Ledger
CREATE TABLE IF NOT EXISTS customer_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type ledger_entry_type_enum NOT NULL,
    
    reference_type VARCHAR(50), -- 'SALE_INVOICE', 'DUE_PAYMENT', 'SALE_RETURN'
    reference_id UUID,
    reference_number VARCHAR(100),
    
    debit_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,  -- Credit sale (increases customer receivable)
    credit_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00, -- Payment from customer (reduces receivable)
    running_balance DECIMAL(14, 2) NOT NULL,
    
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_ledgers_customer ON customer_ledgers(customer_id);

-- 6. Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50),
    account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    
    voucher_number VARCHAR(100) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title VARCHAR(255) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    vat_amount DECIMAL(14, 2) DEFAULT 0.00,
    total_amount DECIMAL(14, 2) NOT NULL,
    
    payment_method payment_method_enum NOT NULL DEFAULT 'CASH',
    payee_name VARCHAR(150),
    status expense_status_enum NOT NULL DEFAULT 'APPROVED',
    
    receipt_attachment_url TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurring_interval VARCHAR(50), -- 'MONTHLY', 'WEEKLY'
    
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_expense_org_voucher UNIQUE (organization_id, voucher_number)
);

CREATE INDEX IF NOT EXISTS idx_expenses_org_branch ON expenses(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

-- 8. Bank Accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    
    bank_name VARCHAR(150) NOT NULL,
    account_title VARCHAR(150) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    branch_name VARCHAR(100),
    routing_number VARCHAR(100),
    swift_code VARCHAR(50),
    current_balance DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Daily Closing Reports
CREATE TABLE IF NOT EXISTS daily_closing_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    closing_date DATE NOT NULL,
    
    total_sales_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_cash_sales DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_card_sales DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_mfs_sales DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_due_sales DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    total_due_collected DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_expenses DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_supplier_payments DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    opening_cash DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    expected_closing_cash DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    actual_closing_cash DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    cash_shortage_excess DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_daily_closing_org_branch_date UNIQUE (organization_id, branch_id, closing_date)
);
