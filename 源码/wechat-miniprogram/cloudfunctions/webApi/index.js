const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const SYNC_KEY = process.env.ADC_SYNC_KEY || 'adc-sync-2026';
const COLLECTIONS = [
  'clinics', 'departments', 'dentists', 'chairs', 'schedules', 'patients', 'treatments',
  'appointments', 'payment_orders', 'visits', 'settlements',
  'treatment_plans', 'treatment_plan_items',
  'tooth_records', 'recalls'
];

function reply(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-ADC-Sync-Key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

function parseBody(event) {
  if (!event) return {};
  if (event.action) return event;
  if (!event.body) return {};
  if (typeof event.body === 'object') return event.body;
  try { return JSON.parse(event.body); } catch { return {}; }
}

async function syncSchedules(items = []) {
  const stats = { created: 0, updated: 0, skipped: 0 };
  for (const item of items) {
    const clinicResult = await db.collection('clinics').where({ clinicNo: item.clinicNo }).limit(1).get();
    const clinic = clinicResult.data[0];
    if (!clinic) { stats.skipped += 1; continue; }
    let dentistResult = await db.collection('dentists')
      .where({ name: item.dentistName, clinicId: clinic._id }).limit(1).get();
    let dentist = dentistResult.data[0];
    if (!dentist) {
      dentist = await db.collection('dentists').add({
        name: item.dentistName, title: '医师', clinicId: clinic._id,
        departmentIds: ['GENERAL'], qualificationNames: '', status: 'ACTIVE', createdAt: new Date()
      });
      dentist = { _id: dentist._id };
    }
    const existingResult = await db.collection('schedules')
      .where({ sourceId: item.webScheduleId }).limit(1).get();
    const existing = existingResult.data[0];
    if (item.status === 'CANCELLED' && !existing) { stats.skipped += 1; continue; }
    let chairResult = await db.collection('chairs')
      .where({ clinicId: clinic._id, status: 'ACTIVE' }).orderBy('chairNo', 'asc').get();
    let chairs = chairResult.data || [];
    if (!chairs.length) {
      for (let n = 1; n <= 6; n += 1) {
        await db.collection('chairs').add({ data: { clinicId: clinic._id, chairNo: `C${n}`, name: `${n} 号牙椅`, status: 'ACTIVE', createdAt: new Date() } });
      }
      chairResult = await db.collection('chairs')
        .where({ clinicId: clinic._id, status: 'ACTIVE' }).orderBy('chairNo', 'asc').get();
      chairs = chairResult.data || [];
    }
    let chair = existing && chairs.find((c) => c._id === existing.chairId);
    if (!chair && chairs.length) {
      const sameDay = await db.collection('schedules')
        .where({ clinicId: clinic._id, date: item.date }).limit(100).get();
      chair = chairs.find((c) => !sameDay.data.some((s) =>
        s._id !== (existing && existing._id) &&
        s.chairId === c._id &&
        s.status !== 'CANCELLED' &&
        item.startMinute < s.endMinute && item.endMinute > s.startMinute
      ));
    }
    if (!chair) { stats.skipped += 1; continue; }
    const data = {
      clinicId: clinic._id, clinicNo: clinic.clinicNo, clinicName: clinic.name,
      dentistId: dentist._id, dentistName: item.dentistName,
      chairId: chair._id, chairNo: chair.chairNo,
      date: item.date, startMinute: Number(item.startMinute), endMinute: Number(item.endMinute),
      durationMinutes: 30, status: item.status,
      sourceId: item.webScheduleId, webDentistId: item.webDentistId,
      updatedAt: new Date()
    };
    if (existing) {
      await db.collection('schedules').doc(existing._id).update({ data });
      stats.updated += 1;
    } else {
      await db.collection('schedules').add({ data: { ...data, createdAt: new Date() } });
      stats.created += 1;
    }
  }
  return stats;
}

async function snapshot() {
  const result = {};
  for (const name of COLLECTIONS) {
    try {
      const res = await db.collection(name).limit(100).get();
      result[name] = res.data || [];
    } catch (error) {
      result[name] = [];
    }
  }
  return result;
}

exports.main = async (event = {}) => {
  const headers = event.headers || {};
  const method = String(event.httpMethod || event.method || 'POST').toUpperCase();
  if (method === 'OPTIONS') return reply(204, {});
  if (method !== 'POST') return reply(405, { ok: false, message: 'POST only' });
  const provided = headers['x-adc-sync-key'] || headers['X-ADC-Sync-Key'] || '';
  if (provided !== SYNC_KEY) return reply(401, { ok: false, message: 'invalid sync key' });

  const body = parseBody(event);
  const action = String(body.action || 'health');
  try {
    if (action === 'health') {
      return reply(200, { ok: true, service: 'webApi', env: cloud.DYNAMIC_CURRENT_ENV, time: new Date().toISOString() });
    }
    if (action === 'pull') {
      return reply(200, { ok: true, data: await snapshot(), pulledAt: new Date().toISOString() });
    }
    if (action === 'syncSchedules') {
      const stats = await syncSchedules(body.items || []);
      return reply(200, { ok: true, data: stats });
    }
    if (action === 'updateAppointmentStatus') {
      const allowed = ['SCHEDULED', 'CANCELLED', 'ATTENDED', 'NO_SHOW'];
      if (!body.id || !allowed.includes(body.status)) return reply(400, { ok: false, message: 'invalid appointment status' });
      const doc = await db.collection('appointments').doc(body.id).get();
      if (!doc.data) return reply(404, { ok: false, message: 'appointment not found' });
      await db.collection('appointments').doc(body.id).update({ data: { status: body.status, updatedAt: new Date() } });
      return reply(200, { ok: true, data: { id: body.id, status: body.status } });
    }
    if (action === 'counts') {
      const data = {};
      for (const name of COLLECTIONS) {
        try { data[name] = (await db.collection(name).count()).total; } catch { data[name] = 0; }
      }
      return reply(200, { ok: true, data });
    }
    return reply(400, { ok: false, message: 'unknown action: ' + action });
  } catch (error) {
    return reply(500, { ok: false, message: error.message || 'webApi error' });
  }
};
