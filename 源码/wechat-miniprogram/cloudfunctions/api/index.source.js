const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const { ok, fail } = require('./lib/db');
const { seedDemo } = require('./lib/seed');
const {
  bootstrap, registerPatient, loginPatient, logoutStaff, requireUser
} = require('./lib/auth');
const patient = require('./lib/patient');

exports.main = async (event = {}) => {
  const action = String(event.action || 'bootstrap');
  const token = event.token || '';
  try {
    if (action === 'bootstrap') return ok(await bootstrap(token));
    if (action === 'registerPatient') return ok(await registerPatient(event.data || event));
    if (action === 'loginPatient') return ok(await loginPatient(event.account, event.password));
    if (action === 'logoutStaff') { await logoutStaff(token); return ok({ ok: true }); }
    if (action === 'initDemo') return ok(await seedDemo());

    const user = await requireUser(token);

    if (action === 'home') return ok(await patient.getPatientHome(user));
    if (action === 'listClinics') return ok(await patient.listClinics());
    if (action === 'listDepartments') return ok(await patient.listDepartments());
    if (action === 'listDentists') return ok(await patient.listDentists(event.clinicId, event.departmentId));
    if (action === 'listTreatments') return ok(await patient.listTreatments());
    if (action === 'availability') return ok(await patient.getAvailability(event));
    if (action === 'createAppointment') return ok(await patient.createAppointment({ user, ...event }));
    if (action === 'listAppointments') return ok(await patient.listAppointments(user));
    if (action === 'getAppointment') return ok(await patient.getAppointment(user, event.appointmentId));
    if (action === 'cancelAppointment') return ok(await patient.cancelAppointment({ user, appointmentId: event.appointmentId, reason: event.reason }));
    if (action === 'payOrder') return ok(await patient.payOrder({ user, orderId: event.orderId, outcome: event.outcome }));
    if (action === 'listOrders') return ok(await patient.listOrders(user));
    if (action === 'getOrder') return ok(await patient.getOrder(user, event.orderId));
    if (action === 'listVisits') return ok(await patient.listVisits(user));
    if (action === 'listSettlements') return ok(await patient.listSettlements(user));
    if (action === 'listRefunds') return ok(await patient.listRefunds(user));
    if (action === 'listNotifications') return ok(await patient.listNotifications(user));
    if (action === 'readNotification') return ok(await patient.readNotification(user, event.notificationId));
    if (action === 'updateProfile') return ok(await patient.updateProfile(user, event.data || {}));
    if (action === 'getBinding') return ok(await patient.getBinding(user));
    if (action === 'requestBinding') return ok(await patient.requestBinding({ user, name: event.name, phone: event.phone }));

    return fail('UNKNOWN_ACTION', '未知操作：' + action);
  } catch (error) {
    console.error(action, error);
    return fail(error.code || 'ERROR', error.message || '服务异常');
  }
};
