-- ============================================================================
-- Migration 006: Human Resources, Shifts, Attendance, Leaves & Payroll Management
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE employment_status_enum AS ENUM ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE attendance_status_enum AS ENUM ('PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE leave_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payroll_status_enum AS ENUM ('DRAFT', 'PROCESSING', 'APPROVED', 'PAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Departments
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dept_org_name UNIQUE (organization_id, name)
);

-- 2. Designations / Job Titles
CREATE TABLE IF NOT EXISTS designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_desig_org_name UNIQUE (organization_id, name)
);

-- 3. Shifts
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    late_grace_minutes INT DEFAULT 15,
    half_day_threshold_minutes INT DEFAULT 240,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Employees Master
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    designation_id UUID REFERENCES designations(id) ON DELETE SET NULL,
    default_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    
    employee_code VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    national_id VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    
    present_address TEXT,
    permanent_address TEXT,
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(50),
    
    joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
    resignation_date DATE,
    employment_status employment_status_enum NOT NULL DEFAULT 'ACTIVE',
    
    -- Salary Breakdown
    basic_salary DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    house_rent_allowance DECIMAL(14, 2) DEFAULT 0.00,
    medical_allowance DECIMAL(14, 2) DEFAULT 0.00,
    transport_allowance DECIMAL(14, 2) DEFAULT 0.00,
    other_allowance DECIMAL(14, 2) DEFAULT 0.00,
    gross_salary DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    -- Bank / Payout details
    bank_name VARCHAR(150),
    bank_account_name VARCHAR(150),
    bank_account_number VARCHAR(100),
    mobile_banking_number VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_emp_org_code UNIQUE (organization_id, employee_code)
);

CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_phone ON employees(phone);

-- 5. Attendance Records
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_time TIMESTAMP WITH TIME ZONE,
    check_out_time TIMESTAMP WITH TIME ZONE,
    
    status attendance_status_enum NOT NULL DEFAULT 'PRESENT',
    late_minutes INT DEFAULT 0,
    early_leaving_minutes INT DEFAULT 0,
    overtime_minutes INT DEFAULT 0,
    total_working_hours DECIMAL(5, 2) DEFAULT 0.00,
    
    verification_method VARCHAR(50) DEFAULT 'MANUAL', -- 'MANUAL', 'QR_CODE', 'BIOMETRIC', 'GPS'
    notes TEXT,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_attendance_emp_date UNIQUE (employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_org_date ON attendance_records(organization_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);

-- 6. Leave Types & Policies
CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Casual, Sick, Annual, Maternity
    days_allowed_per_year INT NOT NULL DEFAULT 14,
    is_paid BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Leave Applications
CREATE TABLE IF NOT EXISTS leave_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL(4, 1) NOT NULL,
    reason TEXT NOT NULL,
    
    status leave_status_enum NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Payroll Cycles (Monthly Batches)
CREATE TABLE IF NOT EXISTS payroll_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    month INT NOT NULL, -- 1 to 12
    year INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    total_gross_amount DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    total_deductions_amount DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    total_net_amount DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    status payroll_status_enum NOT NULL DEFAULT 'DRAFT',
    
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payroll_org_month_year UNIQUE (organization_id, month, year)
);

-- 9. Payroll Items (Per-Employee Payslips)
CREATE TABLE IF NOT EXISTS payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_cycle_id UUID NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    basic_salary DECIMAL(14, 2) NOT NULL,
    allowances_total DECIMAL(14, 2) DEFAULT 0.00,
    overtime_amount DECIMAL(14, 2) DEFAULT 0.00,
    bonus_amount DECIMAL(14, 2) DEFAULT 0.00,
    gross_earnings DECIMAL(14, 2) NOT NULL,
    
    absence_deduction DECIMAL(14, 2) DEFAULT 0.00,
    advance_salary_deduction DECIMAL(14, 2) DEFAULT 0.00,
    tax_deduction DECIMAL(14, 2) DEFAULT 0.00,
    other_deductions DECIMAL(14, 2) DEFAULT 0.00,
    total_deductions DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    
    net_payable DECIMAL(14, 2) NOT NULL,
    payment_status payment_status_enum NOT NULL DEFAULT 'UNPAID',
    payment_date DATE,
    payment_method payment_method_enum,
    payment_reference VARCHAR(150),
    payslip_document_url TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_cycle ON payroll_items(payroll_cycle_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id);
