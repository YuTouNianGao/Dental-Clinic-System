import { query } from '../db.js';
import { dayBounds } from '../utils.js';
import { toCents } from '../money.js';

function parseUtc(value) {
  return new Date(String(value).replace(' ', 'T') + 'Z');
}

export async function getPublicAvailability({ clinicId, date, dentistId = null, qualificationId = null, durationMinutes = 30 }) {
  const range = dayBounds(date);
  const duration = Math.min(180, Math.max(15, Number(durationMinutes) || 30));
  const clinicRows = await query(
    "SELECT clinic_id, clinic_no, postal_address, phone, appointment_deposit_amount FROM clinic WHERE clinic_id=? AND status='ACTIVE'",
    [clinicId]
  );
  const clinic = clinicRows[0];
  if (!clinic) return { clinic: null, date, clinicId, durationMinutes: duration, slots: [] };

  const params = [clinicId, range.end, range.start];
  let extra = '';
  if (qualificationId) {
    extra += ' AND EXISTS (SELECT 1 FROM schedule_qualification sqf WHERE sqf.schedule_id=ds.schedule_id AND sqf.qualification_id=?)';
    params.push(Number(qualificationId));
  }
  if (dentistId) {
    extra += ' AND ds.dentist_id=?';
    params.push(Number(dentistId));
  }

  const schedules = await query(
    `SELECT ds.schedule_id, ds.dentist_id, ds.available_start_at, ds.available_end_at,
            u.display_name AS dentist_name, d.employee_no,
            GROUP_CONCAT(DISTINCT q.qualification_name ORDER BY q.qualification_name SEPARATOR '、') AS qualification_names
       FROM dentist_schedule ds
       JOIN clinic c ON c.clinic_id=ds.clinic_id AND c.status='ACTIVE'
       JOIN dentist_profile d ON d.dentist_id=ds.dentist_id
       JOIN user_account u ON u.user_id=d.user_id AND u.status='ACTIVE'
       LEFT JOIN schedule_qualification sq ON sq.schedule_id=ds.schedule_id
       LEFT JOIN qualification q ON q.qualification_id=sq.qualification_id
      WHERE ds.clinic_id=? AND ds.status='PUBLISHED'
        AND ds.available_start_at < ? AND ds.available_end_at > ?
        AND NOT EXISTS (
          SELECT 1 FROM schedule_qualification sq2
          LEFT JOIN dentist_qualification dq
            ON dq.dentist_id=ds.dentist_id AND dq.qualification_id=sq2.qualification_id
          WHERE sq2.schedule_id=ds.schedule_id
            AND (dq.verification_status IS NULL OR dq.verification_status<>'VERIFIED')
        )
        ${extra}
      GROUP BY ds.schedule_id, ds.dentist_id, ds.available_start_at, ds.available_end_at, u.display_name, d.employee_no
      ORDER BY ds.available_start_at`,
    params
  );

  const dentistIds = [...new Set(schedules.map((s) => Number(s.dentist_id)))];
  let appointments = [];
  if (dentistIds.length) {
    appointments = await query(
      `SELECT dentist_id, scheduled_start_at, scheduled_end_at
         FROM appointment
        WHERE dentist_id IN (${dentistIds.map(() => '?').join(',')})
          AND (status='SCHEDULED' OR (status='PENDING_PAYMENT' AND hold_expires_at > UTC_TIMESTAMP(6)))
          AND scheduled_start_at < ? AND scheduled_end_at > ?`,
      [...dentistIds, range.end, range.start]
    );
  }

  const now = Date.now() + 5 * 60 * 1000;
  const deposit = String(clinic.appointment_deposit_amount ?? '0.00');
  const slots = [];
  for (const schedule of schedules) {
    const bookings = appointments.filter((a) => Number(a.dentist_id) === Number(schedule.dentist_id));
    let cursor = parseUtc(schedule.available_start_at).getTime();
    const end = parseUtc(schedule.available_end_at).getTime();
    while (cursor + duration * 60000 <= end) {
      const slotEnd = cursor + duration * 60000;
      const blocked = bookings.some((a) => {
        const bs = parseUtc(a.scheduled_start_at).getTime();
        const be = parseUtc(a.scheduled_end_at).getTime();
        return cursor < be && slotEnd > bs;
      });
      if (cursor >= now && !blocked) {
        slots.push({
          scheduleId: schedule.schedule_id,
          dentistId: schedule.dentist_id,
          dentistName: schedule.dentist_name,
          employeeNo: schedule.employee_no,
          qualificationNames: schedule.qualification_names,
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(slotEnd).toISOString()
        });
      }
      cursor += 30 * 60000;
    }
  }

  return {
    clinic: {
      clinicId: Number(clinic.clinic_id),
      clinicNo: clinic.clinic_no,
      postalAddress: clinic.postal_address,
      phone: clinic.phone
    },
    date,
    clinicId: Number(clinicId),
    durationMinutes: duration,
    depositAmount: deposit,
    patientBookingEnabled: toCents(deposit) > 0n,
    slots
  };
}
