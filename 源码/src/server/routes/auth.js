import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { COOKIE_NAME, cookieOptions, hashPassword, loadUser, signToken, verifyPassword } from '../auth.js';
import { asyncHandler, badRequest, conflict, unauthorized } from '../errors.js';
import { makeNo, nowUtcSql } from '../utils.js';
import jwt from 'jsonwebtoken';

const router = Router();
const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(64),
  password: z.string().min(1, '请输入密码').max(200)
});

// Small in-process limiter. It is intentionally conservative and does not
// replace a production reverse-proxy rate limit.
const loginAttempts = new Map();
function rateLimitLogin(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > 15 * 60 * 1000) {
    loginAttempts.set(key, { count: 1, startedAt: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= 20;
}

const registerSchema = z.object({
  registrationType: z.enum(['NEW_PATIENT', 'EXISTING_PATIENT']).default('NEW_PATIENT'),
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(72),
  patientName: z.string().trim().min(1).max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phone: z.string().trim().min(5).max(32),
  email: z.string().trim().email().max(254).nullable().optional().or(z.literal('')),
  billingAddress: z.string().trim().min(1).max(255).optional().default('未填写'),
  emergencyContactName: z.string().trim().min(1).max(100).optional().default('待补充'),
  emergencyContactPhone: z.string().trim().min(5).max(32).optional().default('00000000000'),
  clinicId: z.coerce.number().int().positive().nullable().optional(),
  consent: z.literal(true)
});

router.post('/register', asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const existingUser = await query('SELECT user_id FROM user_account WHERE username=?', [input.username]);
  if (existingUser.length) throw conflict('用户名已被使用');
  const passwordHash = await hashPassword(input.password);
  const result = await transaction(async (conn) => {
    const [userResult] = await conn.execute(
      "INSERT INTO user_account (username, password_hash, display_name, role_code, status) VALUES (?, ?, ?, 'PATIENT', 'ACTIVE')",
      [input.username, passwordHash, input.patientName]
    );
    const userId = userResult.insertId;
    let patientId = null;
    let linkStatus = 'PENDING';
    if (input.registrationType === 'NEW_PATIENT') {
      const [patientResult] = await conn.execute(
        `INSERT INTO patient (patient_no, patient_name, birth_date, billing_address, phone, email,
           emergency_contact_name, emergency_contact_phone, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [makeNo('PAT'), input.patientName, input.birthDate, input.billingAddress, input.phone,
         input.email || null, input.emergencyContactName, input.emergencyContactPhone]
      );
      patientId = patientResult.insertId;
      linkStatus = 'ACTIVE';
      if (input.clinicId) {
        await conn.execute(
          'INSERT INTO patient_clinic_relation (patient_id, clinic_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE patient_id=patient_id',
          [patientId, input.clinicId]
        );
      }
    }
    await conn.execute(
      `INSERT INTO patient_account
        (user_id, patient_id, link_status, requested_name, requested_phone, requested_birth_date,
         requested_clinic_id, terms_accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [userId, patientId, linkStatus, input.patientName, input.phone, input.birthDate, input.clinicId || null]
    );
    await writeAudit(conn, userId, 'REGISTER', 'user_account', userId, {
      afterStatus: 'ACTIVE', details: { registrationType: input.registrationType, linkStatus }, ipAddress: req.ip
    });
    if (patientId) {
      await writeAudit(conn, userId, 'BIND_PATIENT_ACCOUNT', 'patient_account', userId, {
        relatedEntityId: patientId, afterStatus: 'ACTIVE', ipAddress: req.ip
      });
    }
    return { userId, patientId, linkStatus };
  });
  const user = await loadUser(result.userId);
  res.cookie(COOKIE_NAME, signToken(result.userId, user.tokenVersion), cookieOptions());
  res.status(201).json({ user, linkStatus: result.linkStatus });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  if (!rateLimitLogin(req.ip + ':' + input.username)) throw unauthorized('登录尝试过于频繁，请稍后再试');
  const rows = await query(
    'SELECT user_id, username, display_name, role_code, status, password_hash, token_version, failed_login_count, locked_until FROM user_account WHERE username = ?',
    [input.username]
  );
  const account = rows[0];
  const locked = account?.locked_until && new Date(String(account.locked_until).replace(' ', 'T') + 'Z') > new Date();
  if (locked) throw unauthorized('账号暂时锁定，请稍后再试');
  if (!account || account.status !== 'ACTIVE' || !(await verifyPassword(input.password, account.password_hash))) {
    if (account) {
      const failed = Number(account.failed_login_count || 0) + 1;
      await query(
        'UPDATE user_account SET failed_login_count=?, last_failed_login_at=UTC_TIMESTAMP(6), locked_until=CASE WHEN ? >= 5 THEN DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 15 MINUTE) ELSE locked_until END WHERE user_id=?',
        [failed, failed, account.user_id]
      );
    }
    throw unauthorized('用户名或密码错误');
  }
  const user = await loadUser(account.user_id);
  res.cookie(COOKIE_NAME, signToken(account.user_id, user.tokenVersion), cookieOptions());
  await transaction(async (conn) => {
    await conn.execute(
      'UPDATE user_account SET last_login_at=?, failed_login_count=0, locked_until=NULL WHERE user_id=?',
      [nowUtcSql(), account.user_id]
    );
    await writeAudit(conn, account.user_id, 'LOGIN', 'user_account', account.user_id, {
      afterStatus: 'ACTIVE', details: { username: account.username, role: account.role_code }, ipAddress: req.ip
    });
  });
  res.json({ user });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw unauthorized();
  const payload = jwt.verify(token, config.jwtSecret);
  const user = await loadUser(Number(payload.sub));
  if (payload.ver !== undefined && Number(payload.ver) !== user.tokenVersion) throw unauthorized('登录已失效，请重新登录');
  res.json({ user });
}));

export default router;
