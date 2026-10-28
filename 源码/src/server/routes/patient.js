import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { activePatientId } from '../auth.js';
import { asyncHandler, badRequest, conflict, notFound } from '../errors.js';
import { asId, dayBounds, toUtcSql } from '../utils.js';
import { createPatientAppointment, cancelPatientAppointment } from '../services/patientAppointmentService.js';
import { loadOrder, payMockOrder } from '../services/paymentService.js';
import { notifyPatient } from '../services/notificationService.js';

const router = Router();

function requireActive(req) {
  return activePatientId(req.user);
}

router.get('/binding', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT pa.*, c.clinic_no AS requested_clinic_no
       FROM patient_account pa
       LEFT JOIN clinic c ON c.clinic_id=pa.requested_clinic_id
      WHERE pa.user_id=?`,
    [req.user.userId]
  );
  res.json({ linkStatus: req.user.linkStatus || rows[0]?.link_status || null, binding: rows[0] || null });
}));

router.get('/profile', asyncHandler(async (req, res) => {
  if (req.user.linkStatus !== 'ACTIVE' || !req.user.patientId) {
    const binding = await query('SELECT * FROM patient_account WHERE user_id=?', [req.user.userId]);
    return res.json({ patient: null, allergies: [], clinics: [], binding: binding[0] || null, linkStatus: req.user.linkStatus || null });
  }
  const patientId = requireActive(req);
  const [patients, allergies, clinics] = await Promise.all([
    query('SELECT patient_id, patient_no, patient_name, birth_date, billing_address, phone, email, emergency_contact_name, emergency_contact_phone, status FROM patient WHERE patient_id=?', [patientId]),
    query('SELECT allergy_id, allergy_name, note, confirmation_status FROM patient_allergy WHERE patient_id=? ORDER BY confirmation_status, allergy_name', [patientId]),
    query('SELECT c.clinic_id, c.clinic_no, c.postal_address, c.phone FROM patient_clinic_relation pcr JOIN clinic c ON c.clinic_id=pcr.clinic_id WHERE pcr.patient_id=? ORDER BY c.clinic_no', [patientId])
  ]);
  if (!patients[0]) throw notFound('患者档案不存在');
  res.json({ patient: patients[0], allergies, clinics, linkStatus: 'ACTIVE' });
}));

router.put('/profile', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const input = z.object({
    phone: z.string().trim().min(5).max(32).optional(),
    email: z.string().trim().email().max(254).nullable().optional().or(z.literal('')),
    billingAddress: z.string().trim().min(1).max(255).optional(),
    emergencyContactName: z.string().trim().min(1).max(100).optional(),
    emergencyContactPhone: z.string().trim().min(5).max(32).optional()
  }).parse(req.body);
  const existingRows = await query('SELECT * FROM patient WHERE patient_id=?', [patientId]);
  const existing = existingRows[0];
  if (!existing) throw notFound('患者档案不存在');
  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE patient SET phone=?, email=?, billing_address=?, emergency_contact_name=?, emergency_contact_phone=?
        WHERE patient_id=?`,
      [
        input.phone ?? existing.phone,
        input.email === '' ? null : (input.email === undefined ? existing.email : input.email),
        input.billingAddress ?? existing.billing_address,
        input.emergencyContactName ?? existing.emergency_contact_name,
        input.emergencyContactPhone ?? existing.emergency_contact_phone,
        patientId
      ]
    );
    await writeAudit(conn, req.user.userId, 'UPDATE', 'patient', patientId, {
      details: { fields: Object.keys(input) }, ipAddress: req.ip
    });
  });
  res.json({ ok: true });
}));

router.get('/home', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const patientRows = await query('SELECT patient_id, patient_no, patient_name, phone, email FROM patient WHERE patient_id=?', [patientId]);
  const [appointments, orders, notifications, visits] = await Promise.all([
    query(`SELECT a.*, c.clinic_no, c.postal_address, u.display_name AS dentist_name
             FROM appointment a JOIN clinic c ON c.clinic_id=a.clinic_id
             JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id
            WHERE a.patient_id=? ORDER BY a.scheduled_start_at DESC LIMIT 5`, [patientId]),
    query(`SELECT * FROM payment_order WHERE patient_id=? AND status IN ('PENDING_PAYMENT','PARTIALLY_PAID','PAID','REFUNDING','FORFEITED')
            ORDER BY created_at DESC LIMIT 10`, [patientId]),
    query(`SELECT * FROM notification WHERE user_id=? ORDER BY created_at DESC LIMIT 6`, [req.user.userId]),
    query(`SELECT v.visit_id, v.visit_no, v.visit_datetime, v.status, v.patient_problem, c.clinic_no, u.display_name AS dentist_name
             FROM visit v JOIN appointment a ON a.appointment_id=v.appointment_id
             JOIN clinic c ON c.clinic_id=a.clinic_id
             JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id
            WHERE a.patient_id=? ORDER BY v.visit_datetime DESC LIMIT 5`, [patientId])
  ]);
  res.json({ patient: patientRows[0] || null, appointments, paymentOrders: orders, notifications, visits });
}));

router.get('/appointments', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const where = ['a.patient_id=?'];
  const params = [patientId];
  if (req.query.status) { where.push('a.status=?'); params.push(req.query.status); }
  const total = (await query(`SELECT COUNT(*) AS total FROM appointment a WHERE ${where.join(' AND ')}`, params))[0].total;
  const rows = await query(
    `SELECT a.*, c.clinic_no, c.postal_address, u.display_name AS dentist_name,
            po.order_id, po.order_no, po.status AS payment_status, po.amount AS deposit_amount,
            po.amount_paid, po.amount_refunded, po.expires_at
       FROM appointment a
       JOIN clinic c ON c.clinic_id=a.clinic_id
       JOIN dentist_profile d ON d.dentist_id=a.dentist_id
       JOIN user_account u ON u.user_id=d.user_id
       LEFT JOIN payment_order po ON po.appointment_id=a.appointment_id AND po.order_type='APPOINTMENT_DEPOSIT'
      WHERE ${where.join(' AND ')}
      ORDER BY a.scheduled_start_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  res.json({ items: rows, pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) } });
}));

router.get('/appointments/:id', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const id = asId(req.params.id);
  const rows = await query(
    `SELECT a.*, c.clinic_no, c.postal_address, c.phone AS clinic_phone, u.display_name AS dentist_name
       FROM appointment a JOIN clinic c ON c.clinic_id=a.clinic_id
       JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id
      WHERE a.appointment_id=? AND a.patient_id=?`,
    [id, patientId]
  );
  if (!rows[0]) throw notFound('预约不存在');
  const [changes, orders, visit] = await Promise.all([
    query('SELECT change_id, change_type, reason, initiator_party, cause_code, seconds_before_start, refund_eligible, refund_amount, changed_at FROM appointment_change WHERE original_appointment_id=? ORDER BY changed_at', [id]),
    query('SELECT * FROM payment_order WHERE appointment_id=? ORDER BY created_at DESC', [id]),
    query('SELECT visit_id, visit_no, visit_datetime, status, patient_problem FROM visit WHERE appointment_id=?', [id])
  ]);
  res.json({ appointment: rows[0], changes, paymentOrders: orders, visit: visit[0] || null });
}));

router.post('/appointments', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const input = z.object({
    scheduleId: z.coerce.number().int().positive(),
    startAt: z.string().min(10),
    endAt: z.string().min(10),
    expectedTreatment: z.string().trim().min(1).max(500)
  }).parse(req.body);
  const start = toUtcSql(input.startAt);
  const end = toUtcSql(input.endAt);
  const result = await createPatientAppointment({
    patientId, patientUserId: req.user.userId, scheduleId: input.scheduleId,
    start, end, expectedTreatment: input.expectedTreatment, ipAddress: req.ip
  });
  await notifyPatient(patientId, 'APPOINTMENT_CREATED', '预约待支付',
    `预约 ${result.appointment.appointment_no} 已占位 15 分钟，请完成预约金支付后确认。`,
    { relatedEntityType: 'appointment', relatedEntityId: result.appointment.appointment_id, dedupeKey: `appointment:${result.appointment.appointment_id}:created` });
  res.status(201).json({
    appointmentId: result.appointment.appointment_id,
    appointmentNo: result.appointment.appointment_no,
    status: result.appointment.status,
    holdExpiresAt: result.appointment.hold_expires_at,
    order: {
      orderId: result.order.order_id,
      orderNo: result.order.order_no,
      amount: String(result.order.amount),
      status: result.order.status,
      expiresAt: result.order.expires_at
    }
  });
}));

router.post('/appointments/:id/cancel', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const id = asId(req.params.id);
  const input = z.object({ reason: z.string().trim().min(1).max(255) }).parse(req.body);
  const result = await cancelPatientAppointment({
    appointmentId: id, patientId, patientUserId: req.user.userId, reason: input.reason, ipAddress: req.ip
  });
  await notifyPatient(patientId, 'APPOINTMENT_CANCELLED', '预约已取消',
    result.refundEligible ? '预约已取消，退款申请已提交主管审核。' : '预约已取消；按规则本次预约金不退款。',
    { relatedEntityType: 'appointment', relatedEntityId: id, dedupeKey: `appointment:${id}:cancelled` });
  res.json(result);
}));

router.get('/visits', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const total = (await query(
    `SELECT COUNT(*) AS total FROM visit v JOIN appointment a ON a.appointment_id=v.appointment_id WHERE a.patient_id=?`,
    [patientId]
  ))[0].total;
  const rows = await query(
    `SELECT v.visit_id, v.visit_no, v.visit_datetime, v.patient_problem, v.special_needs, v.status,
            a.appointment_no, c.clinic_no, u.display_name AS dentist_name,
            s.settlement_id, s.settlement_no, s.total_amount, s.status AS settlement_status
       FROM visit v JOIN appointment a ON a.appointment_id=v.appointment_id
       JOIN clinic c ON c.clinic_id=a.clinic_id
       JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id
       LEFT JOIN settlement s ON s.visit_id=v.visit_id AND s.status='ACTIVE'
      WHERE a.patient_id=? ORDER BY v.visit_datetime DESC LIMIT ? OFFSET ?`,
    [patientId, pageSize, (page - 1) * pageSize]
  );
  res.json({ items: rows, pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) } });
}));

router.get('/visits/:id', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const id = asId(req.params.id);
  const rows = await query(
    `SELECT v.*, a.appointment_no, a.scheduled_start_at, c.clinic_no, c.postal_address, u.display_name AS dentist_name
       FROM visit v JOIN appointment a ON a.appointment_id=v.appointment_id
       JOIN clinic c ON c.clinic_id=a.clinic_id
       JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id
      WHERE v.visit_id=? AND a.patient_id=?`,
    [id, patientId]
  );
  if (!rows[0]) throw notFound('就诊记录不存在');
  const [treatments, settlements, allergies] = await Promise.all([
    query(`SELECT td.treatment_detail_id, td.unit_quantity, td.unit_price_snapshot, td.subtotal, td.status,
                  ti.treatment_name
             FROM treatment_detail td JOIN treatment_item ti ON ti.treatment_item_id=td.treatment_item_id
            WHERE td.visit_id=? ORDER BY td.recorded_at`, [id]),
    query(`SELECT settlement_id, settlement_no, version_no, settlement_date, total_amount, status
             FROM settlement WHERE visit_id=? ORDER BY version_no DESC`, [id]),
    query('SELECT allergy_name, note, confirmation_status FROM patient_allergy WHERE patient_id=? ORDER BY confirmation_status, allergy_name', [rows[0].patient_id])
  ]);
  res.json({ visit: rows[0], treatments, settlements, allergies });
}));

router.get('/settlements', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const total = (await query(
    `SELECT COUNT(*) AS total FROM settlement s JOIN visit v ON v.visit_id=s.visit_id
      JOIN appointment a ON a.appointment_id=v.appointment_id WHERE a.patient_id=?`,
    [patientId]
  ))[0].total;
  const rows = await query(
    `SELECT s.settlement_id, s.settlement_no, s.version_no, s.settlement_date, s.total_amount, s.status,
            v.visit_no, v.visit_datetime, a.appointment_no, c.clinic_no, u.display_name AS dentist_name
       FROM settlement s JOIN visit v ON v.visit_id=s.visit_id
       JOIN appointment a ON a.appointment_id=v.appointment_id
       JOIN clinic c ON c.clinic_id=a.clinic_id
       JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id
      WHERE a.patient_id=? ORDER BY s.settlement_date DESC LIMIT ? OFFSET ?`,
    [patientId, pageSize, (page - 1) * pageSize]
  );
  res.json({ items: rows, pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) } });
}));

router.get('/settlements/:id', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const id = asId(req.params.id);
  const rows = await query(
    `SELECT s.*, v.visit_no, v.visit_datetime, a.appointment_no, a.clinic_id, c.clinic_no, c.postal_address,
            u.display_name AS dentist_name
       FROM settlement s JOIN visit v ON v.visit_id=s.visit_id
       JOIN appointment a ON a.appointment_id=v.appointment_id
       JOIN clinic c ON c.clinic_id=a.clinic_id
       JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id
      WHERE s.settlement_id=? AND a.patient_id=?`,
    [id, patientId]
  );
  if (!rows[0]) throw notFound('结算单不存在');
  const [details, orders, refunds] = await Promise.all([
    query('SELECT settlement_detail_id, treatment_item_id, treatment_name_snapshot, unit_quantity_snapshot, unit_price_snapshot, subtotal FROM settlement_detail WHERE settlement_id=? ORDER BY settlement_detail_id', [id]),
    query('SELECT * FROM payment_order WHERE settlement_id=? ORDER BY created_at DESC', [id]),
    query(`SELECT r.* FROM refund r JOIN payment_order po ON po.order_id=r.order_id
            WHERE po.settlement_id=? ORDER BY r.created_at DESC`, [id])
  ]);
  res.json({ settlement: rows[0], details, paymentOrders: orders, refunds });
}));

router.get('/payment-orders', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const where = ['patient_id=?'];
  const params = [patientId];
  if (req.query.status) { where.push('status=?'); params.push(req.query.status); }
  if (req.query.orderType) { where.push('order_type=?'); params.push(req.query.orderType); }
  const rows = await query(
    `SELECT * FROM payment_order WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
    params
  );
  res.json({ items: rows });
}));

router.get('/payment-orders/:id', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const id = asId(req.params.id);
  const order = await loadOrder(id);
  if (!order || Number(order.patient_id) !== Number(patientId)) throw notFound('支付订单不存在');
  const [transactions, refunds] = await Promise.all([
    query('SELECT * FROM payment_transaction WHERE order_id=? ORDER BY created_at', [id]),
    query('SELECT * FROM refund WHERE order_id=? ORDER BY created_at', [id])
  ]);
  res.json({ order, transactions, refunds });
}));

router.post('/payment-orders/:id/pay', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const id = asId(req.params.id);
  const input = z.object({ outcome: z.enum(['SUCCESS', 'FAILURE']) }).parse(req.body);
  const result = await payMockOrder({
    orderId: id, patientId, actorUserId: req.user.userId, outcome: input.outcome,
    idempotencyKey: req.get('Idempotency-Key') || `MOCK:${id}:${input.outcome}`,
    ipAddress: req.ip
  });
  const isDeposit = result.order?.order_type === 'APPOINTMENT_DEPOSIT';
  await notifyPatient(patientId,
    input.outcome === 'SUCCESS' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
    input.outcome === 'SUCCESS' ? '模拟支付成功' : '模拟支付失败',
    input.outcome === 'SUCCESS'
      ? (isDeposit ? '预约金模拟支付成功，预约已确认。' : '诊后余额模拟支付成功。')
      : '本次模拟支付未成功，订单仍可继续支付。',
    { relatedEntityType: 'payment_order', relatedEntityId: id, dedupeKey: `payment:${id}:${input.outcome}:${result.transaction.transaction_id}` });
  res.json(result);
}));

router.get('/refunds', asyncHandler(async (req, res) => {
  const patientId = requireActive(req);
  const rows = await query(
    `SELECT r.*, po.order_no, po.order_type, a.appointment_no
       FROM refund r JOIN payment_order po ON po.order_id=r.order_id
       LEFT JOIN appointment a ON a.appointment_id=r.appointment_id
      WHERE po.patient_id=? ORDER BY r.created_at DESC LIMIT 100`,
    [patientId]
  );
  res.json({ items: rows });
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const where = ['user_id=?'];
  const params = [userId];
  if (req.query.unreadOnly === 'true') where.push('read_at IS NULL');
  const rows = await query(
    `SELECT * FROM notification WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
    params
  );
  const unread = (await query('SELECT COUNT(*) AS total FROM notification WHERE user_id=? AND read_at IS NULL', [userId]))[0].total;
  res.json({ items: rows, unread: Number(unread) });
}));

router.post('/notifications/:id/read', asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const [result] = await query(
    'UPDATE notification SET read_at=UTC_TIMESTAMP(6) WHERE notification_id=? AND user_id=? AND read_at IS NULL',
    [id, req.user.userId]
  );
  if (!result.affectedRows) {
    const rows = await query('SELECT notification_id FROM notification WHERE notification_id=? AND user_id=?', [id, req.user.userId]);
    if (!rows[0]) throw notFound('通知不存在');
  }
  res.json({ ok: true });
}));

router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await query('UPDATE notification SET read_at=UTC_TIMESTAMP(6) WHERE user_id=? AND read_at IS NULL', [req.user.userId]);
  res.json({ ok: true });
}));

export default router;
