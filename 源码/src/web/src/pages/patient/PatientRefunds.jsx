import React, { useEffect, useState } from 'react';
import { api, dateTime, money } from '../../lib/api.js';
import { Badge, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientRefunds() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => { api('/patient/refunds').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return <div>
    <PageHeader eyebrow="REFUNDS" title="退款记录" description="退款申请、审核、处理中、成功/失败严格区分；退款记录创建不代表已到账。" />
    {!items.length ? <Card><Empty title="暂无退款记录" /></Card> : <Card><Table><thead><tr><th>退款单</th><th>订单</th><th>原因 / 金额</th><th>状态</th><th>审核说明</th></tr></thead><tbody>{items.map((r) => <tr key={r.refund_id}><td><strong>{r.refund_no}</strong><small className="block">{dateTime(r.created_at)}</small></td><td>{r.order_no}<small className="block">{r.order_type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额'}</small></td><td>{r.reason_code}<small className="block">{money(r.amount)}</small></td><td><Badge value={r.status} /></td><td>{r.review_note || '—'}</td></tr>)}</tbody></Table></Card>}
  </div>;
}
