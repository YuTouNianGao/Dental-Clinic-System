import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, XCircle } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';

export default function PatientAppointmentDetail() {
  const { id } = useParams();
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api(`/patient/appointments/${id}`).then(setData).catch(setError);
  useEffect(load, [id]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const a = data.appointment;
  const cancel = async () => {
    const reason = window.prompt('请填写取消原因');
    if (!reason?.trim()) return;
    try {
      const result = await api(`/patient/appointments/${a.appointment_id}/cancel`, { method: 'POST', body: { reason: reason.trim() } });
      notify(result.refundEligible ? '预约已取消，退款申请已提交审核' : '预约已取消；预约金按规则处理');
      load();
    } catch (err) { notify(err.message, 'error'); }
  };
  return <div>
    <div className="back-line"><Link to="/portal/appointments"><ArrowLeft size={15} /> 返回我的预约</Link></div>
    <PageHeader eyebrow={a.appointment_no} title={`${a.clinic_no} · ${a.dentist_name}`} description={`${dateTime(a.scheduled_start_at)} 至 ${dateTime(a.scheduled_end_at)}`} actions={<Badge value={a.status} />} />
    <div className="patient-two-col">
      <Card><div className="card-head"><h2>预约信息</h2></div><dl className="detail-list">
        <div><dt>期望治疗</dt><dd>{a.expected_treatment}</dd></div>
        <div><dt>诊所</dt><dd>{a.clinic_no} · {a.postal_address}</dd></div>
        <div><dt>牙医</dt><dd>{a.dentist_name}</dd></div>
        <div><dt>预约渠道</dt><dd>{a.booking_channel === 'PATIENT_SELF_SERVICE' ? '患者自助预约' : '员工预约'}</dd></div>
        <div><dt>确认时间</dt><dd>{a.confirmed_at ? dateTime(a.confirmed_at) : '待支付确认'}</dd></div>
        {a.status === 'PENDING_PAYMENT' && a.hold_expires_at && <div><dt>支付截止</dt><dd>{dateTime(a.hold_expires_at)}</dd></div>}
      </dl>
      {['PENDING_PAYMENT', 'SCHEDULED'].includes(a.status) && <div className="patient-form-actions"><Button variant="danger" onClick={cancel}><XCircle size={15} />取消预约</Button></div>}
      </Card>
      <Card><div className="card-head"><h2>支付订单</h2></div>{data.paymentOrders.length ? data.paymentOrders.map((o) => <div key={o.order_id} className="patient-notice-line"><strong>{o.order_no} · {money(o.amount)}</strong><span>{o.order_type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额'} · {o.status}</span>{o.status === 'PENDING_PAYMENT' && <Link className="text-link" to={`/portal/payments/${o.order_id}`}><CreditCard size={14} />去支付</Link>}</div>) : <p className="muted">本预约无预约金订单（员工预约渠道）。</p>}</Card>
    </div>
    {data.changes.length > 0 && <Card className="section-card"><div className="card-head"><h2>变更记录</h2></div><div className="patient-list">{data.changes.map((c) => <div key={c.change_id} className="patient-list-row"><div><strong>{c.change_type === 'CANCEL' ? '取消' : '改期'}</strong><small>{dateTime(c.changed_at)} · {c.cause_code || c.initiator_party} · {c.reason}</small></div><span>{c.refund_eligible ? `退款资格：是（${money(c.refund_amount)}）` : '退款资格：否'}</span></div>)}</div></Card>}
  </div>;
}
