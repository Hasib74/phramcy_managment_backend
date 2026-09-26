import { pool, withTransaction } from '../../database/connection.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class PrescriptionsService {
  /**
   * Upload / Create Prescription
   */
  static async createPrescription(organizationId: string, branchId: string, data: any) {
    return withTransaction(async (client) => {
      const res = await client.query(
        `
        INSERT INTO prescriptions (
          organization_id, branch_id, customer_id, doctor_name, doctor_reg_no,
          hospital_name, prescription_date, prescription_file_url, diagnosis, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_REVIEW')
        RETURNING *
        `,
        [
          organizationId,
          branchId,
          data.customerId || null,
          data.doctorName || null,
          data.doctorRegNo || null,
          data.hospitalName || null,
          data.prescriptionDate || new Date(),
          data.prescriptionFileUrl || null,
          data.diagnosis || null
        ]
      );
      const prescription = res.rows[0];

      if (data.items && data.items.length > 0) {
        for (const it of data.items) {
          await client.query(
            `
            INSERT INTO prescription_items (
              prescription_id, product_id, medicine_name, dosage, frequency, duration_days, total_quantity_suggested, instructions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              prescription.id,
              it.productId || null,
              it.medicineName,
              it.dosage || null,
              it.frequency || null,
              it.durationDays || null,
              it.totalQuantitySuggested || null,
              it.instructions || null
            ]
          );
        }
      }

      return prescription;
    });
  }

  /**
   * List Prescriptions
   */
  static async getPrescriptions(organizationId: string, status?: string, customerId?: string) {
    let queryText = `
      SELECT p.*, c.name as customer_name, c.phone as customer_phone, u.first_name as reviewer_name
      FROM prescriptions p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN users u ON p.reviewed_by = u.id
      WHERE p.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let idx = 2;

    if (status) {
      queryText += ` AND p.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (customerId) {
      queryText += ` AND p.customer_id = $${idx}`;
      params.push(customerId);
      idx++;
    }

    queryText += ' ORDER BY p.prescription_date DESC, p.created_at DESC';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Review & Approve Prescription by Pharmacist
   */
  static async reviewPrescription(organizationId: string, prescriptionId: string, userId: string, data: any) {
    const res = await pool.query(
      `
      UPDATE prescriptions
      SET 
        status = $1,
        pharmacist_notes = $2,
        reviewed_by = $3,
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND organization_id = $5
      RETURNING *
      `,
      [data.status, data.pharmacistNotes || null, userId, prescriptionId, organizationId]
    );

    if (res.rows.length === 0) {
      throw new AppError('Prescription not found', 404);
    }

    return res.rows[0];
  }
}
