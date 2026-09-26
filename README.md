# Pharmacy Business Operating System Backend & PostgreSQL Database

> **One Platform. Every Pharmacy.**  
> A multi-tenant SaaS Pharmacy Operating System backend built in **Node.js (TypeScript)** with a complete **PostgreSQL** schema covering POS, FEFO Batch Inventory, Purchases, Prescriptions, Accounting, HR/Payroll, Storefront CMS, and Real-time Reporting.

---

## 🏛️ System Architecture

```text
                                  ┌──────────────────────────┐
                                  │   Pharmacy Web / Apps    │
                                  └────────────┬─────────────┘
                                               │
               ┌───────────────────────────────▼───────────────────────────────┐
               │              Node.js + Express + TypeScript API               │
               │  [Auth/RBAC] [Products] [Inventory/FEFO] [Purchases] [POS]   │
               │      [Customers/CRM] [Accounting] [HR/Payroll] [Reports]      │
               └───────────────────────────────┬───────────────────────────────┘
                                               │
                                  ┌────────────▼─────────────┐
                                  │   PostgreSQL Database    │
                                  │   (Multi-tenant Isolated)│
                                  └──────────────────────────┘
```

---

## 📦 Database Schema Migrations

The database schemas are organized into modular, idempotent PostgreSQL migration files:

| Migration File | Description | Major Tables & Views |
| :--- | :--- | :--- |
| `001_core_tenancy_and_auth.sql` | Multi-Tenant Root & Granular RBAC | `organizations`, `branches`, `warehouses`, `pos_terminals`, `users`, `roles`, `permissions`, `user_roles`, `user_branch_access` |
| `002_products_batches_and_inventory.sql` | Products, Generics, Batches & Movements | `product_categories`, `manufacturers`, `generics`, `dosage_forms`, `units`, `products`, `product_batches`, `stocks`, `stock_movements`, `stock_transfers`, `stock_adjustments` |
| `003_suppliers_and_purchases.sql` | Procurement, Receiving & Payables | `suppliers`, `purchase_orders`, `purchases`, `purchase_items`, `supplier_payments`, `supplier_ledgers`, `purchase_returns` |
| `004_pos_sales_prescriptions_and_crm.sql` | POS Counter, Invoices & Prescriptions | `customers`, `prescriptions`, `prescription_items`, `pos_sessions`, `sales`, `sale_items`, `sale_payments`, `sale_returns`, `held_sales` |
| `005_accounting_and_expenses.sql` | Double-Entry Accounting & Ledgers | `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `customer_payments`, `customer_ledgers`, `expenses`, `daily_closing_reports` |
| `006_hr_attendance_and_payroll.sql` | HR, Shifts, Attendance & Payroll | `departments`, `designations`, `employees`, `shifts`, `attendance_records`, `leave_types`, `leave_applications`, `payroll_cycles`, `payroll_items` |
| `007_ecommerce_orders_and_delivery.sql` | Storefront CMS, Orders & Riders | `websites`, `coupons`, `delivery_zones`, `delivery_riders`, `online_orders`, `order_items`, `delivery_assignments`, `loyalty_transactions` |
| `008_audit_logs_and_notifications.sql` | Audit Trail, Alerts & FEFO Views | `audit_logs`, `notifications`, `system_settings`, `v_fefo_available_batches`, `v_product_stock_summary`, `v_expiring_batches_alert` |

---

## ⚡ Quickstart & Setup

### 1. Prerequisites
- Node.js >= 18
- PostgreSQL >= 14

### 2. Environment Configuration
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Ensure your PostgreSQL credentials (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) match your local or cloud database.

### 3. Run Database Migrations
Run the automated TypeScript migration runner to apply all 8 schema files:
```bash
npm run migrate
```

### 4. Seed Initial Pharmacy Master & Demo Data
Seed standard permissions, roles, dosage forms, generics, demo organization (`medicare-central`), branches, products, batches, and users:
```bash
npm run seed
```

### 5. Start Development Server
```bash
npm run dev
```
API server starts at: `http://localhost:5000`  
Health check endpoint: `http://localhost:5000/api/health`

---

## 🔑 Default Demo Credentials (Post-Seeding)

- **Organization Slug**: `medicare-central`
- **Owner / Admin User**: `admin@medicare.com` | Password: `Admin@123456`
- **POS Cashier User**: `cashier@medicare.com` | Password: `Admin@123456`

---

## 🚀 Key API Endpoints Reference

### Auth & Tenancy (`/api/v1/auth`)
- `POST /api/v1/auth/register` - Register a new SaaS pharmacy tenant & admin owner
- `POST /api/v1/auth/login` - Authenticate user & retrieve JWT access/refresh tokens
- `POST /api/v1/auth/refresh-token` - Refresh expired access token
- `GET /api/v1/auth/me` - Get authenticated user profile with roles & permissions

### Products Master (`/api/v1/products`)
- `GET /api/v1/products` - Search & filter product catalog with stock summaries
- `GET /api/v1/products/:id` - Get product details with active batches & stock breakdown
- `POST /api/v1/products` - Add new product
- `PUT /api/v1/products/:id` - Update existing product
- `GET /api/v1/products/categories` - Product categories list
- `GET /api/v1/products/generics` - Generics & chemical formulations list
- `GET /api/v1/products/manufacturers` - Pharma manufacturers list
- `GET /api/v1/products/metadata` - Dosage forms and units metadata

### Inventory & FEFO Engine (`/api/v1/inventory`)
- `GET /api/v1/inventory/stocks` - Real-time stock levels across branches & warehouses
- `GET /api/v1/inventory/fefo-recommendation?productId=...&quantity=...` - Compute First-Expiry First-Out batch allocation
- `GET /api/v1/inventory/expiring-batches?days=90` - Near-expiry stock risk exposure (30/60/90 days)
- `POST /api/v1/inventory/adjustments` - Stock adjustments (count discrepancy, damage, spoilage)
- `POST /api/v1/inventory/transfers` - Request inter-branch stock transfers
- `PATCH /api/v1/inventory/transfers/:id/status` - Dispatch or receive transfers

### Procurement & Purchases (`/api/v1/purchases`)
- `GET /api/v1/purchases/suppliers` - List suppliers with dues & credit limits
- `POST /api/v1/purchases/suppliers` - Create new supplier
- `GET /api/v1/purchases/suppliers/:supplierId/ledger` - Supplier debit/credit ledger history
- `POST /api/v1/purchases/invoices` - Ingest purchase invoice, create/update batches & log stock movements

### POS & Fast Counter Sales (`/api/v1/pos`)
- `GET /api/v1/pos/search?q=...` - Fast barcode / SKU / generic / brand search with batch expiry
- `POST /api/v1/pos/sessions/open` - Open cashier cash register session
- `POST /api/v1/pos/sessions/:sessionId/close` - Close cash register with cash count & reconciliation
- `POST /api/v1/pos/checkout` - Complete sale with automatic FEFO stock deduction & split payment
- `POST /api/v1/pos/hold` - Hold current cart
- `GET /api/v1/pos/held` - Retrieve held sales
- `DELETE /api/v1/pos/held/:holdId` - Resume or discard held cart

### Customer CRM & Receivables (`/api/v1/customers`)
- `GET /api/v1/customers` - List customer CRM profiles with dues & loyalty points
- `POST /api/v1/customers` - Create customer
- `POST /api/v1/customers/due-payments` - Record customer due collection payment
- `GET /api/v1/customers/:id/ledger` - Customer receivables ledger history

### Accounting & Finance (`/api/v1/accounting`)
- `GET /api/v1/accounting/chart-of-accounts` - Chart of accounts (Assets, Liabilities, Equity, Revenue, Expenses)
- `POST /api/v1/accounting/journal-entries` - Double-entry journal entries
- `GET /api/v1/accounting/expenses` - List expense vouchers
- `POST /api/v1/accounting/expenses` - Record expense voucher
- `GET /api/v1/accounting/daily-closing` - Daily register closing report

### Executive Reports & Analytics (`/api/v1/reports`)
- `GET /api/v1/reports/dashboard-overview` - Today's sales, gross/net profits, expenses, dues, 7-day trend, top medicines

---

## 🛡️ Built-in Quality & Security

- **Data Isolation**: Multi-tenant database partitioning scoped by `organization_id`
- **Granular RBAC**: Role-based access control with module permissions
- **FEFO Engine**: Automated batch dispatching to minimize expired medicine wastage
- **Double-Entry Financials**: Enforced debit = credit balance checks
- **Audit Trails**: Immutable stock movements and system audit logs
