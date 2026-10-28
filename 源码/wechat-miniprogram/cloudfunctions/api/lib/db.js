const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTIONS = [
  'meta', 'clinics', 'departments', 'dentists', 'chairs', 'schedules', 'patients', 'treatments', 'users', 'sessions',
  'appointments', 'appointment_changes', 'payment_orders', 'payment_transactions', 'refunds',
  'visits', 'settlements', 'notifications', 'deposit_applications', 'staff_requests', 'binding_requests'
];

async function ensureCollections(names = COLLECTIONS) {
  await Promise.all((names || COLLECTIONS).map(async (name) => {
    try {
      await db.createCollection(name);
    } catch (error) {
      // -501001 / -502005 mean the collection already exists in common
      // CloudBase deployments. Other errors are surfaced by the caller.
      if (![ -501001, -502005 ].includes(Number(error.errCode))) {
        console.warn('createCollection', name, error.errCode, error.errMsg);
      }
    }
  }));
}

function dbNow() {
  return new Date();
}

async function getDoc(collection, id) {
  if (!id) return null;
  try {
    const res = await db.collection(collection).doc(String(id)).get();
    return res.data || null;
  } catch (error) {
    if (String(error.errMsg || '').includes('not exist')) return null;
    return null;
  }
}

async function findOne(collection, where) {
  const res = await db.collection(collection).where(where).limit(1).get();
  return res.data[0] || null;
}

async function add(collection, data) {
  const res = await db.collection(collection).add({ data });
  return { _id: res._id, ...data };
}

async function update(collection, id, data) {
  return db.collection(collection).doc(String(id)).update({ data });
}

async function remove(collection, id) {
  return db.collection(collection).doc(String(id)).remove();
}

async function list(collection, where = {}, options = {}) {
  let query = db.collection(collection);
  if (where && Object.keys(where).length) query = query.where(where);
  if (options.orderBy) query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'asc');
  if (options.limit) query = query.limit(options.limit);
  const res = await query.get();
  return res.data;
}

function ok(data) { return { ok: true, data }; }
function fail(code, message, details) { return { ok: false, code, message, details: details || null }; }

module.exports = {
  cloud, db, _, COLLECTIONS, ensureCollections, dbNow,
  getDoc, findOne, add, update, remove, list, ok, fail
};
