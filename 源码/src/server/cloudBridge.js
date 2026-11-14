import https from 'node:https';
import { URL } from 'node:url';

const CACHE_MS = 15000;
let cache = { at: 0, data: null };

export function cloudConfigured() {
  return Boolean(process.env.CLOUD_API_URL && process.env.CLOUD_SYNC_KEY);
}

export async function cloudAction(action, data = {}) {
  if (!cloudConfigured()) throw new Error('CloudBase bridge is not configured');
  const url = new URL(process.env.CLOUD_API_URL);
  const body = Buffer.from(JSON.stringify({ action, ...data }));
  const payload = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'X-ADC-Sync-Key': process.env.CLOUD_SYNC_KEY
      },
      timeout: 15000
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          const parsed = JSON.parse(text);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || `CloudBase HTTP ${res.statusCode}`));
        } catch {
          reject(new Error(text.slice(0, 200) || `CloudBase HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('CloudBase request timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  return payload;
}

export async function cloudOverview(force = false) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) return { ...cache.data, cached: true };
  const payload = await cloudAction('pull');
  if (!payload?.ok) throw new Error(payload?.message || 'CloudBase pull failed');
  const data = payload.data || {};
  const patients = (data.patients || []).map((p) => ({
    id: p._id, name: p.name, phone: p.phone, gender: p.gender, age: p.age,
    patientNo: p.patientNo, createdAt: p.createdAt
  })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const appointments = (data.appointments || []).map((a) => ({
    id: a._id, no: a.appointmentNo, patientName: a.patientName, clinicName: a.clinicName,
    dentistName: a.dentistName, date: a.date, startMinute: a.startMinute, endMinute: a.endMinute,
    status: a.status
  }));
  const orders = (data.payment_orders || []).map((o) => ({
    id: o._id, no: o.orderNo, patientName: o.patientName, type: o.type, amountCents: o.amountCents,
    status: o.status, createdAt: o.createdAt
  }));
  const plans = (data.treatment_plans || []).map((p) => ({
    id: p._id, no: p.planNo, patientName: p.patientName, title: p.title, status: p.status,
    totalCents: (data.treatment_plan_items || []).filter((i) => i.planId === p._id)
      .reduce((sum, i) => sum + Number(i.unitPriceCents || 0) * Number(i.quantity || 1), 0)
  }));
  const result = {
    patients,
    appointments,
    orders,
    plans,
    counts: {
      patients: patients.length,
      appointments: appointments.length,
      orders: orders.length,
      plans: plans.length,
      visits: (data.visits || []).length,
      recalls: (data.recalls || []).length
    },
    pulledAt: payload.pulledAt || new Date().toISOString(),
    cached: false
  };
  cache = { at: Date.now(), data: result };
  return result;
}
