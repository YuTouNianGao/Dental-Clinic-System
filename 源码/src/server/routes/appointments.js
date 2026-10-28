import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { allow, assertClinicAccess, scopedClinicSql } from '../auth.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { asId, dayBounds, makeNo, nowUtcSql, paged, parsePagination, shanghaiToday, toUtcSql } from '../utils.js';
import { fromCents, toCents } from '../money.js';
import { assertNoAppointmentConflict, assertScheduleQualifications, assertWindowInsideSchedule, lockPublishedSchedule, validatePatientAndRelation } from '../services/appointmentService.js';
import { approveRefund, closeOrderForCancellation, createRefund, forfeitDeposit, processRefundMock } from '../services/paymentService.js';
import { cancelStaffAppointmentForReschedule, createStaffAppointment } from '../services/staffAppointmentService.js';
import { notifyPatient } from '../services/notificationService.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const scope = scopedClinicSql(req.user, 'a.clinic_id', req.query.clinicId || null);
  const where = [scope.sql];
  const params = [...scope.params];
  if (req.user.role === 'DENTIST') { where.push('a.dentist_id=?'); params.push(req.user.dentistId); }
  if (req.query.dentistId) { where.push('a.dentist_id=?'); params.push(Number(req.query.dentistId)); }
  if (req.query.patientId) { where.push('a.patient_id=?'); params.push(Number(req.query.patientId)); }
  if (req.query.status) { where.push('a.status=?'); params.push(req.query.status); }
  if (req.query.date) {
    const b = dayBounds(req.query.date);
    where.push('a.scheduled_start_at>=? AND a.scheduled_start_at<?');
    params.push(b.start, b.end);
  }
  if (req.query.from) { where.push('a.scheduled_start_at>=?'); params.push(dayBounds(req.query.from).start); }
  if (req.query.to) { where.push('a.scheduled_start_at<?'); params.push(dayBounds(req.query.to).end); }
  if (req.query.q) {
    where.push('(a.appointment_no LIKE ? OR p.patient_name LIKE ? OR p.patient_no LIKE ? OR p.phone LIKE ?)');
    const term = '%' + String(req.query.q).trim() + '%';
    params.push(term, term, term, term);
  }
  const condition = where.join(' AND ');
  const count = (await query(
    "SELECT COUNT(*) AS total FROM appointment a JOIN patient p ON p.patient_id=a.patient_id WHERE " + condition,
    params
  ))[0].total;
  const items = await query(
    "SELECT a.*, p.patient_name, p.patient_no, p.phone AS patient_phone, c.clinic_no, c.postal_address, "
    + "u.display_name AS dentist_name, d.employee_no, v.visit_id, v.visit_no, v.status AS visit_status, "
    + "s.settlement_id, s.settlement_no, s.total_amount, s.status AS settlement_status "
    + "FROM appointment a JOIN patient p ON p.patient_id=a.patient_id JOIN clinic c ON c.clinic_id=a.clinic_id "
    + "JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id "
    + "LEFT JOIN visit v ON v.appointment_id=a.appointment_id "
    + "LEFT JOIN settlement s ON s.visit_id=v.visit_id AND s.status='ACTIVE' "
    + "WHERE " + condition + " ORDER BY a.scheduled_start_at DESC LIMIT ? OFFSET ?",
    [...params, pageSize, offset]
  );
  res.json(paged(items, Number(count), page, pageSize));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const appointment = (await query(
    "SELECT a.*, p.patient_name, p.patient_no, p.phone AS patient_phone, p.birth_date, c.clinic_no, c.postal_address, u.display_name AS dentist_name, d.employee_no "
    + "FROM appointment a JOIN patient p ON p.patient_id=a.patient_id JOIN clinic c ON c.clinic_id=a.clinic_id "
    + "JOIN dentist_profile d ON d.dentist_id=a.dentist_id JOIN user_account u ON u.user_id=d.user_id WHERE a.appointment_id=?",
    [id]
  ))[0];
  if (!appointment) throw notFound('预约不存在');
  assertClinicAccess(req.user, appointment.clinic_id);
  const [changes, visit, allergies] = await Promise.all([
    query("SELECT ac.*, u.display_name AS handler_name FROM appointment_change ac JOIN user_account u ON u.user_id=ac.handled_by_user_id WHERE ac.original_appointment_id=? ORDER BY ac.changed_at", [id]),
    query("SELECT * FROM visit WHERE appointment_id=?", [id]),
    query("SELECT * FROM patient_allergy WHERE patient_id=? ORDER BY confirmation_status, allergy_name", [appointment.patient_id])
  ]);
  res.json({ appointment, changes, visit: visit[0] || null, allergies });
}));

const createSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  scheduleId: z.coerce.number().int().positive(),
  startAt: z.string().min(10),
  endAt: z.string().min(10),
  expectedTreatment: z.string().trim().min(1).max(500)
});

router.post('/', allow('FRONT_DESK','CLINIC_MANAGER','HQ_MANAGER'), asyncHandler(async (req, res) => {
  const input = createSchema.parse(req.body);
  const start = toUtcSql(input.startAt);
  const end = toUtcSql(input.endAt);
  const appointmentId = await transaction(async (conn) => {
    const schedule = await lockPublishedSchedule(conn, input.scheduleId);
    assertClinicAccess(req.user, schedule.clinic_id);
    assertWindowInsideSchedule(schedule, start, end);
    await assertScheduleQualifications(conn, schedule.schedule_id, schedule.dentist_id);
    await validatePatientAndRelation(conn, input.patientId);
    await assertNoAppointmentConflict(conn, { dentistId: schedule.dentist_id, start, end });
    const appointmentNo = makeNo('APT');
    const [result] = await conn.execute(
      "INSERT INTO appointment (appointment_no, patient_id, dentist_id, clinic_id, schedule_id, scheduled_start_at, scheduled_end_at, expected_treatment, status, booking_channel, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', 'STAFF', ?)",
      [appointmentNo, input.patientId, schedule.dentist_id, schedule.clinic_id, schedule.schedule_id, start, end, input.expectedTreatment, req.user.userId]
    );
    await conn.execute("INSERT INTO patient_clinic_relation (patient_id, clinic_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE patient_id=patient_id", [input.patientId, schedule.clinic_id]);
    await writeAudit(conn, req.user.userId, 'CREATE', 'appointment', result.insertId, {
      afterStatus: 'SCHEDULED', relatedEntityId: schedule.clinic_id,
      details: { appointmentNo, patientId: input.patientId, dentistId: schedule.dentist_id, start, end }, ipAddress: req.ip
    });
    return result.insertId;
  });
  res.status(201).json({ appointmentId });
}));

router.post('/:id/cancel', allow('FRONT_DESK','CLINIC_MANAGER','HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({ reason: z.string().trim().min(1).max(255) }).parse(req.body);
  const outcome = await transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM appointment WHERE appointment_id=? FOR UPDATE', [id]);
    const appointment = rows[0];
    if (!appointment) throw notFound('预约不存在');
    assertClinicAccess(req.user, appointment.clinic_id);
    if (!['SCHEDULED', 'PENDING_PAYMENT'].includes(appointment.status)) throw conflict('当前预约不能取消');

    const [orderRows] = await conn.execute(
      "SELECT * FROM payment_order WHERE appointment_id=? AND order_type='APPOINTMENT_DEPOSIT' FOR UPDATE",
      [id]
    );
    const order = orderRows[0] || null;
    if (req.user.role === 'FRONT_DESK' && appointment.status === 'SCHEDULED' && order && order.status === 'PAID') {
      throw forbidden('已支付预约的诊所取消需要主管或总部审批');
    }
    let refund = null;
    if (appointment.status === 'PENDING_PAYMENT') {
      await closeOrderForCancellation(conn, order);
    } else if (order && order.status === 'PAID') {
      const refundCents = toCents(order.amount_paid) - toCents(order.amount_applied) - toCents(order.amount_refunded) - toCents(order.amount_refund_reserved);
      if (refundCents > 0n) {
        refund = await createRefund(conn, {
          order, amount: fromCents(refundCents), reasonCode: 'CLINIC_CANCEL', reasonText: input.reason,
          requestedByType: 'SYSTEM', requestedByUserId: null,
          idempotencyKey: `CLINIC_CANCEL:${id}`, refundKey: `CLINIC_CANCEL:${id}`,
          appointmentId: id, ipAddress: req.ip
        });
      }
    }

    const seconds = Math.floor((new Date(String(appointment.scheduled_start_at).replace(' ', 'T') + 'Z').getTime() - Date.now()) / 1000);
    await conn.execute(
      "UPDATE appointment SET status='CANCELLED', cancellation_reason=?, cancellation_initiator='CLINIC' WHERE appointment_id=?",
      [input.reason, id]
    );
    await conn.execute(
      `INSERT INTO appointment_change
        (original_appointment_id, change_type, reason, initiator_party, handled_by_user_id,
         cause_code, seconds_before_start, refund_eligible, refund_amount, rule_evaluated_at)
       VALUES (?, 'CANCEL', ?, 'CLINIC', ?, 'CLINIC_CANCEL', ?, 1, ?, UTC_TIMESTAMP(6))`,
      [id, input.reason, req.user.userId, seconds, refund ? refund.amount : '0.00']
    );
    await writeAudit(conn, req.user.userId, 'CANCEL', 'appointment', id, {
      beforeStatus: appointment.status, afterStatus: 'CANCELLED', reason: input.reason,
      relatedEntityId: appointment.clinic_id, details: { cause: 'CLINIC_CANCEL', refundId: refund?.refund_id || null }, ipAddress: req.ip
    });
    return { refund, patientId: appointment.patient_id };
  });

  if (outcome.refund) {
    try {
      await approveRefund({ refundId: outcome.refund.refund_id, reviewerUserId: req.user.userId, note: '诊所主动取消自动审批', ipAddress: req.ip });
      await processRefundMock({ refundId: outcome.refund.refund_id, processorUserId: req.user.userId, outcome: 'SUCCESS', ipAddress: req.ip });
    } catch (error) {
      console.error('Clinic cancellation refund processing failed:', error.message);
    }
  }
  await notifyPatient(outcome.patientId, 'APPOINTMENT_CANCELLED', '诊所已取消预约',
    '诊所主动取消了本次预约，预约金退款将按模拟流程处理。',
    { relatedEntityType: 'appointment', relatedEntityId: id, dedupeKey: `appointment:${id}:clinic-cancelled` });
  let refund = null;
  if (outcome.refund) {
    const refundRows = await query('SELECT * FROM refund WHERE refund_id=?', [outcome.refund.refund_id]);
    refund = refundRows[0] || null;
  }
  res.json({ ok: true, refund });
}));

const rescheduleSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
  startAt: z.string().min(10),
  endAt: z.string().min(10),
  reason: z.string().trim().min(1).max(255),
  initiator: z.enum(['PATIENT','CLINIC']).default('PATIENT'),
  expectedTreatment: z.string().trim().min(1).max(500).optional()
});

router.post('/:id/reschedule', allow('FRONT_DESK','CLINIC_MANAGER','HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = rescheduleSchema.parse(req.body);
  const start = toUtcSql(input.startAt);
  const end = toUtcSql(input.endAt);
  const originalRows = await query('SELECT * FROM appointment WHERE appointment_id=?', [id]);
  const original = originalRows[0];
  if (!original) throw notFound('预约不存在');
  if (Number(original.schedule_id) === input.scheduleId && start === original.scheduled_start_at && end === original.scheduled_end_at) {
    throw badRequest('新预约时段与原预约相同');
  }

  // Business rule: staff rescheduling is cancel-old + create-new in two
  // independent transactions. A failed new booking must not silently restore
  // the old appointment.
  const cancelled = await cancelStaffAppointmentForReschedule({
    user: req.user, appointmentId: id, reason: input.reason, ipAddress: req.ip
  });
  try {
    const created = await createStaffAppointment({
      user: req.user,
      patientId: cancelled.patientId,
      scheduleId: input.scheduleId,
      start,
      end,
      expectedTreatment: input.expectedTreatment || original.expected_treatment,
      ipAddress: req.ip
    });
    res.json({ newAppointmentId: created.appointmentId, cancelledAppointmentId: id });
  } catch (error) {
    throw conflict('原预约已取消，但新预约创建失败；请重新选择时段', {
      cancelledAppointmentId: id,
      reason: error.message
    });
  }
}));

router.post('/:id/attend', allow('FRONT_DESK','CLINIC_MANAGER','HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const input = z.object({
    patientProblem: z.string().trim().max(1000).optional(),
    specialNeeds: z.string().trim().max(1000).nullable().optional()
  }).parse(req.body);
  const visitId = await transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM appointment WHERE appointment_id=? FOR UPDATE', [id]);
    const appointment = rows[0];
    if (!appointment) throw notFound('预约不存在');
    assertClinicAccess(req.user, appointment.clinic_id);
    if (appointment.status !== 'SCHEDULED') throw conflict('只有待就诊预约可以登记到诊');
    const [existingVisits] = await conn.execute('SELECT visit_id FROM visit WHERE appointment_id=?', [id]);
    if (existingVisits.length) throw conflict('该预约已生成就诊记录', { visitId: existingVisits[0].visit_id });
    const at = nowUtcSql();
    await conn.execute(
      "UPDATE appointment SET status='ATTENDED', attendance_recorded_by_user_id=?, attendance_recorded_at=? WHERE appointment_id=?",
      [req.user.userId, at, id]
    );
    const visitNo = makeNo('VIS');
    const [result] = await conn.execute(
      "INSERT INTO visit (visit_no, appointment_id, visit_datetime, patient_problem, special_needs, status) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS')",
      [visitNo, id, at, input.patientProblem || appointment.expected_treatment, input.specialNeeds || null]
    );
    await writeAudit(conn, req.user.userId, 'ATTEND', 'appointment', id, {
      beforeStatus: 'SCHEDULED', afterStatus: 'ATTENDED', relatedEntityId: result.insertId,
      details: { visitNo, patientId: appointment.patient_id }, ipAddress: req.ip
    });
    return result.insertId;
  });
  res.json({ visitId });
}));

router.post('/:id/no-show', allow('FRONT_DESK','CLINIC_MANAGER','HQ_MANAGER'), asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const reason = z.object({ reason: z.string().trim().max(255).optional() }).parse(req.body).reason;
  const patientId = await transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM appointment WHERE appointment_id=? FOR UPDATE', [id]);
    const appointment = rows[0];
    if (!appointment) throw notFound('预约不存在');
    assertClinicAccess(req.user, appointment.clinic_id);
    if (appointment.status !== 'SCHEDULED') throw conflict('只有待就诊预约可以标记未到诊');
    const [orders] = await conn.execute(
      "SELECT * FROM payment_order WHERE appointment_id=? AND order_type='APPOINTMENT_DEPOSIT' FOR UPDATE",
      [id]
    );
    if (orders[0] && orders[0].status === 'PAID') {
      await conn.execute(
        "UPDATE payment_order SET status='FORFEITED', amount_refund_reserved=0, forfeited_at=UTC_TIMESTAMP(6), forfeited_reason_code='NO_SHOW', forfeited_by_user_id=? WHERE order_id=?",
        [req.user.userId, orders[0].order_id]
      );
      await writeAudit(conn, req.user.userId, 'FORFEIT_DEPOSIT', 'payment_order', orders[0].order_id, {
        beforeStatus: 'PAID', afterStatus: 'FORFEITED', reason: 'No-show',
        relatedEntityId: id, ipAddress: req.ip
      });
    }
    await conn.execute(
      "UPDATE appointment SET status='NO_SHOW', cancellation_reason=?, attendance_recorded_by_user_id=?, attendance_recorded_at=? WHERE appointment_id=?",
      [reason || null, req.user.userId, nowUtcSql(), id]
    );
    await writeAudit(conn, req.user.userId, 'NO_SHOW', 'appointment', id, {
      beforeStatus: 'SCHEDULED', afterStatus: 'NO_SHOW', reason: reason || null, ipAddress: req.ip
    });
    return appointment.patient_id;
  });
  await notifyPatient(patientId, 'APPOINTMENT_CANCELLED', '预约未到诊',
    '本次预约已登记未到诊，预约金按规则处理。',
    { relatedEntityType: 'appointment', relatedEntityId: id, dedupeKey: `appointment:${id}:no-show` });
  res.json({ ok: true });
}));

export default router;
