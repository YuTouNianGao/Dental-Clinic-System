import { pool } from '../db.js';

// Notifications are deliberately best-effort. They are not the source of truth
// for appointment, payment, refund or settlement state.
export async function notifyUser(userId, type, title, body, options = {}) {
  if (!userId) return null;
  try {
    const [result] = await pool.execute(
      `INSERT INTO notification (user_id, type, title, body, related_entity_type, related_entity_id, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notification_id = notification_id`,
      [
        userId,
        type,
        String(title).slice(0, 120),
        String(body).slice(0, 500),
        options.relatedEntityType || null,
        options.relatedEntityId === undefined || options.relatedEntityId === null ? null : String(options.relatedEntityId),
        options.dedupeKey || null
      ]
    );
    return result.insertId || null;
  } catch (error) {
    console.error('Notification write failed:', error.message);
    return null;
  }
}

export async function notifyPatient(patientId, type, title, body, options = {}) {
  try {
    const [rows] = await pool.execute(
      `SELECT ua.user_id
         FROM patient_account pa
         JOIN user_account ua ON ua.user_id = pa.user_id
        WHERE pa.patient_id = ? AND pa.link_status = 'ACTIVE' AND ua.status = 'ACTIVE'
        LIMIT 1`,
      [patientId]
    );
    if (!rows[0]) return null;
    return notifyUser(rows[0].user_id, type, title, body, options);
  } catch (error) {
    console.error('Patient notification lookup failed:', error.message);
    return null;
  }
}
