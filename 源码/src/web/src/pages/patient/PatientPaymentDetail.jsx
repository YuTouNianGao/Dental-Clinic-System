import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CreditCard, XCircle } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';

export default function PatientPaymentDetail() {
  const { id } = useParams();
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/patient/payment-orders/${id}`).then(setData).catch(setError);
  useEffect(load, [id]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const o = data.order;
  const payable = ['PENDING_PAYMENT', 'PARTIALLY_PAID'].includes(o.status);
  const pay = async (outcome) => {
    setBusy(true);
    try {
      const result = await api(`/patient/payment-orders/${id}/pay`, { method: 'POST', body: { outcome }, headers: { 'Idempotency-Key': `web:${id}:${outcome}:${Date.now()}` } });
      notify(outcome === 'SUCCESS' ? '模拟支付成功' : '模拟支付失败');
      await load();
      if (outcome === 'SUCCESS' && o.order_type === 'APPOINTMENT_DEPOSIT') notify('预约已确认，可前往我的预约查看');
      return result;
    } catch (err) { notify(err.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div>
    <div className="back-line"><Link to="/portal/payments"><ArrowLeft size={15} /> 返回支付订单</Link></div>
    <PageHeader eyebrow={o.order_no} title={o.order_type === 'APPOINTMENT_DEPOSIT' ? '预约金支付' : '诊后余额支付'} description="本页面使用模拟支付适配器；模拟成功/失败不等同于真实资金到账或退款。" actions={<Badge value={o.status} />} />
    <div className="patient-two-col">
      <Card>
        <div className="summary-strip"><div><span>订单金额</span><strong>{money(o.amount)}</strong></div><div><span>已支付</span><strong>{money(o.amount_paid)}</strong></div><div><span>已抵扣</span><strong>{money(o.amount_applied)}</strong></div><div><span>已退款</span><strong>{money(o.amount_refunded)}</strong></div><div><span>退款预留</span><strong>{money(o.amount_refund_reserved)}</strong></div></div>
        <dl className="detail-list">
          <div><dt>订单类型</dt><dd>{o.order_type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额'}</dd></div>
          <div><dt>创建时间</dt><dd>{dateTime(o.created_at)}</dd></div>
          {o.expires_at && <div><dt>支付截止</dt><dd>{dateTime(o.expires_at)}</dd></div>}
          <div><dt>可支付余额</dt><dd>{o.order_type === 'APPOINTMENT_DEPOSIT' ? money(o.available_deposit) : money(o.outstanding_balance)}</dd></div>
          {o.forfeited_at && <div><dt>没收时间</dt><dd>{dateTime(o.forfeited_at)} · {o.forfeited_reason_code}</dd></div>}
        </dl>
        {payable && <div className="patient-form-actions"><Button onClick={() => pay('SUCCESS')} disabled={busy}><BadgeCheck size={16} />模拟支付成功</Button><Button variant="danger" onClick={() => pay('FAILURE')} disabled={busy}><XCircle size={16} />模拟支付失败</Button></div>}
        {!payable && <p className="muted">订单当前状态不可支付。若存在退款/争议，请查看退款记录或联系诊所。</p>}
      </Card>
      <Card><div className="card-head"><h2>支付流水</h2></div>{data.transactions.length ? data.transactions.map((t) => <div key={t.transaction_id} className="patient-notice-line"><strong>{t.transaction_no} · {money(t.amount)}</strong><span>{t.channel} · {t.status} · {dateTime(t.created_at)}</span></div>) : <p className="muted">暂无支付流水。</p>}
        <div className="card-head" style={{ marginTop: 20 }}><h2>退款记录</h2></div>{data.refunds.length ? data.refunds.map((r) => <div key={r.refund_id} className="patient-notice-line"><strong>{r.refund_no} · {money(r.amount)}</strong><span>{r.reason_code} · {r.status} · {r.review_note || ''}</span></div>) : <p className="muted">暂无退款记录。</p>}
      </Card>
    </div>
    {o.appointment_id && <p className="muted"><Link className="text-link" to={`/portal/appointments/${o.appointment_id}`}>返回预约详情</Link></p>}
  </div>;
}
