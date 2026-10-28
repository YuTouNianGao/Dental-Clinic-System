import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { Badge, Card, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientVisitDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/patient/visits/${id}`).then(setData).catch(setError); }, [id]);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading />;
  const v = data.visit;
  return <div>
    <div className="back-line"><Link to="/portal/visits"><ArrowLeft size={15} /> 返回就诊记录</Link></div>
    <PageHeader eyebrow={v.visit_no} title={`${v.clinic_no} · ${v.dentist_name}`} description={dateTime(v.visit_datetime)} actions={<Badge value={v.status} />} />
    <div className="patient-two-col">
      <Card><div className="card-head"><h2>就诊信息</h2></div><dl className="detail-list"><div><dt>主诉</dt><dd>{v.patient_problem}</dd></div><div><dt>特殊需求</dt><dd>{v.special_needs || '无'}</dd></div><div><dt>预约号</dt><dd>{v.appointment_no}</dd></div><div><dt>诊所地址</dt><dd>{v.postal_address}</dd></div></dl></Card>
      <Card><div className="card-head"><h2>过敏信息</h2></div>{data.allergies.length ? data.allergies.map((a) => <div key={a.allergy_name} className="patient-notice-line"><strong>{a.allergy_name}</strong><span>{a.note || '无备注'} · {a.confirmation_status}</span></div>) : <p className="muted">暂无过敏记录。</p>}</Card>
    </div>
    <Card className="section-card"><div className="card-head"><h2>治疗明细</h2></div><Table><thead><tr><th>项目</th><th>数量</th><th>单价</th><th>小计</th><th>状态</th></tr></thead><tbody>{data.treatments.map((t) => <tr key={t.treatment_detail_id}><td>{t.treatment_name}</td><td>{t.unit_quantity}</td><td>{money(t.unit_price_snapshot)}</td><td>{money(t.subtotal)}</td><td><Badge value={t.status} /></td></tr>)}</tbody></Table></Card>
    <Card className="section-card"><div className="card-head"><h2>结算历史</h2></div><Table><thead><tr><th>结算单</th><th>时间</th><th>金额</th><th>状态</th><th></th></tr></thead><tbody>{data.settlements.map((s) => <tr key={s.settlement_id}><td>{s.settlement_no} · V{s.version_no}</td><td>{dateTime(s.settlement_date)}</td><td>{money(s.total_amount)}</td><td><Badge value={s.status} /></td><td><Link className="text-link" to={`/portal/charges/${s.settlement_id}`}>查看账单</Link></td></tr>)}</tbody></Table></Card>
  </div>;
}
