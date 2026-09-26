import { pool, withTransaction } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class HRService {
  /**
   * Employees List
   */
  static async getEmployees(organizationId: string, branchId?: string, search?: string) {
    let queryText = `
      SELECT e.*, d.name as department_name, des.name as designation_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN designations des ON e.designation_id = des.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let idx = 2;

    if (branchId) {
      queryText += ` AND e.branch_id = $${idx}`;
      params.push(branchId);
      idx++;
    }

    if (search) {
      queryText += ` AND (e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.employee_code ILIKE $${idx} OR e.phone ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    queryText += ' ORDER BY e.first_name ASC';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Create Employee
   */
  static async createEmployee(organizationId: string, data: any) {
    const code = `EMP-${Date.now().toString().slice(-5)}`;
    const gross = (parseFloat(data.basicSalary || '0') +
      parseFloat(data.houseRentAllowance || '0') +
      parseFloat(data.medicalAllowance || '0') +
      parseFloat(data.transportAllowance || '0') +
      parseFloat(data.otherAllowance || '0'));

    const res = await pool.query(
      `
      INSERT INTO employees (
        organization_id, branch_id, department_id, designation_id,
        employee_code, first_name, last_name, phone, email, national_id,
        gender, date_of_birth, joining_date, basic_salary, house_rent_allowance,
        medical_allowance, transport_allowance, other_allowance, gross_salary,
        bank_name, bank_account_number, mobile_banking_number
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22
      )
      RETURNING *
      `,
      [
        organizationId,
        data.branchId || null,
        data.departmentId || null,
        data.designationId || null,
        code,
        data.firstName,
        data.lastName || '',
        data.phone,
        data.email || null,
        data.nationalId || null,
        data.gender || null,
        data.dateOfBirth || null,
        data.joiningDate || new Date(),
        data.basicSalary || 0,
        data.houseRentAllowance || 0,
        data.medicalAllowance || 0,
        data.transportAllowance || 0,
        data.otherAllowance || 0,
        gross,
        data.bankName || null,
        data.bankAccountNumber || null,
        data.mobileBankingNumber || null
      ]
    );

    return res.rows[0];
  }

  /**
   * Daily Attendance Check-In / Check-Out
   */
  static async recordAttendance(organizationId: string, branchId: string, userId: string, data: any) {
    const today = new Date().toISOString().split('T')[0];

    const existing = await pool.query(
      'SELECT id, check_in_time FROM attendance_records WHERE organization_id = $1 AND employee_id = $2 AND attendance_date = $3',
      [organizationId, data.employeeId, today]
    );

    if (existing.rows.length === 0) {
      // Check-In
      const res = await pool.query(
        `
        INSERT INTO attendance_records (
          organization_id, branch_id, employee_id, attendance_date,
          check_in_time, status, verification_method, recorded_by
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7)
        RETURNING *
        `,
        [organizationId, branchId, data.employeeId, today, data.status || 'PRESENT', data.verificationMethod || 'MANUAL', userId]
      );
      return { action: 'CHECK_IN', record: res.rows[0] };
    } else {
      // Check-Out
      const checkInTime = new Date(existing.rows[0].check_in_time);
      const checkOutTime = new Date();
      const workingHours = ((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)).toFixed(2);

      const res = await pool.query(
        `
        UPDATE attendance_records
        SET check_out_time = CURRENT_TIMESTAMP, total_working_hours = $1
        WHERE id = $2
        RETURNING *
        `,
        [workingHours, existing.rows[0].id]
      );
      return { action: 'CHECK_OUT', record: res.rows[0] };
    }
  }

  /**
   * Run Monthly Payroll Calculation
   */
  static async processPayroll(organizationId: string, userId: string, month: number, year: number) {
    return withTransaction(async (client) => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

      const cycleRes = await client.query(
        `
        INSERT INTO payroll_cycles (
          organization_id, month, year, start_date, end_date, status, processed_by
        ) VALUES ($1, $2, $3, $4, $5, 'PROCESSING', $6)
        ON CONFLICT (organization_id, month, year)
        DO UPDATE SET status = 'PROCESSING', processed_by = EXCLUDED.processed_by
        RETURNING id
        `,
        [organizationId, month, year, startDate, endDate, userId]
      );
      const cycleId = cycleRes.rows[0].id;

      // Delete old items if re-processing draft
      await client.query('DELETE FROM payroll_items WHERE payroll_cycle_id = $1', [cycleId]);

      // Fetch active employees
      const emps = await client.query(
        'SELECT * FROM employees WHERE organization_id = $1 AND employment_status = $2',
        [organizationId, 'ACTIVE']
      );

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      for (const emp of emps.rows) {
        const basic = parseFloat(emp.basic_salary);
        const allowances = parseFloat(emp.house_rent_allowance) +
          parseFloat(emp.medical_allowance) +
          parseFloat(emp.transport_allowance) +
          parseFloat(emp.other_allowance);
        const gross = basic + allowances;
        const deductions = 0.0; // Customizable tax / absence deductions
        const net = gross - deductions;

        totalGross += gross;
        totalDeductions += deductions;
        totalNet += net;

        await client.query(
          `
          INSERT INTO payroll_items (
            payroll_cycle_id, employee_id, basic_salary, allowances_total,
            gross_earnings, total_deductions, net_payable, payment_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'UNPAID')
          `,
          [cycleId, emp.id, basic, allowances, gross, deductions, net]
        );
      }

      await client.query(
        `
        UPDATE payroll_cycles
        SET total_gross_amount = $1, total_deductions_amount = $2, total_net_amount = $3, status = 'APPROVED'
        WHERE id = $4
        `,
        [totalGross, totalDeductions, totalNet, cycleId]
      );

      return {
        cycleId,
        month,
        year,
        totalEmployees: emps.rows.length,
        totalGross,
        totalNet
      };
    });
  }
}
