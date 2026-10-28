import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptText } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { Badge, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientCharges() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => { api('/patient/settlements?pageSize=50').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return <div>
    <PageHeader eyebrow="BILLING" title="收费账单" description="仅 ACTIVE 结算计入有效收入；VOID 结算保留历史但不计入收入和绩效。" />
    {!items.length ? <Card><Empty title="暂无收费账单" description="完成就诊并生成结算后，可在此查看费用明细。" /></Card> : <Card><Table><thead><tr><th>结算单</th><th>就诊</th><th>牙医 / 诊所</th><th>金额</th><th>状态</th><th></th></tr></thead><tbody>{items.map((s) => <tr key={s.settlement_id}><td><strong>{s.settlement_no}</strong><small className="block">V{s.version_no} · {dateTime(s.settlement_date)}</small></td><td>{s.visit_no}<small className="block">{s.appointment_no}</small></td><td>{s.dentist_name}<small className="block">{s.clinic_no}</small></td><td>{money(s.total_amount)}</td><td><Badge value={s.status} /></td><td><Link className="text-link" to={`/portal/charges/${s.settlement_id}`}><ReceiptText size={14} />明细</Link></td></tr>)}</tbody></Table></Card>}
  </div>;
}
