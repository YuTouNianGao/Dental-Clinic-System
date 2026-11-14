import { query } from './db.js';
import { cloudAction } from './cloudBridge.js';

function shanghaiDateTime(value) {
  const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute'))
  };
}

export async function syncSchedulesToCloud() {
  const rows = await query(
    `SELECT ds.schedule_id, ds.dentist_id, ds.clinic_id, ds.available_start_at, ds.available_end_at,
            ds.status, c.clinic_no, u.display_name AS dentist_name
       FROM dentist_schedule ds
       JOIN clinic c ON c.clinic_id = ds.clinic_id
       JOIN dentist_profile d ON d.dentist_id = ds.dentist_id
       JOIN user_account u ON u.user_id = d.user_id
      WHERE ds.status IN ('DRAFT','PUBLISHED','CANCELLED')
      ORDER BY ds.available_start_at`
  );
  const items = rows.map((row) => {
    const start = shanghaiDateTime(row.available_start_at);
    const end = shanghaiDateTime(row.available_end_at);
    return {
      webScheduleId: String(row.schedule_id),
      webDentistId: String(row.dentist_id),
      clinicNo: row.clinic_no,
      dentistName: row.dentist_name,
      date: start.date,
      startMinute: start.minute,
      endMinute: end.minute,
      status: row.status
    };
  });
  return cloudAction('syncSchedules', { items });
}
