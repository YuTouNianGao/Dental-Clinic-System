import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, Phone } from 'lucide-react';
import { api, money } from '../../lib/api.js';
import { Button, Card, Empty, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';

export default function PatientClinics() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/public/clinics').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false));
  }, []);
  return <div>
    <PageHeader eyebrow="CLINICS" title="诊所信息" description="仅展示当前开放的诊所；预约金为 0 的诊所暂不开放患者自助预约。" />
    {loading ? <Loading /> : error ? <ErrorState error={error} /> : !items.length ? <Card><Empty title="暂无开放诊所" /></Card> : <div className="clinic-grid">
      {items.map((c) => <Card key={c.clinicId} className="clinic-card">
        <div className="clinic-top"><div className="clinic-mark"><Building2 size={22} /></div><div><h2>{c.clinicNo}</h2><small>{c.patientBookingEnabled ? '患者自助预约开放' : '暂未开放患者自助预约'}</small></div></div>
        <div className="clinic-lines"><span><MapPin size={15} />{c.postalAddress}</span><span><Phone size={15} />{c.phone}</span><span>预约金：{money(c.appointmentDepositAmount)}</span></div>
        <div className="clinic-stats"><div><strong>{c.patientBookingEnabled ? '可预约' : '未开放'}</strong><span>患者自助</span></div></div>
        {c.patientBookingEnabled && <Link to={`/portal/booking?clinicId=${c.clinicId}`}><Button size="sm">选择该诊所预约</Button></Link>}
      </Card>)}
    </div>}
  </div>;
}
