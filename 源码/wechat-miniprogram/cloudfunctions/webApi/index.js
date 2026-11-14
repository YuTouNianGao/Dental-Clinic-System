const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const SYNC_KEY = process.env.ADC_SYNC_KEY || 'adc-sync-2026';
const COLLECTIONS = [
  'clinics', 'departments', 'dentists', 'chairs', 'patients', 'treatments',
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
