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
    id: o._id, no: o.no || o.orderNo, patientName: o.patientName, type: o.type, amountCents: o.amountCents,
    paidCents: o.paidCents || 0, refundedCents: o.refundedCents || 0,
    status: o.status, createdAt: o.createdAt
  }));
  const transactions = (data.payment_transactions || []).map((t) => ({
    id: t._id, orderId: t.orderId, orderNo: t.orderNo, patientName: t.patientName,
    amountCents: t.amountCents, type: t.type, method: t.method, status: t.status, createdAt: t.createdAt
  })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const refunds = (data.refunds || []).map((r) => ({
    id: r._id, orderId: r.orderId, orderNo: r.orderNo, patientName: r.patientName,
    amountCents: r.amountCents, reason: r.reason, status: r.status, createdAt: r.createdAt
  })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const plans = (data.treatment_plans || []).map((p) => ({
    id: p._id, no: p.planNo, patientName: p.patientName, title: p.title, status: p.status,
    totalCents: (data.treatment_plan_items || []).filter((i) => i.planId === p._id)
      .reduce((sum, i) => sum + Number(i.unitPriceCents || 0) * Number(i.quantity || 1), 0)
  }));
  const collectedCents = orders.reduce((sum, o) => sum + Number(o.paidCents || 0), 0);
  const refundedCents = refunds.reduce((sum, r) => sum + Number(r.amountCents || 0), 0);
  const outstandingCents = orders.reduce((sum, o) => {
    if (['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(o.status)) return sum;
    return sum + Math.max(0, Number(o.amountCents || 0) - Number(o.paidCents || 0));
  }, 0);
  const result = {
    patients,
    appointments,
    orders,
    transactions,
    refunds,
    plans,
    finance: { collectedCents, refundedCents, outstandingCents },
    counts: {
      patients: patients.length,
      appointments: appointments.length,
      orders: orders.length,
      transactions: transactions.length,
      refunds: refunds.length,
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
