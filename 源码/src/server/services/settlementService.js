import { conflict, notFound } from '../errors.js';
import { makeNo, nowUtcSql, toUtcSql } from '../utils.js';
import { writeAudit } from '../audit.js';
import { fromCents, toCents } from '../money.js';
import { applyDepositAndCreateBalance } from './depositService.js';

export async function createSettlement(connection, { visitId, actorUserId, settlementDate = null, ipAddress = null }) {
  const [visitRows] = await connection.execute(
    "SELECT v.*, a.dentist_id, a.clinic_id, a.patient_id, a.appointment_id FROM visit v JOIN appointment a ON a.appointment_id=v.appointment_id WHERE v.visit_id=? FOR UPDATE",
    [visitId]
  );
  const visit = visitRows[0];
  if (!visit) throw notFound('就诊记录不存在');
  if (visit.status === 'VOID') throw conflict('已作废就诊不能结算');
  const [activeRows] = await connection.execute("SELECT settlement_id FROM settlement WHERE visit_id=? AND status='ACTIVE' FOR UPDATE", [visitId]);
  if (activeRows.length) throw conflict('该就诊已有有效结算单，不能重复生成', { settlementId: activeRows[0].settlement_id });
  const [exceptions] = await connection.execute(
    `SELECT se.exception_id FROM settlement_exception se
       JOIN settlement s ON s.settlement_id=se.settlement_id
      WHERE s.visit_id=? AND se.status IN ('PENDING','IN_REVIEW') LIMIT 1`,
    [visitId]
  );
  if (exceptions.length) throw conflict('该就诊存在作废后的待处理资金异常，不能重新结算', { exceptionId: exceptions[0].exception_id });
  const [totals] = await connection.execute(
    "SELECT COUNT(*) AS line_count, CAST(COALESCE(SUM(td.subtotal),0) AS CHAR) AS total FROM treatment_detail td WHERE td.visit_id=? AND td.status='ACTIVE'",
    [visitId]
  );
  if (!totals[0].line_count) throw conflict('该就诊没有有效治疗明细，无法生成结算单');
  const totalCents = toCents(totals[0].total);
  if (totalCents < 0n) throw conflict('结算金额异常');
  const [versionRows] = await connection.execute("SELECT COALESCE(MAX(version_no),0)+1 AS next_version, MAX(settlement_id) AS latest_id FROM settlement WHERE visit_id=?", [visitId]);
  const nextVersion = Number(versionRows[0].next_version);
  const latestId = versionRows[0].latest_id || null;
  const settlementNo = makeNo('STL');
  const date = toUtcSql(settlementDate || nowUtcSql());
  const [inserted] = await connection.execute(
    "INSERT INTO settlement (settlement_no, visit_id, version_no, settlement_date, total_amount, status, replaces_settlement_id, generated_by_user_id) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)",
    [settlementNo, visitId, nextVersion, date, fromCents(totalCents), latestId, actorUserId]
  );
  await connection.execute(
    "INSERT INTO settlement_detail (settlement_id, treatment_detail_id, treatment_item_id, treatment_name_snapshot, unit_quantity_snapshot, unit_price_snapshot, subtotal) "
    + "SELECT ?, td.treatment_detail_id, td.treatment_item_id, ti.treatment_name, td.unit_quantity, td.unit_price_snapshot, td.subtotal "
    + "FROM treatment_detail td JOIN treatment_item ti ON ti.treatment_item_id=td.treatment_item_id WHERE td.visit_id=? AND td.status='ACTIVE'",
    [inserted.insertId, visitId]
  );
  await connection.execute("UPDATE visit SET status='COMPLETED' WHERE visit_id=?", [visitId]);
  const funding = await applyDepositAndCreateBalance(connection, {
    settlementId: inserted.insertId,
    visitId,
    appointmentId: visit.appointment_id,
    patientId: visit.patient_id,
    clinicId: visit.clinic_id,
    totalAmount: fromCents(totalCents),
    actorUserId,
    ipAddress
  });
  const action = latestId ? 'REGENERATE_SETTLEMENT' : 'CREATE_SETTLEMENT';
  await writeAudit(connection, actorUserId, action, 'settlement', inserted.insertId, {
    relatedEntityId: visitId, afterStatus: 'ACTIVE',
    details: {
      settlementNo, visitNo: visit.visit_no, totalAmount: fromCents(totalCents), versionNo: nextVersion,
      depositAvailable: funding.depositAvailable, depositApplied: funding.applied,
      balanceDue: funding.balance, differenceRefund: funding.difference
    }, ipAddress
  });
  return {
    settlementId: inserted.insertId,
    settlementNo,
    totalAmount: Number(fromCents(totalCents)),
    versionNo: nextVersion,
    funding
  };
}
