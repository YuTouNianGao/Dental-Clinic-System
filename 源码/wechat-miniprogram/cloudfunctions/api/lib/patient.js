const { db, _, getDoc, findOne, add, update, list, ensureCollections } = require('./db');
const { makeNo, cents, yuan } = require('./security');
const { requirePatient } = require('./auth');
const { seedClinicsOnly, seedClinicDoctors, seedChairs, seedPatientsOnly, seedDepartmentsOnly, seedCatalogOnly } = require('./seed');

function nowShanghaiParts() {
  const d = new Date(Date.now() + 8 * 3600000);
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes()
  };
}

function appointmentStart(date, minute) {
  return new Date(`${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00+08:00`);
}

function fmtClinic(c) {
  return {
    id: c._id, clinicNo: c.clinicNo, name: c.name, address: c.address, phone: c.phone,
    depositCents: c.depositCents || 0, deposit: yuan(c.depositCents || 0),
    patientBookingEnabled: Number(c.depositCents || 0) > 0
  };
}

function fmtAppointment(a) {
  return {
    id: a._id, no: a.appointmentNo, patientName: a.patientName || '', date: a.date,
    startMinute: a.startMinute, endMinute: a.endMinute,
    status: a.status, clinicName: a.clinicName, clinicNo: a.clinicNo, dentistName: a.dentistName,
    departmentName: a.departmentName || '', chairNo: a.chairNo || '',
    expectedTreatment: a.expectedTreatment || '', holdExpiresAt: a.holdExpiresAt || null,
    depositOrderId: a.depositOrderId || null, channel: a.channel
  };
}

function fmtOrder(o) {
  return {
    id: o._id, no: o.orderNo, type: o.type, patientName: o.patientName || '',
    amountCents: o.amountCents, amount: yuan(o.amountCents),
    status: o.status, appointmentId: o.appointmentId || null, createdAt: o.createdAt,
    expiresAt: o.expiresAt || null, paidCents: o.paidCents || 0,
    appliedCents: o.appliedCents || 0, refundedCents: o.refundedCents || 0,
    reservedCents: o.reservedCents || 0, description: o.description || ''
  };
}

async function notify(userId, type, title, body, relatedType, relatedId) {
  if (!userId) return;
  await add('notifications', {
    userId, type, title, body, relatedType: relatedType || '', relatedId: relatedId || '',
    readAt: null, createdAt: new Date()
  }).catch(() => null);
}

async function getPatientHome(user) {
  const patient = await getDoc('patients', user.patientId);
  const [appointments, orders, notifications, visits] = await Promise.all([
    list('appointments', { patientId: user.patientId }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 10 }),
    list('payment_orders', { patientId: user.patientId }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 10 }),
    list('notifications', { userId: user._id }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 6 }),
    list('visits', { patientId: user.patientId }, { orderBy: { field: 'visitDate', direction: 'desc' }, limit: 5 })
  ]);
  return {
    patient: patient || null,
    appointments: appointments.map(fmtAppointment),
    orders: orders.map(fmtOrder),
    unread: notifications.filter((n) => !n.readAt).length,
    notifications,
    visits
  };
}

async function listClinics() {
  await seedClinicsOnly();
  const rows = await list('clinics', { status: 'ACTIVE' }, { orderBy: { field: 'clinicNo', direction: 'asc' } });
  return rows.map(fmtClinic);
}

async function listDepartments() {
  await seedDepartmentsOnly();
  const rows = await list('departments', { status: 'ACTIVE' }, { orderBy: { field: 'sort', direction: 'asc' } });
  return rows.map((d) => ({ id: d._id, code: d.code, name: d.name, short: d.short }));
}

async function listDentists(clinicId, departmentId) {
  if (clinicId) await seedClinicDoctors(clinicId);
  const where = { status: 'ACTIVE' };
  if (clinicId) where.clinicId = clinicId;
  let rows = await list('dentists', where, { orderBy: { field: 'name', direction: 'asc' } });
  if (departmentId) rows = rows.filter((d) => (d.departmentIds || []).includes(departmentId));
  return rows.map((d) => ({
    id: d._id, name: d.name, title: d.title, clinicId: d.clinicId,
    departmentIds: d.departmentIds || [], qualificationNames: d.qualificationNames,
    initial: String(d.name || '医').slice(0, 1)
  }));
}

async function listTreatments() {
  await seedCatalogOnly();
  return list('treatments', { status: 'ACTIVE' }, { orderBy: { field: 'category', direction: 'asc' } });
}

async function getAvailability({ clinicId, date, dentistId }) {
  await ensureCollections(['clinics', 'dentists', 'schedules', 'appointments']);
  const clinic = await getDoc('clinics', clinicId);
  if (!clinic || clinic.status !== 'ACTIVE') throw new Error('诊所不存在或已停用');
  if (!date) throw new Error('请选择日期');
  const chairs = await seedChairs(clinicId);
  const where = { clinicId, date, status: 'PUBLISHED' };
  if (dentistId) where.dentistId = dentistId;
  let schedules = await list('schedules', where);
  const chairSchedules = await list('schedules', {
    clinicId, date, chairId: _.in(chairs.map((c) => c._id))
  });
  const usedChairs = new Set(chairSchedules.map((s) => s.chairId));
  const pickChair = () => chairs.find((c) => !usedChairs.has(c._id));
  for (const schedule of schedules) {
    if (!schedule.chairId) {
      const chair = pickChair();
      if (chair) {
        usedChairs.add(chair._id);
        await update('schedules', schedule._id, { chairId: chair._id, chairNo: chair.chairNo });
        schedule.chairId = chair._id;
        schedule.chairNo = chair.chairNo;
      }
    }
  }
  if (!schedules.length && dentistId) {
    const dentist = await getDoc('dentists', dentistId);
    if (dentist) {
      const chair = pickChair();
      if (!chair) throw new Error('当日牙椅已排满，请更换日期');
      const created = await add('schedules', {
        clinicId, dentistId, chairId: chair._id, chairNo: chair.chairNo,
        date, startMinute: 540, endMinute: 1080,
        durationMinutes: 30, status: 'PUBLISHED', createdAt: new Date()
      });
      schedules = [created];
    }
  }
  const appointments = await list('appointments', {
    clinicId, date,
    status: _.in(['SCHEDULED', 'PENDING_PAYMENT'])
  });
  const now = nowShanghaiParts();
  const result = [];
  for (const schedule of schedules) {
    for (let minute = schedule.startMinute; minute + schedule.durationMinutes <= schedule.endMinute; minute += 30) {
      if (date === now.date && minute < now.minutes + 5) continue;
      const blocked = appointments.some((a) =>
        a.dentistId === schedule.dentistId &&
        a.status === 'SCHEDULED' &&
        minute < a.endMinute && minute + schedule.durationMinutes > a.startMinute
      ) || appointments.some((a) =>
        a.dentistId === schedule.dentistId &&
        a.status === 'PENDING_PAYMENT' &&
        a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() > Date.now() &&
        minute < a.endMinute && minute + schedule.durationMinutes > a.startMinute
      ) || (schedule.chairId && appointments.some((a) =>
        a.chairId === schedule.chairId &&
        (a.status === 'SCHEDULED' || (a.status === 'PENDING_PAYMENT' && a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() > Date.now())) &&
        minute < a.endMinute && minute + schedule.durationMinutes > a.startMinute
      ));
      if (!blocked) {
        result.push({
          scheduleId: schedule._id, dentistId: schedule.dentistId,
          chairId: schedule.chairId || '', chairNo: schedule.chairNo || '',
          date, startMinute: minute, endMinute: minute + schedule.durationMinutes,
          durationMinutes: schedule.durationMinutes,
          label: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
        });
      }
    }
  }
  return { clinic: fmtClinic(clinic), slots: result };
}

async function createAppointment({ user, clinicId, dentistId, departmentId, date, startMinute, durationMinutes, expectedTreatment }) {
  const patientId = requirePatient(user);
  await ensureCollections(['appointments', 'payment_orders', 'notifications']);
  const department = departmentId ? await getDoc('departments', departmentId) : null;
  const clinic = await getDoc('clinics', clinicId);
  if (!clinic || clinic.status !== 'ACTIVE') throw new Error('诊所已停用');
  if (!clinic.depositCents || clinic.depositCents <= 0) throw new Error('该诊所未开放患者自助预约');
  const schedule = await findOne('schedules', { clinicId, dentistId, date, status: 'PUBLISHED' });
  if (!schedule) throw new Error('该时段没有可用排班');
  const endMinute = Number(startMinute) + Number(durationMinutes || schedule.durationMinutes || 30);
  if (startMinute < schedule.startMinute || endMinute > schedule.endMinute) throw new Error('预约时段超出排班范围');
  const chairs = await seedChairs(clinicId);
  let chairId = schedule.chairId || '';
  let chairNo = schedule.chairNo || '';
  if (!chairId) {
    const chair = chairs[0];
    if (!chair) throw new Error('该诊所暂未配置牙椅');
    chairId = chair._id;
    chairNo = chair.chairNo;
    await update('schedules', schedule._id, { chairId, chairNo });
  }
  const existing = await list('appointments', { clinicId, date, status: _.in(['SCHEDULED', 'PENDING_PAYMENT']) });
  const conflict = existing.some((a) =>
    Number(startMinute) < a.endMinute && Number(endMinute) > a.startMinute &&
    (a.status === 'SCHEDULED' || (a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() > Date.now())) &&
    (a.dentistId === dentistId || a.chairId === chairId)
  );
  if (conflict) throw new Error('该医生或牙椅时段已被预约');
  const dentist = await getDoc('dentists', dentistId);
  const patient = await getDoc('patients', patientId);
  const holdExpiresAt = new Date(Date.now() + 15 * 60000);
  const appointment = await add('appointments', {
    appointmentNo: makeNo('APT'), patientId, patientName: patient.name, patientPhone: patient.phone || '',
    dentistId, dentistName: dentist ? dentist.name : '牙医', clinicId, clinicNo: clinic.clinicNo, clinicName: clinic.name,
    departmentId: department ? department._id : '', departmentName: department ? department.name : '',
    chairId, chairNo,
    scheduleId: schedule._id, date, startMinute: Number(startMinute), endMinute, expectedTreatment: String(expectedTreatment || '口腔检查'),
    status: 'PENDING_PAYMENT', channel: 'PATIENT_SELF_SERVICE', holdExpiresAt,
    createdAt: new Date()
  });
  const order = await add('payment_orders', {
    orderNo: makeNo('PAY'), patientId, patientName: patient.name, clinicId, appointmentId: appointment._id,
    type: 'APPOINTMENT_DEPOSIT', amountCents: clinic.depositCents, status: 'PENDING_PAYMENT',
    paidCents: 0, appliedCents: 0, refundedCents: 0, reservedCents: 0,
    expiresAt: holdExpiresAt, description: '患者自助预约金', createdAt: new Date()
  });
  await update('appointments', appointment._id, { depositOrderId: order._id });
  await notify(user._id, 'APPOINTMENT_CREATED', '预约待支付', `预约 ${appointment.appointmentNo} 已占位 15 分钟，请支付预约金。`, 'appointment', appointment._id);
  return { appointment: { ...appointment, depositOrderId: order._id }, order };
}

async function listAppointments(user) {
  const rows = await list('appointments', { patientId: user.patientId }, { orderBy: { field: 'date', direction: 'desc' }, limit: 50 });
  return rows.map(fmtAppointment);
}

async function getAppointment(user, id) {
  const a = await getDoc('appointments', id);
  if (!a) throw new Error('预约不存在');
  if (!user.staff && a.patientId !== user.patientId) throw new Error('预约不存在');
  if (user.staff && user.role !== 'HQ_MANAGER' && !(user.clinicIds || []).includes(a.clinicId)) {
    throw new Error('该预约不在您的授权范围内');
  }
  const orders = await list('payment_orders', { appointmentId: id }, { orderBy: { field: 'createdAt', direction: 'desc' } });
  const changes = await list('appointment_changes', { appointmentId: id }, { orderBy: { field: 'createdAt', direction: 'desc' } });
  return { appointment: fmtAppointment(a), orders: orders.map(fmtOrder), changes };
}

async function payOrder({ user, orderId, outcome }) {
  requirePatient(user);
  await ensureCollections(['payment_transactions', 'notifications']);
  const order = await getDoc('payment_orders', orderId);
  if (!order || order.patientId !== user.patientId) throw new Error('订单不存在');
  if (order.status === 'CLOSED' || order.status === 'CANCELLED' || order.status === 'FORFEITED') throw new Error('订单已关闭');
  if (outcome !== 'SUCCESS') {
    await add('payment_transactions', {
      transactionNo: makeNo('TXN'), orderId, type: order.type, amountCents: order.amountCents,
      channel: 'MOCK', status: 'FAILED', createdAt: new Date()
    });
    await notify(user._id, 'PAYMENT_FAILED', '模拟支付失败', '支付未成功，订单仍可继续支付。', 'payment_order', order._id);
    return { order: fmtOrder(order), simulated: true };
  }
  if (order.type === 'APPOINTMENT_DEPOSIT') {
    const appointment = await getDoc('appointments', order.appointmentId);
    if (!appointment || appointment.status !== 'PENDING_PAYMENT') throw new Error('预约已不可确认');
    if (order.expiresAt && new Date(order.expiresAt).getTime() < Date.now()) throw new Error('预约占位已过期');
    await update('payment_orders', order._id, { status: 'PAID', paidCents: order.amountCents, paidAt: new Date() });
    await update('appointments', appointment._id, { status: 'SCHEDULED', confirmedAt: new Date(), holdExpiresAt: null });
    await add('payment_transactions', {
      transactionNo: makeNo('TXN'), orderId: order._id, type: order.type, amountCents: order.amountCents,
      channel: 'MOCK', status: 'SUCCEEDED', createdAt: new Date()
    });
    await notify(user._id, 'APPOINTMENT_CONFIRMED', '预约已确认', '预约金模拟支付成功，预约已正式确认。', 'appointment', appointment._id);
    return { order: { ...fmtOrder(order), status: 'PAID', paidCents: order.amountCents } };
  }
  const outstanding = order.amountCents - (order.paidCents || 0) + (order.refundedCents || 0);
  if (outstanding <= 0) throw new Error('订单已结清');
  await update('payment_orders', order._id, { status: 'PAID', paidCents: order.amountCents, paidAt: new Date() });
  await add('payment_transactions', {
    transactionNo: makeNo('TXN'), orderId: order._id, type: order.type, amountCents: outstanding,
    channel: 'MOCK', status: 'SUCCEEDED', createdAt: new Date()
  });
  await notify(user._id, 'PAYMENT_SUCCEEDED', '余额支付成功', '诊后余额模拟支付成功。', 'payment_order', order._id);
  return { order: { ...fmtOrder(order), status: 'PAID', paidCents: order.amountCents } };
}

async function cancelAppointment({ user, appointmentId, reason }) {
  requirePatient(user);
  await ensureCollections(['refunds', 'appointment_changes', 'notifications']);
  const appointment = await getDoc('appointments', appointmentId);
  if (!appointment || appointment.patientId !== user.patientId) throw new Error('预约不存在');
  if (!['PENDING_PAYMENT', 'SCHEDULED'].includes(appointment.status)) throw new Error('当前预约不能取消');
  const orders = await list('payment_orders', { appointmentId, type: 'APPOINTMENT_DEPOSIT' });
  const order = orders[0] || null;
  const start = appointmentStart(appointment.date, appointment.startMinute);
  const seconds = Math.floor((start.getTime() - Date.now()) / 1000);
  let refund = null;
  let forfeited = false;
  if (appointment.status === 'PENDING_PAYMENT') {
    if (order) await update('payment_orders', order._id, { status: 'CANCELLED', closedAt: new Date() });
  } else if (order && order.status === 'PAID') {
    if (seconds >= 86400) {
      refund = await add('refunds', {
        refundNo: makeNo('RFD'), orderId: order._id, appointmentId, amountCents: order.amountCents,
        reasonCode: 'PATIENT_EARLY_CANCEL', reasonText: reason || '患者提前取消',
        status: 'PENDING_REVIEW', requestedBy: user._id, createdAt: new Date()
      });
      await update('payment_orders', order._id, { status: 'REFUNDING', reservedCents: order.amountCents });
    } else {
      forfeited = true;
      await update('payment_orders', order._id, { status: 'FORFEITED', forfeitedAt: new Date(), forfeitedReason: 'PATIENT_LATE_CANCEL' });
    }
  }
  await update('appointments', appointment._id, { status: 'CANCELLED', cancelReason: reason || '', cancelledAt: new Date() });
  await add('appointment_changes', {
    appointmentId, type: 'CANCEL', reason: reason || '', initiator: 'PATIENT',
    secondsBeforeStart: seconds, refundEligible: seconds >= 86400, refundCents: refund ? refund.amountCents : 0,
    createdAt: new Date()
  });
  await notify(user._id, 'APPOINTMENT_CANCELLED', '预约已取消', refund ? '已提交退款申请，等待主管审核。' : '预约已取消。', 'appointment', appointmentId);
  return { cancelled: true, refund, forfeited };
}

async function listOrders(user) {
  const rows = await list('payment_orders', { patientId: user.patientId }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 50 });
  return rows.map(fmtOrder);
}

async function getOrder(user, id) {
  await ensureCollections(['payment_transactions', 'refunds']);
  const order = await getDoc('payment_orders', id);
  if (!order || order.patientId !== user.patientId) throw new Error('订单不存在');
  const transactions = await list('payment_transactions', { orderId: id }, { orderBy: { field: 'createdAt', direction: 'desc' } });
  const refunds = await list('refunds', { orderId: id }, { orderBy: { field: 'createdAt', direction: 'desc' } });
  return { order: fmtOrder(order), transactions, refunds };
}

async function listVisits(user) {
  return list('visits', { patientId: user.patientId }, { orderBy: { field: 'visitDate', direction: 'desc' }, limit: 50 });
}

async function listSettlements(user) {
  await ensureCollections(['settlements']);
  return list('settlements', { patientId: user.patientId }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 50 });
}

async function listRefunds(user) {
  await ensureCollections(['refunds']);
  return list('refunds', { requestedBy: user._id }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 50 });
}

async function listNotifications(user) {
  return list('notifications', { userId: user._id }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 50 });
}

async function readNotification(user, id) {
  const item = await getDoc('notifications', id);
  if (!item || item.userId !== user._id) throw new Error('通知不存在');
  await update('notifications', id, { readAt: new Date() });
  return { ok: true };
}

async function updateProfile(user, data) {
  requirePatient(user);
  const patient = await getDoc('patients', user.patientId);
  await update('patients', user.patientId, {
    phone: data.phone === undefined ? patient.phone : String(data.phone).slice(0, 32),
    email: data.email === undefined ? patient.email : String(data.email).slice(0, 254),
    billingAddress: data.billingAddress === undefined ? patient.billingAddress : String(data.billingAddress).slice(0, 255)
  });
  return { ok: true };
}

async function getBinding(user) {
  await ensureCollections(['binding_requests']);
  const latest = await list('binding_requests', { userId: user._id }, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 1 });
  return latest[0] || null;
}

async function requestBinding({ user, name, phone }) {
  requirePatient(user);
  await ensureCollections(['binding_requests', 'patients']);
  await seedPatientsOnly();
  const cleanName = String(name || '').trim();
  const cleanPhone = String(phone || '').trim();
  if (!cleanName || !cleanPhone) throw new Error('请填写姓名和手机号');
  const patient = await findOne('patients', { name: cleanName, phone: cleanPhone });
  if (!patient) throw new Error('未找到匹配的患者档案，请核对姓名和手机号');
  if (patient._id === user.patientId) throw new Error('当前微信已绑定该患者档案');
  const pending = await findOne('binding_requests', { userId: user._id, status: 'PENDING_REVIEW' });
  if (pending) throw new Error('已有待审核的绑定申请');
  await add('binding_requests', {
    userId: user._id, patientId: patient._id, patientName: patient.name,
    phone: patient.phone, status: 'PENDING_REVIEW', createdAt: new Date()
  });
  return { status: 'PENDING_REVIEW', patientName: patient.name };
}

module.exports = {
  getPatientHome, listClinics, listDepartments, listDentists, listTreatments, getAvailability, createAppointment,
  listAppointments, getAppointment, payOrder, cancelAppointment,
  listOrders, getOrder, listVisits, listSettlements, listRefunds,
  listNotifications, readNotification, updateProfile, getBinding, requestBinding,
  fmtOrder, fmtAppointment
};
