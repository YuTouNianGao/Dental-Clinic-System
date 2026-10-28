import { conflict } from '../errors.js';
import { makeNo } from '../utils.js';
import { fromCents, minCents, toCents } from '../money.js';
import { writeAudit } from '../audit.js';

// Applies the paid, unrefunded, unapplied deposit balance to a newly created
// ACTIVE settlement and records a balance order / difference refund.
// The settlement total itself is never changed.
export async function applyDepositAndCreateBalance(connection, {
  settlementId, visitId, appointmentId, patientId, clinicId, totalAmount, actorUserId, ipAddress
}) {
  const [orders] = await connection.execute(
    "SELECT * FROM payment_order WHERE appointment_id=? AND order_type='APPOINTMENT_DEPOSIT' FOR UPDATE",
    [appointmentId]
  );
  const deposit = orders[0] || null;
  const settlementCents = toCents(totalAmount);
  let depositAvailable = 0n;
  let applied = 0n;

  if (deposit) {
    if (deposit.amount_refund_reserved && toCents(deposit.amount_refund_reserved) > 0n) {
      throw conflict('预约金退款处理中，暂不能生成结算；请先完成退款审核或人工处理');
    }
    if (deposit.status === 'REFUNDING') throw conflict('预约金退款处理中，暂不能生成结算');
    depositAvailable = toCents(deposit.amount_paid)
      - toCents(deposit.amount_applied)
      - toCents(deposit.amount_refunded)
      - toCents(deposit.amount_refund_reserved);
    if (depositAvailable < 0n) throw conflict('预约金余额异常，暂停结算');
    applied = minCents(depositAvailable, settlementCents);
  }

  if (deposit && applied > 0n) {
    const [application] = await connection.execute(
      `INSERT INTO deposit_application
        (deposit_order_id, settlement_id, appointment_id, amount_applied, status)
       VALUES (?, ?, ?, ?, 'APPLIED')`,
      [deposit.order_id, settlementId, appointmentId, fromCents(applied)]
    );
    await connection.execute(
      'UPDATE payment_order SET amount_applied=amount_applied+? WHERE order_id=?',
      [fromCents(applied), deposit.order_id]
    );
    await writeAudit(connection, actorUserId, 'APPLY_DEPOSIT', 'deposit_application', application.insertId, {
      relatedEntityId: settlementId, afterStatus: 'APPLIED',
      details: { depositOrderId: deposit.order_id, amount: fromCents(applied) }, ipAddress
    });
  }

  const balance = settlementCents - applied;
  if (balance > 0n) {
    const orderNo = makeNo('PAY');
    await connection.execute(
      `INSERT INTO payment_order
        (order_no, patient_id, clinic_id, visit_id, settlement_id, order_type, amount, status,
         idempotency_key, expires_at, description)
       VALUES (?, ?, ?, ?, ?, 'VISIT_BALANCE', ?, 'PENDING_PAYMENT', ?, NULL, ?)`,
      [orderNo, patientId, clinicId, visitId, settlementId, fromCents(balance),
       `STL:${settlementId}:BALANCE`, '诊后应付余额']
    );
    await writeAudit(connection, actorUserId, 'CREATE_PAYMENT_ORDER', 'payment_order', orderNo, {
      relatedEntityId: settlementId, afterStatus: 'PENDING_PAYMENT',
      details: { orderType: 'VISIT_BALANCE', amount: fromCents(balance) }, ipAddress
    });
  }

  const difference = depositAvailable - applied;
  if (deposit && difference > 0n) {
    const [transactions] = await connection.execute(
      `SELECT * FROM payment_transaction
        WHERE order_id=? AND status IN ('SUCCEEDED','CONFIRMED')
        ORDER BY transaction_id LIMIT 1`,
      [deposit.order_id]
    );
    const tx = transactions[0];
    const refundNo = makeNo('RFD');
    const [refund] = await connection.execute(
      `INSERT INTO refund
        (refund_no, order_id, payment_transaction_id, appointment_id, settlement_id,
         deposit_application_id, reason_code, reason_text, amount, status,
         requested_by_type, idempotency_key, refund_key)
       VALUES (?, ?, ?, ?, ?, NULL, 'DEPOSIT_DIFFERENCE', '结算金额低于可用预约金，自动差额退款',
               ?, 'SUCCEEDED', 'SYSTEM', ?, ?)`,
      [refundNo, deposit.order_id, tx?.transaction_id || null, appointmentId, settlementId,
       fromCents(difference), `DIFF:${settlementId}:${deposit.order_id}`,
       `DIFF:${settlementId}:${deposit.order_id}`]
    );
    if (tx) {
      await connection.execute(
        'INSERT INTO refund_allocation (refund_id, payment_transaction_id, amount) VALUES (?, ?, ?)',
        [refund.insertId, tx.transaction_id, fromCents(difference)]
      );
    }
    await connection.execute(
      "UPDATE payment_order SET amount_refunded=amount_refunded+?, status=CASE WHEN amount_refunded >= amount_paid THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END WHERE order_id=?",
      [fromCents(difference), deposit.order_id]
    );
    await writeAudit(connection, actorUserId, 'REFUND_SUCCESS', 'refund', refund.insertId, {
      relatedEntityId: settlementId, afterStatus: 'SUCCEEDED',
      details: { reason: 'DEPOSIT_DIFFERENCE', amount: fromCents(difference) }, ipAddress
    });
  }

  return {
    depositAvailable: fromCents(depositAvailable),
    applied: fromCents(applied),
    balance: fromCents(balance),
    difference: fromCents(difference)
  };
}
