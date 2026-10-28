import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { forbidden, unauthorized } from './errors.js';

export const COOKIE_NAME = 'adc_session';

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: String(userId), ver: Number(tokenVersion) || 0 }, config.jwtSecret, { expiresIn: '8h' });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  };
}

export async function loadUser(userId) {
  const rows = await query(
    `SELECT u.user_id, u.username, u.display_name, u.role_code, u.status, u.token_version,
            d.dentist_id,
            pa.patient_id, pa.link_status
       FROM user_account u
       LEFT JOIN dentist_profile d ON d.user_id = u.user_id
       LEFT JOIN patient_account pa ON pa.user_id = u.user_id
      WHERE u.user_id = ?`,
    [userId]
  );
  if (!rows[0] || rows[0].status !== 'ACTIVE') throw unauthorized('账号不存在或已停用');
  const scopes = await query(
    'SELECT clinic_id FROM user_clinic_scope WHERE user_id = ? ORDER BY clinic_id',
    [userId]
  );
  const row = rows[0];
  return {
    userId: Number(row.user_id),
    username: row.username,
    displayName: row.display_name,
    role: row.role_code,
    portal: row.role_code === 'PATIENT' ? 'PATIENT' : 'STAFF',
    dentistId: row.dentist_id ? Number(row.dentist_id) : null,
    patientId: row.link_status === 'ACTIVE' && row.patient_id ? Number(row.patient_id) : null,
    linkStatus: row.link_status || null,
    tokenVersion: Number(row.token_version || 0),
    clinicIds: scopes.map((r) => Number(r.clinic_id))
  };
}

export async function authRequired(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw unauthorized();
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await loadUser(Number(payload.sub));
    if (payload.ver !== undefined && Number(payload.ver) !== user.tokenVersion) {
      return next(unauthorized('登录已失效，请重新登录'));
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(unauthorized('登录已过期，请重新登录'));
    }
    next(error);
  }
}

export function allow(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const STAFF_ROLES = ['FRONT_DESK', 'DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER'];

export function staffOnly(req, res, next) {
  if (!req.user || req.user.role === 'PATIENT' || !STAFF_ROLES.includes(req.user.role)) {
    return next(forbidden('该接口仅限员工使用'));
  }
  next();
}

export function patientOnly(req, res, next) {
  if (!req.user || req.user.role !== 'PATIENT') return next(forbidden('该接口仅限患者使用'));
  next();
}

export function activePatientId(user) {
  if (!user || user.role !== 'PATIENT' || user.linkStatus !== 'ACTIVE' || !user.patientId) {
    throw forbidden('患者档案尚未完成核验绑定');
  }
  return Number(user.patientId);
}

export function isHQ(user) {
  return user.role === 'HQ_MANAGER';
}

export function assertClinicAccess(user, clinicId) {
  const id = Number(clinicId);
  if (isHQ(user) || user.role === 'DENTIST') return id;
  if (!user.clinicIds.includes(id)) throw forbidden('该诊所不在您的授权范围内');
  return id;
}

export function scopedClinicSql(user, column, requestedClinicId) {
  if (requestedClinicId) {
    assertClinicAccess(user, requestedClinicId);
    return { sql: `${column} = ?`, params: [Number(requestedClinicId)] };
  }
  if (isHQ(user) || user.role === 'DENTIST') return { sql: '1 = 1', params: [] };
  if (!user.clinicIds.length) return { sql: '1 = 0', params: [] };
  return { sql: `${column} IN (${user.clinicIds.map(() => '?').join(',')})`, params: user.clinicIds };
}

export function canAccessDentist(user, dentistId) {
  return isHQ(user) || user.role !== 'DENTIST' || Number(user.dentistId) === Number(dentistId);
}

export function requireDentistSelf(user, dentistId) {
  if (user.role === 'DENTIST' && Number(user.dentistId) !== Number(dentistId)) {
    throw forbidden('牙医只能操作自己的接诊记录');
  }
}
