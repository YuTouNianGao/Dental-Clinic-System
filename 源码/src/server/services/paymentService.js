import { pool, query, transaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { conflict, notFound } from '../errors.js';
import { makeNo, nowUtcSql } from '../utils.js';
import { fromCents, toCents } from '../money.js';

function cents(value) {
  return toCents(value === null || value === undefined ? 0 : value);
}

function orderValues(order) {
  const amount = cents(order.amount);
  const paid = cents(order.amount_paid);
  const applied = cents(order.amount_applied);
  const refunded = cents(order.amount_refunded);
  const reserved = cents(order.amount_refund_reserved);
  return {
    amount,
    paid,
    applied,
    refunded,
    reserved,
    availableDeposit: paid - applied - refunded - reserved,
    outstandingBalance: amount - (paid - refunded)
  };
}

function serializeOrder(row) {
  if (!row) return null;
  const values = orderValues(row);
  return {
    ...row,
    amount: fromCents(values.amount),
    amount_paid: fromCents(values.paid),
    amount_applied: fromCents(values.applied),
    amount_refunded: fromCents(values.refunded),
    amount_refund_reserved: fromCents(values.reserved),
    available_deposit: fromCents(values.availableDeposit),
    outstanding_balance: fromCents(values.outstandingBalance)
  };
}

export async function loadOrder(orderId) {
  const rows = await query('SELECT * FROM payment_order WHERE order_id=?', [orderId]);
  return serializeOrder(rows[0]);
}

export async function payMockOrder({ orderId, patientId, actorUserId, outcome, idempotencyKey, ipAddress }) {
  return transaction(async (conn) => {
    const [orders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [orderId]);
    const order = orders[0];
    if (!order) throw notFound('支付订单不存在');
    if (Number(order.patient_id) !== Number(patientId)) throw notFound('支付订单不存在');

    const key = String(idempotencyKey || `MOCK:${orderId}:${outcome}`);
    const [existing] = await conn.execute(
      'SELECT * FROM payment_transaction WHERE order_id=? AND idempotency_key=?',
      [orderId, key]
    );
    if (existing[0]) {
      return { order: serializeOrder(order), transaction: existing[0], duplicate: true };
    }

    const values = orderValues(order);
    if (values.outstandingBalance <= 0n && order.order_type === 'VISIT_BALANCE') {
      throw conflict('订单已结清');
    }
    if (order.status === 'CLOSED' || order.status === 'CANCELLED' || order.status === 'FORFEITED') {
      throw conflict('订单已关闭，不能支付');
    }
    if (order.order_type === 'APPOINTMENT_DEPOSIT' && order.status !== 'PENDING_PAYMENT') {
      throw conflict('预约金订单已支付');
    }

    let appointment = null;
    if (order.order_type === 'APPOINTMENT_DEPOSIT') {
      if (order.expires_at && new Date(String(order.expires_at).replace(' ', 'T') + 'Z') <= new Date()) {
        throw conflict('预约支付时间已过，订单已关闭');
      }
      const [appointments] = await conn.execute(
        'SELECT * FROM appointment WHERE appointment_id=? FOR UPDATE',
        [order.appointment_id]
      );
      appointment = appointments[0];
      if (!appointment || appointment.status !== 'PENDING_PAYMENT') throw conflict('预约已不可确认');
      if (appointment.hold_expires_at && new Date(String(appointment.hold_expires_at).replace(' ', 'T') + 'Z') <= new Date()) {
        throw conflict('预约占位已过期');
      }
    }

    const paymentAmount = order.order_type === 'VISIT_BALANCE' ? values.outstandingBalance : values.amount;
    if (paymentAmount <= 0n) throw conflict('订单没有可支付金额');
    const transactionStatus = outcome === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED';
    const transactionNo = makeNo('TXN');
    const [inserted] = await conn.execute(
      `INSERT INTO payment_transaction
        (transaction_no, order_id, clinic_id, order_type_snapshot, amount, channel, status,
         idempotency_key, requested_by_user_id, failure_code, failure_message, order_status_snapshot)
       VALUES (?, ?, ?, ?, ?, 'MOCK', ?, ?, ?, ?, ?, ?)`,
      [
        transactionNo, orderId, order.clinic_id, order.order_type, fromCents(paymentAmount),
        transactionStatus, key, actorUserId,
        transactionStatus === 'FAILED' ? 'MOCK_FAILURE' : null,
        transactionStatus === 'FAILED' ? '模拟支付失败' : null,
        order.status
      ]
    );
    if (transactionStatus === 'SUCCEEDED') {
      if (order.order_type === 'APPOINTMENT_DEPOSIT') {
        await conn.execute(
          "UPDATE payment_order SET status='PAID', amount_paid=?, paid_at=UTC_TIMESTAMP(6) WHERE order_id=?",
          [fromCents(values.amount), orderId]
        );
        await conn.execute(
          "UPDATE appointment SET status='SCHEDULED', confirmed_at=UTC_TIMESTAMP(6), hold_expires_at=NULL WHERE appointment_id=?",
          [order.appointment_id]
        );
        await writeAudit(conn, actorUserId, 'CONFIRM_APPOINTMENT', 'appointment', appointment.appointment_id, {
          beforeStatus: 'PENDING_PAYMENT', afterStatus: 'SCHEDULED', relatedEntityId: orderId, ipAddress
        });
      } else {
        const paid = values.paid + paymentAmount;
        await conn.execute(
          "UPDATE payment_order SET status=?, amount_paid=?, paid_at=COALESCE(paid_at, UTC_TIMESTAMP(6)) WHERE order_id=?",
          [paid >= values.amount ? 'PAID' : 'PARTIALLY_PAID', fromCents(paid), orderId]
        );
      }
      await writeAudit(conn, actorUserId, 'PAYMENT_SUCCESS', 'payment_order', orderId, {
        afterStatus: 'PAID', relatedEntityId: order.appointment_id || order.settlement_id,
        details: { amount: fromCents(values.amount), channel: 'MOCK' }, ipAddress
      });
    } else {
      await writeAudit(conn, actorUserId, 'PAYMENT_FAILED', 'payment_order', orderId, {
        beforeStatus: order.status, afterStatus: order.status, reason: '模拟支付失败',
        details: { amount: fromCents(values.amount), channel: 'MOCK' }, ipAddress
      });
    }

    const [freshOrders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=?', [orderId]);
    return {
      order: serializeOrder(freshOrders[0]),
      transaction: { ...inserted, transaction_id: inserted.insertId, status: transactionStatus },
      duplicate: false
    };
  });
}

export async function createRefund(conn, {
  order,
  amount,
  reasonCode,
  reasonText = null,
  requestedByType = 'SYSTEM',
  requestedByUserId = null,
  idempotencyKey,
  refundKey,
  appointmentId = null,
  appointmentChangeId = null,
  settlementId = null,
  depositApplicationId = null,
  settlementExceptionId = null,
  ipAddress = null
}) {
  const [orders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [order.id || order.order_id]);
  const locked = orders[0];
  if (!locked) throw notFound('支付订单不存在');
  if (refundKey) {
    const [existing] = await conn.execute('SELECT * FROM refund WHERE refund_key=?', [refundKey]);
    if (existing[0]) return existing[0];
  }
  const values = orderValues(locked);
  const requested = cents(amount);
  if (requested <= 0n) throw conflict('退款金额必须大于 0');
  if (requested > values.paid - values.applied - values.refunded - values.reserved) {
    throw conflict('退款金额超过可退余额');
  }
  const refundNo = makeNo('RFD');
  const key = idempotencyKey || refundKey || `${reasonCode}:${locked.order_id}:${fromCents(requested)}`;
  const [result] = await conn.execute(
    `INSERT INTO refund
      (refund_no, order_id, payment_transaction_id, appointment_id, appointment_change_id, settlement_id,
       deposit_application_id, settlement_exception_id, reason_code, reason_text, amount, status,
       requested_by_type, requested_by_user_id, idempotency_key, refund_key)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, ?)`,
    [
      refundNo, locked.order_id, appointmentId, appointmentChangeId, settlementId,
      depositApplicationId, settlementExceptionId, reasonCode, reasonText, fromCents(requested),
      requestedByType, requestedByUserId, key, refundKey || key
    ]
  );
  await conn.execute(
    'UPDATE payment_order SET amount_refund_reserved = amount_refund_reserved + ? WHERE order_id=?',
    [fromCents(requested), locked.order_id]
  );
  await writeAudit(conn, requestedByUserId, 'REFUND_REQUEST', 'refund', result.insertId, {
    relatedEntityId: locked.order_id, afterStatus: 'PENDING_REVIEW',
    details: { amount: fromCents(requested), reasonCode }, ipAddress
  });
  return { refund_id: result.insertId, refund_no: refundNo, order_id: locked.order_id, amount: fromCents(requested), status: 'PENDING_REVIEW' };
}

export async function approveRefund({ refundId, reviewerUserId, note, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM refund WHERE refund_id=? FOR UPDATE', [refundId]);
    const refund = rows[0];
    if (!refund) throw notFound('退款任务不存在');
    if (!['PENDING_REVIEW', 'NEEDS_INFO'].includes(refund.status)) throw conflict('当前退款状态不能审批');
    if (Number(refund.requested_by_user_id) === Number(reviewerUserId)) throw conflict('不能审批自己提交的退款');
    await conn.execute(
      "UPDATE refund SET status='APPROVED', reviewed_by_user_id=?, reviewed_at=UTC_TIMESTAMP(6), review_note=? WHERE refund_id=?",
      [reviewerUserId, note || null, refundId]
    );
    await writeAudit(conn, reviewerUserId, 'REFUND_APPROVE', 'refund', refundId, {
      beforeStatus: refund.status, afterStatus: 'APPROVED', reason: note || null, ipAddress
    });
    return { ...refund, status: 'APPROVED' };
  });
}

export async function requestRefundInfo({ refundId, reviewerUserId, note, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM refund WHERE refund_id=? FOR UPDATE', [refundId]);
    const refund = rows[0];
    if (!refund) throw notFound('退款任务不存在');
    if (refund.status !== 'PENDING_REVIEW') throw conflict('只有待审核退款可以要求补充资料');
    await conn.execute(
      "UPDATE refund SET status='NEEDS_INFO', reviewed_by_user_id=?, reviewed_at=UTC_TIMESTAMP(6), review_note=? WHERE refund_id=?",
      [reviewerUserId, note || null, refundId]
    );
    await writeAudit(conn, reviewerUserId, 'REFUND_REJECT', 'refund', refundId, {
      beforeStatus: refund.status, afterStatus: 'NEEDS_INFO', reason: note || null, ipAddress
    });
    return { ...refund, status: 'NEEDS_INFO' };
  });
}

export async function rejectRefund({ refundId, reviewerUserId, note, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM refund WHERE refund_id=? FOR UPDATE', [refundId]);
    const refund = rows[0];
    if (!refund) throw notFound('退款任务不存在');
    if (!['PENDING_REVIEW', 'NEEDS_INFO'].includes(refund.status)) throw conflict('当前退款状态不能驳回');
    if (Number(refund.requested_by_user_id) === Number(reviewerUserId)) throw conflict('不能审批自己提交的退款');
    // Rejection does NOT forfeit funds. The reservation stays in place and the
    // funds remain frozen/disputed until a separate manual decision.
    await conn.execute(
      "UPDATE refund SET status='REJECTED', reviewed_by_user_id=?, reviewed_at=UTC_TIMESTAMP(6), review_note=? WHERE refund_id=?",
      [reviewerUserId, note || null, refundId]
    );
    await writeAudit(conn, reviewerUserId, 'REFUND_REJECT', 'refund', refundId, {
      beforeStatus: refund.status, afterStatus: 'REJECTED', reason: note || null,
      details: { fundsHeld: true }, ipAddress
    });
    return { ...refund, status: 'REJECTED' };
  });
}

async function allocateRefund(conn, refund) {
  const amount = cents(refund.amount);
  let remaining = amount;
  const [transactions] = await conn.execute(
    `SELECT pt.*, COALESCE(SUM(ra.amount),0) AS already_allocated
       FROM payment_transaction pt
       LEFT JOIN refund_allocation ra ON ra.payment_transaction_id=pt.transaction_id
      WHERE pt.order_id=? AND pt.status IN ('SUCCEEDED','CONFIRMED')
      GROUP BY pt.transaction_id
      ORDER BY pt.transaction_id`,
    [refund.order_id]
  );
  for (const tx of transactions) {
    if (remaining <= 0n) break;
    const available = cents(tx.amount) - cents(tx.already_allocated || 0);
    if (available <= 0n) continue;
    const take = available < remaining ? available : remaining;
    await conn.execute(
      'INSERT INTO refund_allocation (refund_id, payment_transaction_id, amount) VALUES (?, ?, ?)',
      [refund.refund_id, tx.transaction_id, fromCents(take)]
    );
    remaining -= take;
  }
  if (remaining > 0n) throw conflict('退款分摊失败，支付流水可退余额不足');
}

export async function processRefundMock({ refundId, processorUserId, outcome, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM refund WHERE refund_id=? FOR UPDATE', [refundId]);
    const refund = rows[0];
    if (!refund) throw notFound('退款任务不存在');
    if (!['APPROVED', 'FAILED'].includes(refund.status)) throw conflict('当前退款状态不能执行');
    await conn.execute(
      "UPDATE refund SET status='PROCESSING', processed_by_user_id=?, processed_at=UTC_TIMESTAMP(6), attempt_count=attempt_count+1 WHERE refund_id=?",
      [processorUserId, refundId]
    );
    if (outcome !== 'SUCCESS') {
      await conn.execute(
        "UPDATE refund SET status='FAILED', failure_code='MOCK_REFUND_FAILURE', failure_message='模拟退款失败' WHERE refund_id=?",
        [refundId]
      );
      await writeAudit(conn, processorUserId, 'REFUND_FAILED', 'refund', refundId, {
        beforeStatus: 'PROCESSING', afterStatus: 'FAILED', ipAddress
      });
      return { ...refund, status: 'FAILED' };
    }

    await allocateRefund(conn, refund);
    await conn.execute(
      "UPDATE refund SET status='SUCCEEDED', failure_code=NULL, failure_message=NULL, processed_at=UTC_TIMESTAMP(6) WHERE refund_id=?",
      [refundId]
    );
    await conn.execute(
      "UPDATE payment_order SET amount_refund_reserved=GREATEST(amount_refund_reserved-?,0), amount_refunded=amount_refunded+?, status=CASE WHEN amount_refunded >= amount_paid THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END WHERE order_id=?",
      [refund.amount, refund.amount, refund.order_id]
    );
    await writeAudit(conn, processorUserId, 'REFUND_SUCCESS', 'refund', refundId, {
      beforeStatus: 'PROCESSING', afterStatus: 'SUCCEEDED', relatedEntityId: refund.order_id,
      details: { amount: fromCents(cents(refund.amount)) }, ipAddress
    });
    return { ...refund, status: 'SUCCEEDED' };
  });
}

export async function recordLatePayment({ orderId, actorUserId, ipAddress }) {
  return transaction(async (conn) => {
    const [orders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [orderId]);
    const order = orders[0];
    if (!order) throw notFound('支付订单不存在');
    if (!['CLOSED', 'CANCELLED'].includes(order.status)) throw conflict('只有已关闭订单可以登记晚到支付');
    const [existing] = await conn.execute(
      "SELECT transaction_id FROM payment_transaction WHERE order_id=? AND status='SUCCEEDED' LIMIT 1",
      [orderId]
    );
    if (existing.length) throw conflict('该订单已有成功支付流水');
    const amount = cents(order.amount);
    const transactionNo = makeNo('TXN');
    const [tx] = await conn.execute(
      `INSERT INTO payment_transaction
        (transaction_no, order_id, clinic_id, order_type_snapshot, amount, channel, status,
         idempotency_key, requested_by_user_id, order_status_snapshot, note)
       VALUES (?, ?, ?, ?, ?, 'MOCK', 'SUCCEEDED', ?, ?, ?, '晚到支付成功补偿')`,
      [transactionNo, orderId, order.clinic_id, order.order_type, fromCents(amount),
       `LATE:${transactionNo}`, actorUserId, order.status]
    );
    await conn.execute(
      "UPDATE payment_order SET amount_paid=?, paid_at=UTC_TIMESTAMP(6), description=CONCAT(COALESCE(description,''), ' | 晚到支付待补偿') WHERE order_id=?",
      [fromCents(amount), orderId]
    );
    const refundNo = makeNo('RFD');
    const [refund] = await conn.execute(
      `INSERT INTO refund
        (refund_no, order_id, payment_transaction_id, appointment_id, reason_code, reason_text, amount,
         status, requested_by_type, idempotency_key, refund_key)
       VALUES (?, ?, ?, ?, 'PAYMENT_AFTER_CLOSE_COMPENSATION', '订单关闭后晚到支付成功，全额补偿退款待审核',
               ?, 'PENDING_REVIEW', 'SYSTEM', ?, ?)`,
      [refundNo, orderId, tx.insertId, order.appointment_id, fromCents(amount),
       `COMP:${tx.insertId}`, `COMP:${tx.insertId}`]
    );
    await conn.execute(
      'UPDATE payment_order SET amount_refund_reserved=amount_refund_reserved+? WHERE order_id=?',
      [fromCents(amount), orderId]
    );
    await writeAudit(conn, actorUserId, 'PAYMENT_SUCCESS', 'payment_order', orderId, {
      afterStatus: order.status, relatedEntityId: tx.insertId,
      details: { late: true, amount: fromCents(amount), compensationRefundId: refund.insertId }, ipAddress
    });
    return {
      transactionId: tx.insertId,
      refundId: refund.insertId,
      refundNo,
      amount: fromCents(amount),
      orderStatus: order.status,
      message: '晚到支付已记录；预约未恢复，已生成全额补偿退款任务'
    };
  });
}

export async function forfeitDeposit({ orderId, actorUserId, reasonCode, note, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw notFound('支付订单不存在');
    if (order.order_type !== 'APPOINTMENT_DEPOSIT') throw conflict('只有预约金订单可以没收');
    if (order.status === 'REFUNDED') throw conflict('已退款订单不能没收');
    await conn.execute(
      `UPDATE payment_order
          SET status='FORFEITED', amount_refund_reserved=0, forfeited_at=UTC_TIMESTAMP(6),
              forfeited_reason_code=?, forfeited_by_user_id=?
        WHERE order_id=?`,
      [reasonCode || 'MANUAL_FORFEITURE', actorUserId, orderId]
    );
    await writeAudit(conn, actorUserId, 'FORFEIT_DEPOSIT', 'payment_order', orderId, {
      beforeStatus: order.status, afterStatus: 'FORFEITED', reason: note || reasonCode,
      details: { amount: fromCents(cents(order.amount_paid)) }, ipAddress
    });
    return { ...order, status: 'FORFEITED' };
  });
}

export async function recordOfflinePayment({ orderId, amount, channel, receiptNo, actorUserId, note, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw notFound('支付订单不存在');
    if (order.order_type !== 'VISIT_BALANCE') throw conflict('只有诊后余额订单可以登记线下收款');
    if (!['PENDING_PAYMENT', 'PARTIALLY_PAID'].includes(order.status)) throw conflict('订单当前不可收款');
    const values = orderValues(order);
    const requested = cents(amount);
    if (requested <= 0n) throw conflict('收款金额必须大于 0');
    if (requested > values.outstandingBalance) throw conflict('收款金额超过欠款余额');
    const key = `OFFLINE:${orderId}:${receiptNo}`;
    const [existing] = await conn.execute(
      'SELECT * FROM payment_transaction WHERE order_id=? AND idempotency_key=?',
      [orderId, key]
    );
    if (existing[0]) return existing[0];
    const [result] = await conn.execute(
      `INSERT INTO payment_transaction
        (transaction_no, order_id, clinic_id, order_type_snapshot, amount, channel, status,
         idempotency_key, recorded_by_user_id, receipt_no, note)
       VALUES (?, ?, ?, 'VISIT_BALANCE', ?, ?, 'RECORDED', ?, ?, ?, ?)`,
      [makeNo('TXN'), orderId, order.clinic_id, fromCents(requested), channel, key, actorUserId, receiptNo, note || null]
    );
    await writeAudit(conn, actorUserId, 'RECORD_OFFLINE_PAYMENT', 'payment_transaction', result.insertId, {
      relatedEntityId: orderId, afterStatus: 'RECORDED', details: { amount: fromCents(requested), channel, receiptNo }, ipAddress
    });
    return { transaction_id: result.insertId, amount: fromCents(requested), status: 'RECORDED' };
  });
}

export async function confirmOfflinePayment({ transactionId, actorUserId, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM payment_transaction WHERE transaction_id=? FOR UPDATE', [transactionId]);
    const tx = rows[0];
    if (!tx) throw notFound('收款记录不存在');
    if (tx.status !== 'RECORDED') throw conflict('该收款记录已确认或已冲正');
    const [orders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [tx.order_id]);
    const order = orders[0];
    if (!order) throw notFound('支付订单不存在');
    if (!['PENDING_PAYMENT', 'PARTIALLY_PAID'].includes(order.status)) throw conflict('订单当前不可确认收款');
    const values = orderValues(order);
    const amount = cents(tx.amount);
    if (amount > values.outstandingBalance) throw conflict('确认金额超过欠款余额');
    await conn.execute(
      "UPDATE payment_transaction SET status='CONFIRMED', confirmed_by_user_id=?, confirmed_at=UTC_TIMESTAMP(6) WHERE transaction_id=?",
      [actorUserId, transactionId]
    );
    const paid = values.paid + amount;
    await conn.execute(
      "UPDATE payment_order SET amount_paid=?, status=? WHERE order_id=?",
      [fromCents(paid), paid >= values.amount ? 'PAID' : 'PARTIALLY_PAID', order.order_id]
    );
    await writeAudit(conn, actorUserId, 'CONFIRM_OFFLINE_PAYMENT', 'payment_transaction', transactionId, {
      relatedEntityId: order.order_id, beforeStatus: 'RECORDED', afterStatus: 'CONFIRMED',
      details: { amount: fromCents(amount) }, ipAddress
    });
    return { ...tx, status: 'CONFIRMED' };
  });
}

export async function voidOfflinePayment({ transactionId, actorUserId, reason, ipAddress }) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM payment_transaction WHERE transaction_id=? FOR UPDATE', [transactionId]);
    const tx = rows[0];
    if (!tx) throw notFound('收款记录不存在');
    if (!['RECORDED', 'CONFIRMED'].includes(tx.status)) throw conflict('该收款记录不可冲正');
    const [orders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [tx.order_id]);
    const order = orders[0];
    if (!order) throw notFound('支付订单不存在');
    if (tx.status === 'CONFIRMED') {
      const values = orderValues(order);
      const paid = values.paid - cents(tx.amount);
      await conn.execute(
        "UPDATE payment_order SET amount_paid=?, status=CASE WHEN ? <= 0 THEN 'PENDING_PAYMENT' ELSE 'PARTIALLY_PAID' END WHERE order_id=?",
        [fromCents(paid < 0n ? 0n : paid), fromCents(paid < 0n ? 0n : paid), order.order_id]
      );
    }
    await conn.execute(
      "UPDATE payment_transaction SET status='VOID', note=CONCAT(COALESCE(note,''), ?) WHERE transaction_id=?",
      [`${reason ? ` | 冲正：${reason}` : ' | 冲正'}`, transactionId]
    );
    await writeAudit(conn, actorUserId, 'VOID_OFFLINE_PAYMENT', 'payment_transaction', transactionId, {
      relatedEntityId: order.order_id, beforeStatus: tx.status, afterStatus: 'VOID', reason: reason || null, ipAddress
    });
    return { ...tx, status: 'VOID' };
  });
}

export async function expirePendingAppointments(limit = 50) {
  const rows = await query(
    `SELECT order_id FROM payment_order
      WHERE order_type='APPOINTMENT_DEPOSIT' AND status='PENDING_PAYMENT'
        AND expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP(6)
      ORDER BY expires_at LIMIT ?`,
    [limit]
  );
  let expired = 0;
  for (const row of rows) {
    try {
      const changed = await transaction(async (conn) => {
        const [orders] = await conn.execute('SELECT * FROM payment_order WHERE order_id=? FOR UPDATE', [row.order_id]);
        const order = orders[0];
        if (!order || order.status !== 'PENDING_PAYMENT') return false;
        const [appointments] = await conn.execute('SELECT * FROM appointment WHERE appointment_id=? FOR UPDATE', [order.appointment_id]);
        const appointment = appointments[0];
        if (!appointment || appointment.status !== 'PENDING_PAYMENT') return false;
        if (order.expires_at && new Date(String(order.expires_at).replace(' ', 'T') + 'Z') > new Date()) return false;
        await conn.execute(
          "UPDATE payment_order SET status='CLOSED', closed_at=UTC_TIMESTAMP(6) WHERE order_id=?",
          [order.order_id]
        );
        await conn.execute(
          "UPDATE appointment SET status='EXPIRED' WHERE appointment_id=?",
          [order.appointment_id]
        );
        await writeAudit(conn, null, 'EXPIRE_APPOINTMENT', 'appointment', order.appointment_id, {
          beforeStatus: 'PENDING_PAYMENT', afterStatus: 'EXPIRED', relatedEntityId: order.order_id
        });
        return true;
      });
      if (changed) expired += 1;
    } catch (error) {
      console.error('Expire pending appointment failed:', error.message);
    }
  }
  return expired;
}

export async function closeOrderForCancellation(conn, order) {
  if (!order) return;
  if (order.order_type === 'APPOINTMENT_DEPOSIT' && order.status === 'PENDING_PAYMENT') {
    await conn.execute(
      "UPDATE payment_order SET status='CANCELLED', closed_at=UTC_TIMESTAMP(6) WHERE order_id=?",
      [order.order_id]
    );
  }
}
