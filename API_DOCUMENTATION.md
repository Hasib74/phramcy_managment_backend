# 📖 Pharmacy Business Operating System — Complete API Documentation

> **Base URL**: `https://phramcy-managment-backend.onrender.com/api/v1`  
> **Health Check**: `https://phramcy-managment-backend.onrender.com/api/health`  
> **Authentication**: Bearer Token (`Authorization: Bearer <JWT_ACCESS_TOKEN>`)  
> **Multi-Branch Context Header**: `x-branch-id: <BRANCH_UUID>`  
> **Correlation Tracking Header**: `X-Correlation-ID: <UUID>` (Optional, auto-generated)

---

## 📑 Complete API Directory

1. [Authentication & Tenancy](#1-authentication--tenancy)
2. [Organizations, Branches & Users](#2-organizations-branches--users)
3. [Product Catalog Master](#3-product-catalog-master)
4. [Inventory & FEFO Batch Engine](#4-inventory--fefo-batch-engine)
5. [POS & Counter Sales](#5-pos--counter-sales)
6. [Prescriptions Management](#6-prescriptions-management)
7. [Procurement & Purchases](#7-procurement--purchases)
8. [Customer CRM & Dues](#8-customer-crm--dues)
9. [Accounting, Finance & Expenses](#9-accounting-finance--expenses)
10. [HR, Attendance & Payroll](#10-hr-attendance--payroll)
11. [Ecommerce Orders & Delivery](#11-ecommerce-orders--delivery)
12. [Notifications & Audit Logs](#12-notifications--audit-logs)
13. [Executive Reports & BI Analytics](#13-executive-reports--bi-analytics)
14. [System Health Check](#14-system-health-check)

---

## 1. Authentication & Tenancy

### 1.1 Register Organization Tenant
- **Method**: `POST`
- **Endpoint**: `/auth/register`
- **Auth Required**: No
- **Body**:
```json
{
  "organizationName": "MediCare Central Pharmacy",
  "slug": "medicare-central",
  "businessType": "RETAIL_PHARMACY",
  "ownerName": "Dr. Farhan Ahmed",
  "ownerEmail": "admin@medicare.com",
  "ownerPhone": "+8801711000111",
  "password": "Admin@123456",
  "branchName": "Dhanmondi Main Branch",
  "currency": "BDT",
  "addressCity": "Dhaka"
}
```

### 1.2 User Login
- **Method**: `POST`
- **Endpoint**: `/auth/login`
- **Body**:
```json
{
  "email": "admin@medicare.com",
  "password": "Admin@123456",
  "organizationSlug": "medicare-central"
}
```

### 1.3 Get Current User Profile (`/me`)
- **Method**: `GET`
- **Endpoint**: `/auth/me`
- **Headers**: `Authorization: Bearer <token>`

---

## 2. Organizations, Branches & Users

### 2.1 Get Organization Profile & Settings
- **Method**: `GET`
- **Endpoint**: `/organizations/profile`

### 2.2 Update Settings & Feature Flags
- **Method**: `PUT`
- **Endpoint**: `/organizations/settings`
- **Permission**: `org:manage`
- **Body**:
```json
{
  "enableFefo": true,
  "enablePrescriptionCheck": true,
  "enableMultiBranch": true,
  "defaultVatRate": 0.00
}
```

### 2.3 List & Create Branches
- `GET /organizations/branches` — List all physical outlets/branches.
- `POST /organizations/branches` — Create a new branch with auto-created default store room.

### 2.4 List Warehouses
- `GET /organizations/warehouses` — List all storage rooms across branches.
- `POST /organizations/warehouses` — Create a warehouse.

### 2.5 Manage Users & Roles
- `GET /organizations/users` — List pharmacy staff with assigned roles.
- `POST /organizations/users` — Invite/create a staff member (Pharmacist, Cashier, Accountant).

---

## 3. Product Catalog Master

### 3.1 Get Products (Search, Filter, Paginate)
- **Method**: `GET`
- **Endpoint**: `/products`
- **Query Params**: `page`, `limit`, `search`, `categoryId`, `genericId`, `manufacturerId`

### 3.2 Create Product
- **Method**: `POST`
- **Endpoint**: `/products`
- **Body**:
```json
{
  "brandName": "Napa Extra 500mg/65mg",
  "genericName": "Paracetamol + Caffeine",
  "strength": "500mg+65mg",
  "sku": "SKU-NAPA-EXT-01",
  "barcode": "8901234567890",
  "packSize": "10x10 Tablets",
  "piecesPerPack": 100,
  "defaultPurchasePrice": 24.00,
  "mrp": 30.00,
  "sellingPrice": 30.00,
  "wholesalePrice": 26.00,
  "minStockAlertLevel": 20,
  "reorderQuantity": 100,
  "shelfLocation": "Rack A-1"
}
```

### 3.3 Metadata Lookups
- `GET /products/generics` — List chemical formulations.
- `GET /products/categories` — List product categories.
- `GET /products/manufacturers` — List pharma manufacturers.
- `GET /products/metadata` — List dosage forms and packaging units.

---

## 4. Inventory & FEFO Batch Engine

### 4.1 Get Stock Levels
- `GET /inventory/stocks?lowStockOnly=false` — Real-time on-hand stock balances.

### 4.2 Calculate FEFO Batch Recommendation
- `GET /inventory/fefo-recommendation?productId=...&quantity=15` — Prioritizes nearest-expiry batches first.

### 4.3 Expiring Batches Alert
- `GET /inventory/expiring-batches?days=90` — Expiry risk exposure report (30/60/90 days).

### 4.4 Stock Adjustments
- `POST /inventory/adjustments` — Record physical count corrections, shelf damages, or expired batches.

---

## 5. POS & Counter Sales

### 5.1 Fast Barcode / SKU / Generic Search
- `GET /pos/search?q=8901234567890` — Fast counter product & batch search.

### 5.2 Open / Close Cash Register Session
- `POST /pos/sessions/open` — Open shift with opening cash balance.
- `POST /pos/sessions/:id/close` — Close shift with closing counted cash and discrepancy report.

### 5.3 POS Sale Checkout (Auto FEFO / Split Payments)
- **Method**: `POST`
- **Endpoint**: `/pos/checkout`
- **Body**:
```json
{
  "branchId": "BRANCH_UUID",
  "posSessionId": "SESSION_UUID",
  "customerId": null,
  "subtotal": 150.00,
  "discountAmount": 0.00,
  "grandTotal": 150.00,
  "paidAmount": 150.00,
  "changeReturned": 0.00,
  "items": [
    { "productId": "PRODUCT_UUID", "quantity": 5, "unitPrice": 30.00 }
  ],
  "payments": [
    { "paymentMethod": "CASH", "amount": 100.00 },
    { "paymentMethod": "MFS_BKASH", "amount": 50.00, "transactionReference": "TRX89712" }
  ]
}
```

### 5.4 Hold & Resume Carts
- `POST /pos/hold` — Hold cart.
- `GET /pos/held` — List held carts.
- `DELETE /pos/held/:id` — Resume/discard cart.

---

## 6. Prescriptions Management

### 6.1 Upload Prescription
- `POST /prescriptions` — Upload prescription with doctor details and diagnosis.

### 6.2 Review Prescription
- `PATCH /prescriptions/:id/review` — Pharmacist approves or rejects prescription.

---

## 7. Procurement & Purchases

### 7.1 Suppliers Master & Ledgers
- `GET /purchases/suppliers` — List suppliers with dues & credit limits.
- `POST /purchases/suppliers` — Add supplier.
- `GET /purchases/suppliers/:id/ledger` — View supplier transaction history.

### 7.2 Receive Purchase Invoice (Ingests Batches)
- `POST /purchases/invoices` — Receive goods, create batches, increase stock, and update supplier payable ledger.

---

## 8. Customer CRM & Dues

### 8.1 Customer Directory
- `GET /customers` — List customer profiles, loyalty points, and dues.
- `POST /customers` — Add customer.

### 8.2 Record Customer Due Payment
- `POST /customers/due-payments` — Collect cash/MFS payment against customer due.
- `GET /customers/:id/ledger` — View customer receivables ledger history.

---

## 9. Accounting, Finance & Expenses

### 9.1 Chart of Accounts & Journals
- `GET /accounting/chart-of-accounts` — List chart of accounts.
- `POST /accounting/journal-entries` — Double-entry manual journal entry.

### 9.2 Expense Vouchers
- `GET /accounting/expenses` — View expense vouchers.
- `POST /accounting/expenses` — Record store expense (rent, electricity, salary).

### 9.3 Daily Closing Report
- `GET /accounting/daily-closing?date=2026-09-08` — Daily consolidated sales, cash collected, expenses, and supplier payments.

---

## 10. HR, Attendance & Payroll

### 10.1 Employees & Attendance
- `GET /hr/employees` — List employees with salary breakdowns.
- `POST /hr/employees` — Create employee profile.
- `POST /hr/attendance` — Daily check-in / check-out.

### 10.2 Monthly Payroll Processing
- `POST /hr/payroll/process` — Process monthly salary calculation for all staff.

---

## 11. Ecommerce Orders & Delivery

### 11.1 Storefront Website CMS
- `GET /orders/website` — Get website branding, logo, banners, and opening hours.
- `PUT /orders/website` — Update storefront CMS settings.

### 11.2 Online Orders & Riders
- `GET /orders` — List online customer orders.
- `POST /orders` — Place online order.
- `PATCH /orders/:id/status` — Dispatch order & assign delivery rider.

---

## 12. Notifications & Audit Logs

### 12.1 Alerts & Notifications
- `GET /notifications?unreadOnly=true` — Low stock alerts, 30/60/90 days expiry warnings, customer due reminders.
- `PATCH /notifications/:id/read` — Mark notification as read.

### 12.2 System Audit Trail
- `GET /notifications/audit-logs` — Immutable audit log of sensitive actions (sales, refunds, price changes).

---

## 13. Executive Reports & BI Analytics

### 13.1 Executive Dashboard Overview
- `GET /reports/dashboard-overview` — Real-time KPIs: Today's sales, gross/net profit, expenses, customer/supplier dues, low stock count, expiring batches, 7-day sales trend, and top 10 selling medicines.

---

## 14. System Health Check

- `GET /api/health` — Returns service status, timestamp, and uptime.
```json
{
  "status": "healthy",
  "timestamp": "2026-09-08T02:16:00.000Z",
  "uptime": 2840.12,
  "service": "Pharmacy Business Operating System API"
}
```
