import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../errors.js';
import { shanghaiToday } from '../utils.js';
import { getPublicAvailability } from '../services/portalAvailabilityService.js';

const router = Router();

router.get('/clinics', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT clinic_id, clinic_no, postal_address, phone, email, appointment_deposit_amount
       FROM clinic WHERE status='ACTIVE'
      ORDER BY clinic_no`
  );
  res.json({
    items: rows.map((row) => ({
      clinicId: row.clinic_id,
      clinicNo: row.clinic_no,
      postalAddress: row.postal_address,
      phone: row.phone,
      email: row.email,
      appointmentDepositAmount: String(row.appointment_deposit_amount ?? '0.00'),
      patientBookingEnabled: Number(row.appointment_deposit_amount) > 0
    }))
  });
}));

router.get('/clinics/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('诊所编号无效');
  const rows = await query(
    `SELECT clinic_id, clinic_no, postal_address, phone, email, appointment_deposit_amount
       FROM clinic WHERE clinic_id=? AND status='ACTIVE'`,
    [id]
  );
  if (!rows[0]) throw notFound('诊所不存在');
  const row = rows[0];
  res.json({
    clinic: {
      clinicId: row.clinic_id,
      clinicNo: row.clinic_no,
      postalAddress: row.postal_address,
      phone: row.phone,
      email: row.email,
      appointmentDepositAmount: String(row.appointment_deposit_amount ?? '0.00'),
      patientBookingEnabled: Number(row.appointment_deposit_amount) > 0
    }
  });
}));

router.get('/dentists', asyncHandler(async (req, res) => {
  const params = [];
  const where = ["u.status='ACTIVE'"];
  if (req.query.clinicId) {
    where.push(`EXISTS (
      SELECT 1 FROM dentist_schedule ds
       WHERE ds.dentist_id=d.dentist_id AND ds.clinic_id=? AND ds.status='PUBLISHED'
    )`);
    params.push(Number(req.query.clinicId));
  }
  if (req.query.qualificationId) {
    where.push(`EXISTS (
      SELECT 1 FROM dentist_qualification dq
       WHERE dq.dentist_id=d.dentist_id AND dq.qualification_id=? AND dq.verification_status='VERIFIED'
    )`);
    params.push(Number(req.query.qualificationId));
  }
  if (req.query.q) {
    where.push('u.display_name LIKE ?');
    params.push(`%${String(req.query.q).trim()}%`);
  }
  const rows = await query(
    `SELECT d.dentist_id, u.display_name,
            GROUP_CONCAT(DISTINCT q.qualification_name ORDER BY q.qualification_name SEPARATOR '、') AS qualification_names,
            GROUP_CONCAT(DISTINCT c.clinic_no ORDER BY c.clinic_no SEPARATOR '、') AS clinic_nos
       FROM dentist_profile d
       JOIN user_account u ON u.user_id=d.user_id
       LEFT JOIN dentist_qualification dq ON dq.dentist_id=d.dentist_id AND dq.verification_status='VERIFIED'
       LEFT JOIN qualification q ON q.qualification_id=dq.qualification_id
       LEFT JOIN dentist_schedule ds ON ds.dentist_id=d.dentist_id AND ds.status='PUBLISHED'
       LEFT JOIN clinic c ON c.clinic_id=ds.clinic_id AND c.status='ACTIVE'
      WHERE ${where.join(' AND ')}
      GROUP BY d.dentist_id, u.display_name
      ORDER BY u.display_name`,
    params
  );
  res.json({
    items: rows.map((row) => ({
      dentistId: row.dentist_id,
      displayName: row.display_name,
      qualificationNames: row.qualification_names || '未登记',
      clinicNos: row.clinic_nos || ''
    }))
  });
}));

router.get('/dentists/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('牙医编号无效');
  const rows = await query(
    `SELECT d.dentist_id, u.display_name,
            GROUP_CONCAT(DISTINCT q.qualification_name ORDER BY q.qualification_name SEPARATOR '、') AS qualification_names
       FROM dentist_profile d
       JOIN user_account u ON u.user_id=d.user_id AND u.status='ACTIVE'
       LEFT JOIN dentist_qualification dq ON dq.dentist_id=d.dentist_id AND dq.verification_status='VERIFIED'
       LEFT JOIN qualification q ON q.qualification_id=dq.qualification_id
      WHERE d.dentist_id=?
      GROUP BY d.dentist_id, u.display_name`,
    [id]
  );
  if (!rows[0]) throw notFound('牙医不存在');
  const clinics = await query(
    `SELECT DISTINCT c.clinic_id, c.clinic_no, c.postal_address
       FROM dentist_schedule ds JOIN clinic c ON c.clinic_id=ds.clinic_id
      WHERE ds.dentist_id=? AND ds.status='PUBLISHED' AND c.status='ACTIVE'
      ORDER BY c.clinic_no`,
    [id]
  );
  res.json({
    dentist: {
      dentistId: rows[0].dentist_id,
      displayName: rows[0].display_name,
      qualificationNames: rows[0].qualification_names || '未登记',
      clinics
    }
  });
}));

router.get('/treatments', asyncHandler(async (req, res) => {
  const today = shanghaiToday();
  const rows = await query(
    `SELECT ti.treatment_item_id, ti.treatment_name,
            (SELECT tp.standard_unit_price FROM treatment_price tp
              WHERE tp.treatment_item_id=ti.treatment_item_id
                AND tp.approval_status='APPROVED' AND tp.effective_from <= ?
              ORDER BY tp.effective_from DESC, tp.version_no DESC LIMIT 1) AS current_price,
            (SELECT tp.effective_from FROM treatment_price tp
              WHERE tp.treatment_item_id=ti.treatment_item_id
                AND tp.approval_status='APPROVED' AND tp.effective_from <= ?
              ORDER BY tp.effective_from DESC, tp.version_no DESC LIMIT 1) AS effective_from
       FROM treatment_item ti
      WHERE ti.status='ACTIVE'
      ORDER BY ti.treatment_name`,
    [today, today]
  );
  res.json({
    items: rows.map((row) => ({
      treatmentItemId: row.treatment_item_id,
      treatmentName: row.treatment_name,
      currentPrice: row.current_price === null ? null : String(row.current_price),
      effectiveFrom: row.effective_from || null
    }))
  });
}));

router.get('/availability', asyncHandler(async (req, res) => {
  const clinicId = Number(req.query.clinicId);
  if (!clinicId) throw badRequest('请选择诊所');
  if (!req.query.date) throw badRequest('请选择日期');
  const result = await getPublicAvailability({
    clinicId,
    date: req.query.date,
    dentistId: req.query.dentistId ? Number(req.query.dentistId) : null,
    qualificationId: req.query.qualificationId ? Number(req.query.qualificationId) : null,
    durationMinutes: req.query.durationMinutes ? Number(req.query.durationMinutes) : 30
  });
  if (!result.clinic) throw notFound('诊所不存在或未开放患者预约');
  res.json(result);
}));

export default router;
