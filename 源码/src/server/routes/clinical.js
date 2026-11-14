import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { allow, assertClinicAccess, scopedClinicSql } from '../auth.js';
import { asyncHandler, badRequest, conflict, notFound } from '../errors.js';
import { asId, makeNo, parsePagination, paged } from '../utils.js';

const router = Router();

const PLAN_STATUS = ['DRAFT', 'PRESENTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED'];
const ITEM_STATUS = ['PLANNED', 'SCHEDULED', 'COMPLETED', 'DECLINED'];
const CONDITIONS = ['HEALTHY', 'CARIES', 'FILLING', 'CROWN', 'ROOT_CANAL', 'IMPLANT', 'MISSING', 'FRACTURE', 'SENSITIVE'];

const planItemSchema = z.object({
  treatmentItemId: z.coerce.number().int().positive(),
  toothNo: z.string().trim().regex(/^(1[1-8]|2[1-8]|3[1-8]|4[1-8])$/).nullable().optional(),
  quantity: z.coerce.number().positive().max(99).default(1),
  unitPrice: z.coerce.number().nonnegative().max(9999999),
  status: z.enum(ITEM_STATUS).default('PLANNED'),
  note: z.string().trim().max(255).nullable().optional()
});

const planItemPatchSchema = z.object({
  toothNo: z.string().trim().regex(/^(1[1-8]|2[1-8]|3[1-8]|4[1-8])$/).nullable().optional(),
  quantity: z.coerce.number().positive().max(99).optional(),
  unitPrice: z.coerce.number().nonnegative().max(9999999).optional(),
  status: z.enum(ITEM_STATUS).optional(),
  note: z.string().trim().max(255).nullable().optional()
});

const planSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  clinicId: z.coerce.number().int().positive(),
  dentistId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1).max(150),
  status: z.enum(PLAN_STATUS).default('DRAFT'),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(planItemSchema).max(60).default([])
});

const planBase = `
  SELECT tp.*, p.patient_name, p.patient_no, p.phone, c.clinic_no, c.postal_address,
         u.display_name AS dentist_name, d.employee_no,
         COALESCE(s.item_count, 0) AS item_count,
         COALESCE(s.completed_count, 0) AS completed_count,
         COALESCE(s.total_amount, 0) AS total_amount
    FROM treatment_plan tp
    JOIN patient p ON p.patient_id = tp.patient_id
    JOIN clinic c ON c.clinic_id = tp.clinic_id
    JOIN dentist_profile d ON d.dentist_id = tp.dentist_id
    JOIN user_account u ON u.user_id = d.user_id
    LEFT JOIN (
      SELECT plan_id, COUNT(*) AS item_count,
             SUM(status = 'COMPLETED') AS completed_count,
             SUM(subtotal) AS total_amount
        FROM treatment_plan_item GROUP BY plan_id
    ) s ON s.plan_id = tp.plan_id
`;

function planScope(req, requestedClinicId) {
  const scope = scopedClinicSql(req.user, 'tp.clinic_id', requestedClinicId);
  const dentist = req.user.role === 'DENTIST'
    ? { sql: 'tp.dentist_id = ?', params: [req.user.dentistId] }
    : { sql: '1=1', params: [] };
  return {
    sql: `${scope.sql} AND ${dentist.sql}`,
    params: [...scope.params, ...dentist.params]
  };
}

function assertDentistWrite(req, dentistId) {
  if (req.user.role === 'DENTIST' && Number(req.user.dentistId) !== Number(dentistId)) {
    throw badRequest('牙医只能维护自己的治疗计划', 'FORBIDDEN');
  }
}

async function loadPlan(planId) {
  const rows = await query(`${planBase} WHERE tp.plan_id = ?`, [planId]);
  if (!rows[0]) throw notFound('治疗计划不存在');
  const items = await query(
    `SELECT tpi.*, ti.treatment_name
       FROM treatment_plan_item tpi
       JOIN treatment_item ti ON ti.treatment_item_id = tpi.treatment_item_id
      WHERE tpi.plan_id = ? ORDER BY tpi.sequence_no, tpi.item_id`,
    [planId]
  );
  return { ...rows[0], items };
}

router.get('/treatment-plans', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const scope = planScope(req, req.query.clinicId);
  const where = [scope.sql];
  const params = [...scope.params];
  if (req.query.status) {
    if (!PLAN_STATUS.includes(req.query.status)) throw badRequest('治疗计划状态无效');
    where.push('tp.status = ?'); params.push(req.query.status);
  }
  if (req.query.patientId) { where.push('tp.patient_id = ?'); params.push(asId(req.query.patientId)); }
  if (req.query.q) {
    const term = `%${String(req.query.q).trim()}%`;
    where.push('(p.patient_name LIKE ? OR p.patient_no LIKE ? OR tp.plan_no LIKE ? OR tp.title LIKE ?)');
    params.push(term, term, term, term);
  }
  const condition = where.join(' AND ');
  const total = (await query(
    `SELECT COUNT(*) AS total FROM treatment_plan tp
       JOIN patient p ON p.patient_id = tp.patient_id WHERE ${condition}`,
    params
  ))[0].total;
  const rows = await query(
    `${planBase} WHERE ${condition} ORDER BY tp.updated_at DESC, tp.plan_id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json(paged(rows, Number(total), page, pageSize));
}));

router.get('/treatment-plans/:id', asyncHandler(async (req, res) => {
  const plan = await loadPlan(asId(req.params.id));
  assertClinicAccess(req.user, plan.clinic_id);
  if (req.user.role === 'DENTIST' && Number(req.user.dentistId) !== Number(plan.dentist_id)) {
    throw badRequest('无权查看其他牙医的治疗计划', 'FORBIDDEN');
  }
  res.json({ plan });
}));

router.get('/patients/:id', asyncHandler(async (req, res) => {
  const patientId = asId(req.params.id);
  const patient = (await query('SELECT * FROM patient WHERE patient_id = ?', [patientId]))[0];
  if (!patient) throw notFound('患者不存在');
  const [plans, teeth, recalls] = await Promise.all([
    query(`${planBase} WHERE tp.patient_id = ? ORDER BY tp.updated_at DESC`, [patientId]),
    query('SELECT * FROM tooth_record WHERE patient_id = ? ORDER BY tooth_no', [patientId]),
    query(`SELECT pr.*, v.visit_no FROM patient_recall pr LEFT JOIN visit v ON v.visit_id = pr.completed_visit_id
            WHERE pr.patient_id = ? ORDER BY pr.due_date`, [patientId])
  ]);
  const planIds = plans.map((p) => p.plan_id);
  const items = planIds.length ? await query(
    `SELECT tpi.*, ti.treatment_name FROM treatment_plan_item tpi
       JOIN treatment_item ti ON ti.treatment_item_id = tpi.treatment_item_id
      WHERE tpi.plan_id IN (${planIds.map(() => '?').join(',')}) ORDER BY tpi.sequence_no, tpi.item_id`,
    planIds
  ) : [];
  res.json({
    patient,
    plans: plans.map((p) => ({ ...p, items: items.filter((i) => i.plan_id === p.plan_id) })),
    teeth,
    recalls
  });
}));

router.post('/treatment-plans', allow('DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const input = planSchema.parse(req.body);
  assertClinicAccess(req.user, input.clinicId);
  const dentistId = req.user.role === 'DENTIST' ? req.user.dentistId : input.dentistId;
  if (!dentistId) throw badRequest('请选择牙医');
  assertDentistWrite(req, dentistId);
  const patient = (await query('SELECT patient_id FROM patient WHERE patient_id = ?', [input.patientId]))[0];
  if (!patient) throw notFound('患者不存在');
  const planId = await transaction(async (conn) => {
    const planNo = makeNo('PLAN');
    const [result] = await conn.execute(
      `INSERT INTO treatment_plan (plan_no, patient_id, clinic_id, dentist_id, title, status, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [planNo, input.patientId, input.clinicId, dentistId, input.title, input.status, input.notes || null, req.user.userId]
    );
    const id = result.insertId;
    let sequence = 0;
    for (const item of input.items) {
      sequence += 1;
      await conn.execute(
        `INSERT INTO treatment_plan_item (plan_id, treatment_item_id, tooth_no, quantity, unit_price, status, sequence_no, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, item.treatmentItemId, item.toothNo || null, item.quantity, item.unitPrice, item.status, sequence, item.note || null]
      );
    }
    await writeAudit(conn, req.user.userId, 'CREATE', 'treatment_plan', id, {
      relatedEntityId: input.patientId,
      afterStatus: input.status,
      details: { planNo, title: input.title, itemCount: input.items.length },
      ipAddress: req.ip
    });
    return id;
  });
  res.status(201).json({ planId, plan: await loadPlan(planId) });
}));

router.patch('/treatment-plans/:id', allow('DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const planId = asId(req.params.id);
  const existing = await loadPlan(planId);
  assertClinicAccess(req.user, existing.clinic_id);
  assertDentistWrite(req, existing.dentist_id);
  const input = z.object({
    title: z.string().trim().min(1).max(150).optional(),
    status: z.enum(PLAN_STATUS).optional(),
    notes: z.string().trim().max(1000).nullable().optional()
  }).parse(req.body);
  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE treatment_plan SET title = ?, status = ?, notes = ? WHERE plan_id = ?`,
      [input.title ?? existing.title, input.status ?? existing.status,
       input.notes === undefined ? existing.notes : (input.notes || null), planId]
    );
    await writeAudit(conn, req.user.userId, 'UPDATE', 'treatment_plan', planId, {
      relatedEntityId: existing.patient_id,
      beforeStatus: existing.status,
      afterStatus: input.status || existing.status,
      details: input,
      ipAddress: req.ip
    });
  });
  res.json({ plan: await loadPlan(planId) });
}));

router.post('/treatment-plans/:id/items', allow('DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const planId = asId(req.params.id);
  const existing = await loadPlan(planId);
  assertClinicAccess(req.user, existing.clinic_id);
  assertDentistWrite(req, existing.dentist_id);
  const input = planItemSchema.parse(req.body);
  const next = (await query('SELECT COALESCE(MAX(sequence_no), 0) + 1 AS n FROM treatment_plan_item WHERE plan_id = ?', [planId]))[0].n;
  await transaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO treatment_plan_item (plan_id, treatment_item_id, tooth_no, quantity, unit_price, status, sequence_no, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [planId, input.treatmentItemId, input.toothNo || null, input.quantity, input.unitPrice, input.status, next, input.note || null]
    );
    await conn.execute('UPDATE treatment_plan SET updated_at = CURRENT_TIMESTAMP(6) WHERE plan_id = ?', [planId]);
    await writeAudit(conn, req.user.userId, 'CREATE', 'treatment_plan_item', result.insertId, {
      relatedEntityId: existing.patient_id,
      details: { planId, ...input },
      ipAddress: req.ip
    });
  });
  res.status(201).json({ plan: await loadPlan(planId) });
}));

router.patch('/treatment-plan-items/:id', allow('DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const itemId = asId(req.params.id);
  const item = (await query(
    `SELECT tpi.*, tp.clinic_id, tp.dentist_id, tp.patient_id FROM treatment_plan_item tpi
       JOIN treatment_plan tp ON tp.plan_id = tpi.plan_id WHERE tpi.item_id = ?`,
    [itemId]
  ))[0];
  if (!item) throw notFound('治疗项目不存在');
  assertClinicAccess(req.user, item.clinic_id);
  assertDentistWrite(req, item.dentist_id);
  const input = planItemPatchSchema.parse(req.body);
  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE treatment_plan_item SET tooth_no=?, quantity=?, unit_price=?, status=?, note=? WHERE item_id=?`,
      [input.toothNo === undefined ? item.tooth_no : (input.toothNo || null),
       input.quantity ?? item.quantity, input.unitPrice ?? item.unit_price,
       input.status ?? item.status,
       input.note === undefined ? item.note : (input.note || null), itemId]
    );
    await conn.execute('UPDATE treatment_plan SET updated_at = CURRENT_TIMESTAMP(6) WHERE plan_id = ?', [item.plan_id]);
    await writeAudit(conn, req.user.userId, 'UPDATE', 'treatment_plan_item', itemId, {
      relatedEntityId: item.patient_id, details: input, ipAddress: req.ip
    });
  });
  res.json({ plan: await loadPlan(item.plan_id) });
}));

router.put('/patients/:id/teeth/:toothNo', allow('DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const patientId = asId(req.params.id);
  const toothNo = String(req.params.toothNo);
  if (!/^(1[1-8]|2[1-8]|3[1-8]|4[1-8])$/.test(toothNo)) throw badRequest('牙位编号无效');
  const input = z.object({
    conditionCode: z.enum(CONDITIONS),
    surface: z.string().trim().max(12).nullable().optional(),
    note: z.string().trim().max(255).nullable().optional()
  }).parse(req.body);
  const patient = (await query('SELECT patient_id FROM patient WHERE patient_id = ?', [patientId]))[0];
  if (!patient) throw notFound('患者不存在');
  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO tooth_record (patient_id, tooth_no, condition_code, surface, note, recorded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE condition_code=VALUES(condition_code), surface=VALUES(surface), note=VALUES(note),
         recorded_by_user_id=VALUES(recorded_by_user_id), recorded_at=CURRENT_TIMESTAMP(6)`,
      [patientId, toothNo, input.conditionCode, input.surface || null, input.note || null, req.user.userId]
    );
    await writeAudit(conn, req.user.userId, 'UPDATE', 'tooth_record', `${patientId}:${toothNo}`, {
      relatedEntityId: patientId, details: input, ipAddress: req.ip
    });
  });
  res.json({ ok: true });
}));

router.get('/recalls', asyncHandler(async (req, res) => {
  const scope = scopedClinicSql(req.user, 'pcr.clinic_id', req.query.clinicId);
  const where = [`EXISTS (SELECT 1 FROM patient_clinic_relation pcr WHERE pcr.patient_id = pr.patient_id AND ${scope.sql})`];
  const params = [...scope.params];
  if (req.query.status) { where.push('pr.status = ?'); params.push(req.query.status); }
  if (req.query.due) {
    if (!['overdue', 'week', 'month'].includes(req.query.due)) throw badRequest('召回范围无效');
    if (req.query.due === 'overdue') where.push('pr.due_date < CURDATE()');
    if (req.query.due === 'week') where.push('pr.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)');
    if (req.query.due === 'month') where.push('pr.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)');
  }
  const rows = await query(
    `SELECT pr.*, p.patient_no, p.patient_name, p.phone,
            (SELECT c.clinic_no FROM patient_clinic_relation pcr2 JOIN clinic c ON c.clinic_id = pcr2.clinic_id
              WHERE pcr2.patient_id = pr.patient_id ORDER BY pcr2.clinic_id LIMIT 1) AS clinic_no
       FROM patient_recall pr
       JOIN patient p ON p.patient_id = pr.patient_id
      WHERE ${where.join(' AND ')}
      ORDER BY pr.due_date, pr.recall_id LIMIT 200`,
    params
  );
  res.json({ items: rows });
}));

router.post('/recalls', allow('DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER', 'FRONT_DESK'), asyncHandler(async (req, res) => {
  const input = z.object({
    patientId: z.coerce.number().int().positive(),
    recallType: z.enum(['EXAM', 'CLEANING', 'PERIO', 'ORTHO']).default('EXAM'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(255).nullable().optional()
  }).parse(req.body);
  const patient = (await query('SELECT patient_id FROM patient WHERE patient_id = ?', [input.patientId]))[0];
  if (!patient) throw notFound('患者不存在');
  const recallId = await transaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO patient_recall (patient_id, recall_type, due_date, note, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [input.patientId, input.recallType, input.dueDate, input.note || null, req.user.userId]
    );
    await writeAudit(conn, req.user.userId, 'CREATE', 'patient_recall', result.insertId, {
      relatedEntityId: input.patientId, details: input, ipAddress: req.ip
    });
    return result.insertId;
  }).catch((error) => {
    if (error.code === 'ER_DUP_ENTRY') throw conflict('该患者同期召回已存在');
    throw error;
  });
  res.status(201).json({ recallId });
}));

router.patch('/recalls/:id', allow('DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER', 'FRONT_DESK'), asyncHandler(async (req, res) => {
  const recallId = asId(req.params.id);
  const existing = (await query('SELECT * FROM patient_recall WHERE recall_id = ?', [recallId]))[0];
  if (!existing) throw notFound('召回记录不存在');
  const input = z.object({
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(['DUE', 'SCHEDULED', 'COMPLETED', 'DISMISSED']).optional(),
    note: z.string().trim().max(255).nullable().optional()
  }).parse(req.body);
  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE patient_recall SET due_date=?, status=?, note=? WHERE recall_id=?`,
      [input.dueDate ?? existing.due_date, input.status ?? existing.status,
       input.note === undefined ? existing.note : (input.note || null), recallId]
    );
    await writeAudit(conn, req.user.userId, 'UPDATE', 'patient_recall', recallId, {
      relatedEntityId: existing.patient_id, details: input, ipAddress: req.ip
    });
  });
  res.json({ ok: true });
}));

export default router;
