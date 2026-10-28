const { db, ensureCollections } = require('./db');
const { findOne, getDoc, add } = require('./db');
const { randomToken, verifyPassword, hashPassword, makeNo } = require('./security');

const CORE = ['users', 'patients', 'sessions'];

function publicUser(user) {
  if (!user) return null;
  return {
    id: user._id,
    role: user.role,
    displayName: user.displayName,
    account: user.patientUsername || user.staffUsername || '',
    patientId: user.patientId || null,
    clinicIds: user.clinicIds || [],
    staff: Boolean(user.staff),
    status: user.status || 'ACTIVE'
  };
}

async function getSessionUser(token) {
  if (!token) return null;
  const session = await findOne('sessions', { token });
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  return getDoc('users', session.userId);
}

async function createSession(user) {
  const token = randomToken();
  await add('sessions', {
    token, userId: user._id,
    expiresAt: new Date(Date.now() + 8 * 3600000),
    createdAt: new Date()
  });
  return token;
}

async function bootstrap(token) {
  if (!token) return { user: null, patient: null };
  const user = await getSessionUser(token);
  if (!user || user.status !== 'ACTIVE' || user.staff) return { user: null, patient: null };
  const patient = user.patientId ? await getDoc('patients', user.patientId) : null;
  return { user: publicUser(user), patient, token };
}

async function generatePatientAccount() {
  for (let i = 0; i < 12; i += 1) {
    const account = 'P' + String(Math.floor(10000000 + Math.random() * 90000000));
    if (!await findOne('users', { patientUsername: account })) return account;
  }
  throw new Error('账号分配失败，请重试');
}

async function registerPatient(input) {
  await ensureCollections(CORE);
  const name = String(input.name || '').trim();
  const gender = String(input.gender || '').trim();
  const age = Number(input.age);
  const phone = String(input.phone || '').trim();
  const password = String(input.password || '');
  if (name.length < 2 || name.length > 30) throw new Error('姓名需为 2-30 个字符');
  if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) throw new Error('请选择性别');
  if (!Number.isInteger(age) || age < 0 || age > 120) throw new Error('年龄需在 0-120 之间');
  if (!/^\d{6,20}$/.test(phone)) throw new Error('请输入有效手机号');
  if (password.length < 6) throw new Error('密码至少 6 位');
  if (await findOne('patients', { phone })) throw new Error('该手机号已注册患者账号');
  const account = await generatePatientAccount();
  const patient = await add('patients', {
    patientNo: makeNo('PAT'), name, gender, age, phone,
    billingAddress: '待补充', status: 'ACTIVE', createdAt: new Date()
  });
  await add('users', {
    patientUsername: account,
    passwordHash: hashPassword(password),
    role: 'PATIENT',
    displayName: name,
    patientId: patient._id,
    status: 'ACTIVE',
    staff: false,
    createdAt: new Date()
  });
  return { account, patientNo: patient.patientNo, patientName: name };
}

async function loginPatient(account, password) {
  await ensureCollections(CORE);
  const user = await findOne('users', { patientUsername: String(account || '').trim(), staff: false });
  if (!user || user.status !== 'ACTIVE' || !verifyPassword(password, user.passwordHash)) {
    const error = new Error('账号或密码错误');
    error.code = 'AUTH_FAILED';
    throw error;
  }
  const token = await createSession(user);
  const patient = user.patientId ? await getDoc('patients', user.patientId) : null;
  return { user: publicUser(user), patient, token };
}

async function logout(token) {
  if (!token) return;
  const session = await findOne('sessions', { token });
  if (session) await db.collection('sessions').doc(session._id).remove();
}

async function requireUser(token) {
  const user = await getSessionUser(token);
  if (!user || user.status !== 'ACTIVE' || user.staff) {
    const error = new Error('请先登录患者账号');
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  return user;
}

function requirePatient(user) {
  if (!user || user.role !== 'PATIENT' || !user.patientId) {
    const error = new Error('该操作仅限患者账号');
    error.code = 'FORBIDDEN';
    throw error;
  }
  return user.patientId;
}

function requireStaff(user, roles) {
  if (!user || !user.staff || (roles && !roles.includes(user.role))) {
    const error = new Error('无权执行该操作');
    error.code = 'FORBIDDEN';
    throw error;
  }
  return user;
}

module.exports = {
  publicUser, getSessionUser, bootstrap, registerPatient, loginPatient,
  logout, logoutStaff: logout, requireUser, requirePatient
};
