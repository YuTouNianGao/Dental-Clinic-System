import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPlus } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { Badge, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientVisits() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => { api('/patient/visits?pageSize=50').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return <div>
    <PageHeader eyebrow="MEDICAL RECORDS" title="就诊记录" description="仅展示本人就诊记录；作废结算单会单独标注，不计入有效收入。" />
    {!items.length ? <Card><Empty title="暂无就诊记录" description="完成到诊后，诊所会建立就诊记录。" /></Card> : <Card><Table><thead><tr><th>就诊</th><th>牙医 / 诊所</th><th>主诉</th><th>结算</th><th></th></tr></thead><tbody>{items.map((v) => <tr key={v.visit_id}><td><strong>{dateTime(v.visit_datetime)}</strong><small className="block">{v.visit_no} · {v.appointment_no}</small></td><td>{v.dentist_name}<small className="block">{v.clinic_no}</small></td><td className="truncate-cell">{v.patient_problem}</td><td>{v.settlement_no ? <><Badge value={v.settlement_status} /><small className="block">{money(v.total_amount)}</small></> : <Badge tone="amber">未结算</Badge>}</td><td><Link className="text-link" to={`/portal/visits/${v.visit_id}`}><ClipboardPlus size={14} />详情</Link></td></tr>)}</tbody></Table></Card>}
  </div>;
}
