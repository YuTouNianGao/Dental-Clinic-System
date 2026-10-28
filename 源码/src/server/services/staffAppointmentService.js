import { transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { assertClinicAccess } from '../auth.js';
import { conflict } from '../errors.js';
import { makeNo } from '../utils.js';
import {
  assertNoAppointmentConflict,
  assertScheduleQualifications,
  assertWindowInsideSchedule,
  lockPublishedSchedule,
  validatePatientAndRelation
} from './appointmentService.js';

export async function createStaffAppointment({ user, patientId, scheduleId, start, end, expectedTreatment, ipAddress }) {
  return transaction(async (conn) => {
    const schedule = await lockPublishedSchedule(conn, scheduleId);
    assertClinicAccess(user, schedule.clinic_id);
    assertWindowInsideSchedule(schedule, start, end);
    await assertScheduleQualifications(conn, schedule.schedule_id, schedule.dentist_id);
    await validatePatientAndRelation(conn, patientId);
    await assertNoAppointmentConflict(conn, { dentistId: schedule.dentist_id, start, end });
    const appointmentNo = makeNo('APT');
    const [result] = await conn.execute(
      `INSERT INTO appointment
        (appointment_no, patient_id, dentist_id, clinic_id, schedule_id, scheduled_start_at, scheduled_end_at,
         expected_treatment, status, booking_channel, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', 'STAFF', ?)`,
      [appointmentNo, patientId, schedule.dentist_id, schedule.clinic_id, schedule.schedule_id, start, end, expectedTreatment, user.userId]
    );
    await conn.execute(
      'INSERT INTO patient_clinic_relation (patient_id, clinic_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE patient_id=patient_id',
      [patientId, schedule.clinic_id]
    );
    await writeAudit(conn, user.userId, 'CREATE', 'appointment', result.insertId, {
      afterStatus: 'SCHEDULED', relatedEntityId: schedule.clinic_id,
      details: { appointmentNo, patientId, bookingChannel: 'STAFF' }, ipAddress
    });
    return { appointmentId: result.insertId, appointmentNo, clinicId: schedule.clinic_id };
  });
}

export async function cancelStaffAppointmentForReschedule({ user, appointmentId, reason, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM appointment WHERE appointment_id=? FOR UPDATE', [appointmentId]);
    const appointment = rows[0];
    if (!appointment) throw conflict('预约不存在');
    assertClinicAccess(user, appointment.clinic_id);
    if (appointment.status !== 'SCHEDULED') throw conflict('只有待就诊预约可以改期');
    const [orders] = await conn.execute(
      "SELECT order_id FROM payment_order WHERE appointment_id=? AND order_type='APPOINTMENT_DEPOSIT' LIMIT 1",
      [appointmentId]
    );
    if (orders.length) {
      throw conflict('该预约含患者预约金，不能由员工直接改期；请先取消原预约并由患者重新自助预约');
    }
    await conn.execute(
      "UPDATE appointment SET status='CANCELLED', cancellation_reason=?, cancellation_initiator='CLINIC' WHERE appointment_id=?",
      [reason, appointmentId]
    );
    const [change] = await conn.execute(
      `INSERT INTO appointment_change
        (original_appointment_id, change_type, reason, initiator_party, handled_by_user_id,
         cause_code, rule_evaluated_at)
       VALUES (?, 'CANCEL', ?, 'CLINIC', ?, 'STAFF_RESCHEDULE', UTC_TIMESTAMP(6))`,
      [appointmentId, reason, user.userId]
    );
    await writeAudit(conn, user.userId, 'CANCEL', 'appointment', appointmentId, {
      beforeStatus: 'SCHEDULED', afterStatus: 'CANCELLED', reason,
      relatedEntityId: appointment.clinic_id, details: { cause: 'STAFF_RESCHEDULE', changeId: change.insertId }, ipAddress
    });
    return {
      cancelledAppointmentId: appointmentId,
      patientId: appointment.patient_id,
      clinicId: appointment.clinic_id
    };
  });
}
