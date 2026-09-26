import { pool } from '../../database/connection.js';

export class NotificationsService {
  /**
   * List Notifications (Low stock alerts, expiry warnings, due alerts)
   */
  static async getNotifications(organizationId: string, userId: string, unreadOnly = false) {
    let queryText = `
      SELECT * FROM notifications
      WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL)
    `;
    const params: any[] = [organizationId, userId];

    if (unreadOnly) {
      queryText += ' AND is_read = false';
    }

    queryText += ' ORDER BY created_at DESC LIMIT 50';
    const res = await pool.query(queryText, params);
    return res.rows;
  }

  /**
   * Mark Notification as Read
   */
  static async markAsRead(organizationId: string, notificationId: string) {
    await pool.query(
      'UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2',
      [notificationId, organizationId]
    );
    return { success: true };
  }

  /**
   * Get System Audit Logs
   */
  static async getAuditLogs(organizationId: string, limit = 100) {
    const res = await pool.query(
      `
      SELECT al.*, u.first_name, u.last_name, u.email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.organization_id = $1
      ORDER BY al.created_at DESC
      LIMIT $2
      `,
      [organizationId, limit]
    );
    return res.rows;
  }
}
