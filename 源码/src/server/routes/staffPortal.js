import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { allow, assertClinicAccess, isHQ, scopedClinicSql } from '../auth.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { asId } from '../utils.js';
import {
  approveRefund,
  confirmOfflinePayment,
  forfeitDeposit,
  processRefundMock,
  recordLatePayment,
  recordOfflinePayment,
  rejectRefund,
  requestRefundInfo,
  voidOfflinePayment
} from '../services/paymentService.js';
import { notifyPatient } from '../services/notificationService.js';

const router = Router();
const financeRoles = ['FRONT_DESK', 'CLINIC_MANAGER', 'HQ_MANAGER'];

async function checkPatientScope(user, patientId, requestedClinicId) {
  if (isHQ(user)) return;
  if (!requestedClinicId || !user.clinicIds.includes(Number(requestedClinicId))) {
    throw forbidden('该申请不在您的诊所授权范围内');
  }
  const relations = await query('SELECT clinic_id FROM patient_clinic_relation WHERE patient_id=?', [patientId]);
  const outside = relations.filter((row) => !user.clinicIds.includes(Number(row.clinic_id)));
  if (outside.length) throw forbidden('该患者存在跨诊所档案，需由总部或更高权限审核');
}

router.get('/patient-bindings', allow('FRONT_DESK', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const where = ['pa.link_status IN (?, ?, ?)'];
  const params = ['PENDING', 'REJECTED', 'REVOKED'];
  if (req.query.status) {
    where[0] = 'pa.link_status=?';
    params[0] = req.query.status;
  }
  if (!isHQ(req.user)) {
    if (!req.user.clinicIds.length) return res.json({ items: [] });
    where.push(`pa.requested_clinic_id IN (${req.user.clinicIds.map(() => '?').join(',')})`);
    params.push(...req.user.clinicIds);
  }
  const rows = await query(
    `SELECT pa.*, ua.username, ua.display_name, ua.status AS account_status,
            c.clinic_no AS requested_clinic_no,
            p.patient_no AS matched_patient_no, p.patient_name AS matched_patient_name
       FROM patient_account pa
       JOIN user_account ua ON ua.user_id=pa.user_id
       LEFT JOIN clinic c ON c.clinic_id=pa.requested_clinic_id
       LEFT JOIN patient p ON p.patient_id=pa.matched_patient_id
      WHERE ${where.join(' AND ')}
      ORDER BY pa.created_at DESC LIMIT 100`,
    params
  );
  res.json({ items: rows });
}));

router.post('/patient-bindings/:userId/approve', allow('FRONT_DESK', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const userId = asId(req.params.userId);
  const input = z.object({ patientId: z.coerce.number().int().positive(), note: z.string().trim().max(500).optional() }).parse(req.body);
  const account = (await query('SELECT * FROM patient_account WHERE user_id=?', [userId]))[0];
  if (!account) throw notFound('绑定申请不存在');
  if (account.link_status !== 'PENDING') throw conflict('该申请当前不能审核');
  await checkPatientScope(req.user, input.patientId, account.requested_clinic_id);
  await transaction(async (conn) => {
    const [accounts] = await conn.execute('SELECT * FROM patient_account WHERE user_id=? FOR UPDATE', [userId]);
    if (!accounts[0] || accounts[0].link_status !== 'PENDING') throw conflict('该申请当前不能审核');
    const [patients] = await conn.execute('SELECT * FROM patient WHERE patient_id=? AND status=\'ACTIVE\' FOR UPDATE', [input.patientId]);
    if (!patients[0]) throw conflict('患者档案不存在或已停用');
    const [other] = await conn.execute('SELECT user_id FROM patient_account WHERE patient_id=? AND link_status=\'ACTIVE\'', [input.patientId]);
    if (other.length && Number(other[0].user_id) !== userId) throw conflict('该患者档案已绑定其他账号');
    await conn.execute(
      `UPDATE patient_account
          SET patient_id=?, matched_patient_id=?, link_status='ACTIVE', reviewed_by_user_id=?, reviewed_at=UTC_TIMESTAMP(6),
              rejection_reason=NULL, unbound_at=NULL, unbound_by_user_id=NULL, unbind_reason=NULL
        WHERE user_id=?`,
      [input.patientId, input.patientId, req.user.userId, userId]
    );
    await writeAudit(conn, req.user.userId, 'APPROVE_PATIENT_BINDING', 'patient_account', userId, {
      beforeStatus: 'PENDING', afterStatus: 'ACTIVE', relatedEntityId: input.patientId,
      reason: input.note || null, ipAddress: req.ip
    });
  });
  await notifyPatient(input.patientId, 'BINDING_APPROVED', '患者档案绑定已通过', '您的患者档案绑定申请已通过审核，可以查看本人预约、就诊和账单。', {
    relatedEntityType: 'patient_account', relatedEntityId: userId, dedupeKey: `binding:${userId}:approved`
  });
  res.json({ ok: true });
}));

router.post('/patient-bindings/:userId/reject', allow('FRONT_DESK', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const userId = asId(req.params.userId);
  const input = z.object({ reason: z.string().trim().min(1).max(255) }).parse(req.body);
  await transaction(async (conn) => {
    const [accounts] = await conn.execute('SELECT * FROM patient_account WHERE user_id=? FOR UPDATE', [userId]);
    if (!accounts[0] || accounts[0].link_status !== 'PENDING') throw conflict('该申请当前不能审核');
    await conn.execute(
      "UPDATE patient_account SET link_status='REJECTED', reviewed_by_user_id=?, reviewed_at=UTC_TIMESTAMP(6), rejection_reason=? WHERE user_id=?",
      [req.user.userId, input.reason, userId]
    );
    await writeAudit(conn, req.user.userId, 'REJECT_PATIENT_BINDING', 'patient_account', userId, {
      beforeStatus: 'PENDING', afterStatus: 'REJECTED', reason: input.reason, ipAddress: req.ip
    });
  });
  res.json({ ok: true });
}));

router.post('/patient-bindings/:userId/unbind', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const userId = asId(req.params.userId);
  const input = z.object({ reason: z.string().trim().min(1).max(255) }).parse(req.body);
  await transaction(async (conn) => {
    const [accounts] = await conn.execute('SELECT * FROM patient_account WHERE user_id=? FOR UPDATE', [userId]);
    if (!accounts[0] || accounts[0].link_status !== 'ACTIVE') throw conflict('该账号当前不是已绑定状态');
    await conn.execute(
      "UPDATE patient_account SET link_status='REVOKED', unbound_at=UTC_TIMESTAMP(6), unbound_by_user_id=?, unbind_reason=? WHERE user_id=?",
      [req.user.userId, input.reason, userId]
    );
    await writeAudit(conn, req.user.userId, 'UNBIND_PATIENT_ACCOUNT', 'patient_account', userId, {
      beforeStatus: 'ACTIVE', afterStatus: 'REVOKED', reason: input.reason, ipAddress: req.ip
    });
  });
  res.json({ ok: true });
}));

router.get('/payment-orders', allow(...financeRoles), asyncHandler(async (req, res) => {
  const scope = scopedClinicSql(req.user, 'po.clinic_id', req.query.clinicId || null);
  const where = [scope.sql];
  const params = [...scope.params];
  if (req.query.status) { where.push('po.status=?'); params.push(req.query.status); }
  if (req.query.patientId) { where.push('po.patient_id=?'); params.push(Number(req.query.patientId)); }
  const rows = await query(
    `SELECT po.*, p.patient_name, p.patient_no, c.clinic_no
       FROM payment_order po JOIN patient p ON p.patient_id=po.patient_id
       JOIN clinic c ON c.clinic_id=po.clinic_id
      WHERE ${where.join(' AND ')} ORDER BY po.created_at DESC LIMIT 100`,
    params
  );
  res.json({ items: rows });
}));

router.get('/payment-orders/:id', allow(...financeRoles), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const rows = await query(
    `SELECT po.*, p.patient_name, p.patient_no, c.clinic_no
       FROM payment_order po JOIN patient p ON p.patient_id=po.patient_id
       JOIN clinic c ON c.clinic_id=po.clinic_id WHERE po.order_id=?`,
    [id]
  );
  if (!rows[0]) throw notFound('支付订单不存在');
  assertClinicAccess(req.user, rows[0].clinic_id);
  const [transactions, refunds] = await Promise.all([
    query('SELECT * FROM payment_transaction WHERE order_id=? ORDER BY created_at', [id]),
    query('SELECT * FROM refund WHERE order_id=? ORDER BY created_at', [id])
  ]);
  res.json({ order: rows[0], transactions, refunds });
}));

router.post('/payment-orders/:id/simulate-late-payment', allow('HQ_MANAGER'), asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') throw forbidden('生产环境不允许模拟晚到支付');
  const id = asId(req.params.id);
  const result = await recordLatePayment({ orderId: id, actorUserId: req.user.userId, ipAddress: req.ip });
  res.json(result);
}));

router.post('/payment-orders/:id/offline-payments', allow(...financeRoles), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    channel: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER_OFFLINE']),
    receiptNo: z.string().trim().min(1).max(64),
    note: z.string().trim().max(255).optional()
  }).parse(req.body);
  const order = (await query('SELECT * FROM payment_order WHERE order_id=?', [id]))[0];
  if (!order) throw notFound('支付订单不存在');
  assertClinicAccess(req.user, order.clinic_id);
  const result = await recordOfflinePayment({
    orderId: id, amount: input.amount, channel: input.channel, receiptNo: input.receiptNo,
    actorUserId: req.user.userId, note: input.note, ipAddress: req.ip
  });
  res.status(201).json(result);
}));

router.post('/payment-transactions/:id/confirm', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const tx = (await query(
    `SELECT pt.*, po.clinic_id FROM payment_transaction pt JOIN payment_order po ON po.order_id=pt.order_id WHERE pt.transaction_id=?`,
    [id]
  ))[0];
  if (!tx) throw notFound('收款记录不存在');
  assertClinicAccess(req.user, tx.clinic_id);
  const result = await confirmOfflinePayment({ transactionId: id, actorUserId: req.user.userId, ipAddress: req.ip });
  res.json(result);
}));

router.post('/payment-transactions/:id/void', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ reason: z.string().trim().min(1).max(255) }).parse(req.body);
  const tx = (await query(
    `SELECT pt.*, po.clinic_id FROM payment_transaction pt JOIN payment_order po ON po.order_id=pt.order_id WHERE pt.transaction_id=?`,
    [id]
  ))[0];
  if (!tx) throw notFound('收款记录不存在');
  assertClinicAccess(req.user, tx.clinic_id);
  const result = await voidOfflinePayment({ transactionId: id, actorUserId: req.user.userId, reason: input.reason, ipAddress: req.ip });
  res.json(result);
}));

router.get('/refunds', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const scope = scopedClinicSql(req.user, 'po.clinic_id', req.query.clinicId || null);
  const where = [scope.sql];
  const params = [...scope.params];
  if (req.query.status) { where.push('r.status=?'); params.push(req.query.status); }
  const rows = await query(
    `SELECT r.*, po.order_no, po.order_type, po.clinic_id, p.patient_name, p.patient_no, c.clinic_no
       FROM refund r JOIN payment_order po ON po.order_id=r.order_id
       JOIN patient p ON p.patient_id=po.patient_id JOIN clinic c ON c.clinic_id=po.clinic_id
      WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT 100`,
    params
  );
  res.json({ items: rows });
}));

router.post('/refunds/:id/approve', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ note: z.string().trim().max(500).optional() }).parse(req.body || {});
  const refund = (await query(
    'SELECT r.*, po.clinic_id, po.patient_id FROM refund r JOIN payment_order po ON po.order_id=r.order_id WHERE r.refund_id=?',
    [id]
  ))[0];
  if (!refund) throw notFound('退款任务不存在');
  assertClinicAccess(req.user, refund.clinic_id);
  const result = await approveRefund({ refundId: id, reviewerUserId: req.user.userId, note: input.note, ipAddress: req.ip });
  await notifyPatient(refund.patient_id, 'REFUND_APPROVED', '退款申请已通过', '退款申请已通过审核，进入后续处理。', {
    relatedEntityType: 'refund', relatedEntityId: id, dedupeKey: `refund:${id}:approved`
  });
  res.json(result);
}));

router.post('/refunds/:id/request-info', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ note: z.string().trim().min(1).max(500) }).parse(req.body);
  const refund = (await query(
    'SELECT r.*, po.clinic_id, po.patient_id FROM refund r JOIN payment_order po ON po.order_id=r.order_id WHERE r.refund_id=?',
    [id]
  ))[0];
  if (!refund) throw notFound('退款任务不存在');
  assertClinicAccess(req.user, refund.clinic_id);
  const result = await requestRefundInfo({ refundId: id, reviewerUserId: req.user.userId, note: input.note, ipAddress: req.ip });
  await notifyPatient(refund.patient_id, 'REFUND_NEEDS_INFO', '退款申请需补充资料', input.note, {
    relatedEntityType: 'refund', relatedEntityId: id, dedupeKey: `refund:${id}:needs-info`
  });
  res.json(result);
}));

router.post('/refunds/:id/reject', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ note: z.string().trim().min(1).max(500) }).parse(req.body);
  const refund = (await query(
    'SELECT r.*, po.clinic_id, po.patient_id FROM refund r JOIN payment_order po ON po.order_id=r.order_id WHERE r.refund_id=?',
    [id]
  ))[0];
  if (!refund) throw notFound('退款任务不存在');
  assertClinicAccess(req.user, refund.clinic_id);
  const result = await rejectRefund({ refundId: id, reviewerUserId: req.user.userId, note: input.note, ipAddress: req.ip });
  await notifyPatient(refund.patient_id, 'REFUND_REJECTED', '退款申请未通过', `${input.note}；资金进入冻结/争议状态，不会自动没收。`, {
    relatedEntityType: 'refund', relatedEntityId: id, dedupeKey: `refund:${id}:rejected`
  });
  res.json(result);
}));

router.post('/refunds/:id/process', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ outcome: z.enum(['SUCCESS', 'FAILURE']) }).parse(req.body);
  const refund = (await query(
    'SELECT r.*, po.clinic_id, po.patient_id FROM refund r JOIN payment_order po ON po.order_id=r.order_id WHERE r.refund_id=?',
    [id]
  ))[0];
  if (!refund) throw notFound('退款任务不存在');
  assertClinicAccess(req.user, refund.clinic_id);
  const result = await processRefundMock({ refundId: id, processorUserId: req.user.userId, outcome: input.outcome, ipAddress: req.ip });
  await notifyPatient(refund.patient_id,
    input.outcome === 'SUCCESS' ? 'REFUND_SUCCEEDED' : 'REFUND_FAILED',
    input.outcome === 'SUCCESS' ? '退款成功' : '退款执行失败',
    input.outcome === 'SUCCESS' ? '模拟退款成功，已记入退款金额。' : '模拟退款失败，资金保留待重试或人工处理。',
    { relatedEntityType: 'refund', relatedEntityId: id, dedupeKey: `refund:${id}:${input.outcome}` });
  res.json(result);
}));

router.post('/payment-orders/:id/forfeit', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ reason: z.string().trim().min(1).max(255) }).parse(req.body);
  const order = (await query('SELECT * FROM payment_order WHERE order_id=?', [id]))[0];
  if (!order) throw notFound('支付订单不存在');
  assertClinicAccess(req.user, order.clinic_id);
  const result = await forfeitDeposit({
    orderId: id, actorUserId: req.user.userId, reasonCode: 'MANUAL_FORFEITURE', note: input.reason, ipAddress: req.ip
  });
  res.json(result);
}));

router.get('/settlement-exceptions', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const scope = scopedClinicSql(req.user, 'a.clinic_id', req.query.clinicId || null);
  const where = [scope.sql];
  const params = [...scope.params];
  if (req.query.status) { where.push('se.status=?'); params.push(req.query.status); }
  const rows = await query(
    `SELECT se.*, s.settlement_no, s.total_amount, s.status AS settlement_status,
            a.appointment_no, p.patient_name, p.patient_no, c.clinic_no
       FROM settlement_exception se
       JOIN settlement s ON s.settlement_id=se.settlement_id
       JOIN appointment a ON a.appointment_id=se.appointment_id
       JOIN patient p ON p.patient_id=se.patient_id
       JOIN clinic c ON c.clinic_id=a.clinic_id
      WHERE ${where.join(' AND ')} ORDER BY se.detected_at DESC LIMIT 100`,
    params
  );
  res.json({ items: rows });
}));

router.post('/settlement-exceptions/:id/review', allow('CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ note: z.string().trim().min(1).max(500) }).parse(req.body);
  const exception = (await query(
    `SELECT se.*, a.clinic_id FROM settlement_exception se JOIN appointment a ON a.appointment_id=se.appointment_id WHERE se.exception_id=?`,
    [id]
  ))[0];
  if (!exception) throw notFound('结算异常不存在');
  assertClinicAccess(req.user, exception.clinic_id);
  if (!['PENDING', 'IN_REVIEW'].includes(exception.status)) throw conflict('该异常当前不能复核');
  await transaction(async (conn) => {
    await conn.execute(
      "UPDATE settlement_exception SET status='IN_REVIEW', reviewed_by_user_id=?, reviewed_at=UTC_TIMESTAMP(6), resolution_note=? WHERE exception_id=?",
      [req.user.userId, input.note, id]
    );
    await writeAudit(conn, req.user.userId, 'REVIEW_SETTLEMENT_EXCEPTION', 'settlement_exception', id, {
      beforeStatus: exception.status, afterStatus: 'IN_REVIEW', reason: input.note, ipAddress: req.ip
    });
  });
  res.json({ ok: true, status: 'IN_REVIEW', note: '资金最终处置规则尚未确认，系统已阻止自动退款/结转/释放抵扣。' });
}));

export default router;
