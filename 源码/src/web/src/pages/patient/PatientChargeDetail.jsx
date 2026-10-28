import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { Badge, Card, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientChargeDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/patient/settlements/${id}`).then(setData).catch(setError); }, [id]);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading />;
  const s = data.settlement;
  return <div>
    <div className="back-line"><Link to="/portal/charges"><ArrowLeft size={15} /> 返回收费账单</Link></div>
    <PageHeader eyebrow={s.settlement_no} title="收费明细" description={`${s.clinic_no} · ${s.dentist_name} · ${dateTime(s.settlement_date)}`} actions={<Badge value={s.status} />} />
    {s.status === 'VOID' && <Card className="notice-card"><ReceiptTextIcon /><div><strong>该结算单已作废</strong><p>作废记录保留；如涉及支付或预约金抵扣，请查看支付订单并等待人工处理。作废结算不计入收入和绩效。</p></div></Card>}
    <div className="patient-two-col">
      <Card><div className="card-head"><h2>费用明细</h2></div><Table><thead><tr><th>项目</th><th>数量</th><th>单价</th><th>小计</th></tr></thead><tbody>{data.details.map((d) => <tr key={d.settlement_detail_id}><td>{d.treatment_name_snapshot}</td><td>{d.unit_quantity_snapshot}</td><td>{money(d.unit_price_snapshot)}</td><td>{money(d.subtotal)}</td></tr>)}</tbody></Table><div className="invoice-total"><span>结算总额</span><strong>{money(s.total_amount)}</strong></div></Card>
      <Card><div className="card-head"><h2>支付与退款</h2></div>{data.paymentOrders.length ? data.paymentOrders.map((o) => <div key={o.order_id} className="patient-notice-line"><strong>{o.order_no} · {money(o.amount)}</strong><span>{o.status} · 已付 {money(o.amount_paid)} · 已退 {money(o.amount_refunded)}</span>{['PENDING_PAYMENT', 'PARTIALLY_PAID'].includes(o.status) && <Link className="text-link" to={`/portal/payments/${o.order_id}`}><CreditCard size={14} />去支付</Link>}</div>) : <p className="muted">本结算暂无支付订单。</p>}
        {data.refunds.length > 0 && <><div className="card-head" style={{ marginTop: 18 }}><h2>退款记录</h2></div>{data.refunds.map((r) => <div key={r.refund_id} className="patient-notice-line"><strong>{r.refund_no} · {money(r.amount)}</strong><span>{r.reason_code} · {r.status} · {r.review_note || ''}</span></div>)}</>}
      </Card>
    </div>
  </div>;
}

function ReceiptTextIcon() { return <span className="clinic-mark">¥</span>; }
