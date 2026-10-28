import { transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { conflict, notFound } from '../errors.js';
import { makeNo } from '../utils.js';
import { fromCents, toCents } from '../money.js';
import {
  assertNoAppointmentConflict,
  assertScheduleQualifications,
  assertWindowInsideSchedule,
  lockPublishedSchedule
} from './appointmentService.js';
import { closeOrderForCancellation, createRefund } from './paymentService.js';

const HOLD_MINUTES = 15;

function parseUtc(value) {
  if (!value) return null;
  return new Date(String(value).replace(' ', 'T') + 'Z');
}

export async function createPatientAppointment({
  patientId, patientUserId, scheduleId, start, end, expectedTreatment, ipAddress
}) {
  return transaction(async (conn) => {
    const schedule = await lockPublishedSchedule(conn, scheduleId);
    const [clinics] = await conn.execute(
      "SELECT appointment_deposit_amount, status FROM clinic WHERE clinic_id=? FOR UPDATE",
      [schedule.clinic_id]
    );
    const clinic = clinics[0];
    if (!clinic || clinic.status !== 'ACTIVE') throw conflict('诊所已停用');
    const deposit = toCents(clinic.appointment_deposit_amount);
    if (deposit <= 0n) throw conflict('该诊所未开放患者自助预约（预约金为 0）');

    assertWindowInsideSchedule(schedule, start, end);
    await assertScheduleQualifications(conn, schedule.schedule_id, schedule.dentist_id);

    const [patients] = await conn.execute(
      "SELECT * FROM patient WHERE patient_id=? AND status='ACTIVE' FOR UPDATE",
      [patientId]
    );
    if (!patients[0]) throw conflict('患者档案不存在或已停用');

    await assertNoAppointmentConflict(conn, { dentistId: schedule.dentist_id, start, end });

    const appointmentNo = makeNo('APT');
    const [appointmentResult] = await conn.execute(
      `INSERT INTO appointment
        (appointment_no, patient_id, dentist_id, clinic_id, schedule_id, scheduled_start_at, scheduled_end_at,
         expected_treatment, status, payment_required, hold_expires_at, booking_channel, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', 1,
               DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ${HOLD_MINUTES} MINUTE), 'PATIENT_SELF_SERVICE', ?)`,
      [appointmentNo, patientId, schedule.dentist_id, schedule.clinic_id, schedule.schedule_id,
       start, end, expectedTreatment, patientUserId]
    );
    const appointmentId = appointmentResult.insertId;
    await conn.execute(
      "INSERT INTO patient_clinic_relation (patient_id, clinic_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE patient_id=patient_id",
      [patientId, schedule.clinic_id]
    );

    const orderNo = makeNo('PAY');
    const [orderResult] = await conn.execute(
      `INSERT INTO payment_order
        (order_no, patient_id, clinic_id, appointment_id, order_type, amount, status,
         idempotency_key, expires_at, description)
       VALUES (?, ?, ?, ?, 'APPOINTMENT_DEPOSIT', ?, 'PENDING_PAYMENT', ?,
               DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ${HOLD_MINUTES} MINUTE), ?)`,
      [orderNo, patientId, schedule.clinic_id, appointmentId, fromCents(deposit),
       `APT:${appointmentId}:DEPOSIT`, '患者自助预约金']
    );

    await writeAudit(conn, patientUserId, 'CREATE', 'appointment', appointmentId, {
      afterStatus: 'PENDING_PAYMENT', relatedEntityId: schedule.clinic_id,
      details: {
        appointmentNo, patientId, dentistId: schedule.dentist_id, start, end,
        deposit: fromCents(deposit), bookingChannel: 'PATIENT_SELF_SERVICE'
      }, ipAddress
    });
    await writeAudit(conn, patientUserId, 'CREATE_PAYMENT_ORDER', 'payment_order', orderResult.insertId, {
      afterStatus: 'PENDING_PAYMENT', relatedEntityId: appointmentId,
      details: { orderNo, amount: fromCents(deposit), orderType: 'APPOINTMENT_DEPOSIT' }, ipAddress
    });

    const [orders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=?', [orderResult.insertId]);
    const [appointments] = await conn.execute('SELECT * FROM appointment WHERE appointment_id=?', [appointmentId]);
    return { appointment: appointments[0], order: orders[0] };
  });
}

export async function cancelPatientAppointment({ appointmentId, patientId, patientUserId, reason, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM appointment WHERE appointment_id=? FOR UPDATE', [appointmentId]);
    const appointment = rows[0];
    if (!appointment || Number(appointment.patient_id) !== Number(patientId)) throw notFound('预约不存在');
    if (!['PENDING_PAYMENT', 'SCHEDULED'].includes(appointment.status)) throw conflict('当前预约不能取消');

    const [orderRows] = await conn.execute(
      "SELECT * FROM payment_order WHERE appointment_id=? AND order_type='APPOINTMENT_DEPOSIT' FOR UPDATE",
      [appointmentId]
    );
    const order = orderRows[0] || null;

    const seconds = Math.floor((new Date(String(appointment.scheduled_start_at).replace(' ', 'T') + 'Z').getTime() - Date.now()) / 1000);
    const early = seconds >= 86400;
    let refund = null;
    let refundEligible = 0;
    let refundAmount = '0.00';

    if (appointment.status === 'PENDING_PAYMENT') {
      await closeOrderForCancellation(conn, order);
      await conn.execute(
        "UPDATE appointment SET status='CANCELLED', cancellation_reason=?, cancellation_initiator='PATIENT' WHERE appointment_id=?",
        [reason, appointmentId]
      );
    } else {
      const wasPaid = order && order.status === 'PAID';
      if (wasPaid && early) {
        refundEligible = 1;
        refundAmount = fromCents(toCents(order.amount_paid) - toCents(order.amount_applied) - toCents(order.amount_refunded) - toCents(order.amount_refund_reserved));
        const change = await insertChange(conn, appointment, {
          type: 'CANCEL', reason, initiator: 'PATIENT', actorUserId: patientUserId,
          causeCode: 'PATIENT_EARLY_24H', seconds, refundEligible: 1, refundAmount
        });
        if (toCents(refundAmount) > 0n) {
          refund = await createRefund(conn, {
            order, amount: refundAmount, reasonCode: 'PATIENT_EARLY_CANCEL', reasonText: reason,
            requestedByType: 'PATIENT', requestedByUserId: patientUserId,
            idempotencyKey: `CANCEL:${change.changeId}`, refundKey: `CANCEL:${change.changeId}`,
            appointmentId, appointmentChangeId: change.changeId, ipAddress
          });
        }
      } else if (wasPaid && !early) {
        await conn.execute(
          "UPDATE payment_order SET status='FORFEITED', amount_refund_reserved=0, forfeited_at=UTC_TIMESTAMP(6), forfeited_reason_code='PATIENT_LATE_CANCEL' WHERE order_id=?",
          [order.order_id]
        );
        await insertChange(conn, appointment, {
          type: 'CANCEL', reason, initiator: 'PATIENT', actorUserId: patientUserId,
          causeCode: 'PATIENT_LATE_24H', seconds, refundEligible: 0, refundAmount: '0.00'
        });
        await writeAudit(conn, patientUserId, 'FORFEIT_DEPOSIT', 'payment_order', order.order_id, {
          beforeStatus: 'PAID', afterStatus: 'FORFEITED', reason: '患者不足 24 小时取消',
          relatedEntityId: appointmentId, ipAddress
        });
      } else {
        await closeOrderForCancellation(conn, order);
        await insertChange(conn, appointment, {
          type: 'CANCEL', reason, initiator: 'PATIENT', actorUserId: patientUserId,
          causeCode: 'PATIENT_CANCEL_NO_DEPOSIT', seconds, refundEligible: 0, refundAmount: '0.00'
        });
      }
      await conn.execute(
        "UPDATE appointment SET status='CANCELLED', cancellation_reason=?, cancellation_initiator='PATIENT' WHERE appointment_id=?",
        [reason, appointmentId]
      );
    }

    return { ok: true, refundEligible: Boolean(refundEligible), refundAmount, refund, secondsBeforeStart: seconds };
  });
}

async function insertChange(conn, appointment, { type, reason, initiator, actorUserId, causeCode, seconds, refundEligible, refundAmount }) {
  const [result] = await conn.execute(
    `INSERT INTO appointment_change
      (original_appointment_id, change_type, reason, initiator_party, handled_by_user_id,
       cause_code, seconds_before_start, refund_eligible, refund_amount, rule_evaluated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
    [appointment.appointment_id, type, reason, initiator, actorUserId, causeCode, seconds, refundEligible ? 1 : 0, refundAmount]
  );
  return { changeId: result.insertId };
}

export async function findAppointmentOrders(appointmentId) {
  const { query } = await import('../db.js');
  return query('SELECT * FROM payment_order WHERE appointment_id=? ORDER BY created_at DESC', [appointmentId]);
}

export { parseUtc };
