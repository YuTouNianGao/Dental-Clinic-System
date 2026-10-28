import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Clock3, MapPin } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Button, Card, Empty, ErrorState, Field, FormGrid, Loading, PageHeader } from '../../components/ui.jsx';

function localDate(offset = 1) {
  const d = new Date(Date.now() + offset * 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}

export default function PatientBooking() {
  const { notify } = useApp();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [clinics, setClinics] = useState([]);
  const [dentists, setDentists] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [clinicId, setClinicId] = useState(search.get('clinicId') || '');
  const [dentistId, setDentistId] = useState('');
  const [date, setDate] = useState(localDate(1));
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [expectedTreatment, setExpectedTreatment] = useState('');
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api('/public/clinics'), api('/public/treatments')])
      .then(([c, t]) => {
        setClinics(c.items);
        setTreatments(t.items);
        const initial = clinicId || c.items.find((x) => x.patientBookingEnabled)?.clinicId || c.items[0]?.clinicId || '';
        setClinicId(String(initial || ''));
      })
      .catch(setError).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!clinicId) { setDentists([]); return; }
    api('/public/dentists?clinicId=' + clinicId).then((d) => setDentists(d.items)).catch(() => setDentists([]));
  }, [clinicId]);

  const clinic = useMemo(() => clinics.find((c) => Number(c.clinicId) === Number(clinicId)), [clinics, clinicId]);

  const searchSlots = async () => {
    if (!clinicId || !date) return notify('请选择诊所和日期', 'warning');
    setSlotLoading(true); setSelected(null); setSlots([]);
    try {
      const params = new URLSearchParams({ clinicId, date, durationMinutes: String(duration) });
      if (dentistId) params.set('dentistId', dentistId);
      const data = await api('/public/availability?' + params.toString());
      setSlots(data.slots || []);
      if (!data.slots?.length) notify('该日期暂无可预约时段', 'warning');
    } catch (err) { notify(err.message, 'error'); }
    finally { setSlotLoading(false); }
  };

  const submit = async () => {
    if (!selected) return notify('请选择可预约时段', 'warning');
    if (!expectedTreatment.trim()) return notify('请填写就诊需求', 'warning');
    setSaving(true);
    try {
      const data = await api('/patient/appointments', {
        method: 'POST',
        body: { scheduleId: selected.scheduleId, startAt: selected.startAt, endAt: selected.endAt, expectedTreatment: expectedTreatment.trim() }
      });
      notify('预约已占位，请在 15 分钟内完成预约金支付');
      navigate('/portal/payments/' + data.order.orderId);
    } catch (err) { notify(err.message, 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return <div>
    <PageHeader eyebrow="BOOKING" title="预约就诊" description="选择诊所、日期和已发布排班中的可用时段；预约创建后保留 15 分钟，支付预约金后正式确认。" />
    {!clinic?.patientBookingEnabled && <Card className="notice-card"><Clock3 size={20} /><div><strong>该诊所暂未开放患者自助预约</strong><p>预约金为 0 或诊所未配置。请选择其他诊所，或联系诊所前台。</p></div></Card>}
    <Card>
      <FormGrid columns={3}>
        <Field label="诊所" required><select value={clinicId} onChange={(e) => { setClinicId(e.target.value); setDentistId(''); setSlots([]); setSelected(null); }}>{clinics.map((c) => <option key={c.clinicId} value={c.clinicId}>{c.clinicNo} · {c.postalAddress}{c.patientBookingEnabled ? '' : '（未开放）'}</option>)}</select></Field>
        <Field label="日期" required><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlots([]); setSelected(null); }} /></Field>
        <Field label="牙医（可选）"><select value={dentistId} onChange={(e) => { setDentistId(e.target.value); setSlots([]); setSelected(null); }}><option value="">全部可预约牙医</option>{dentists.map((d) => <option key={d.dentistId} value={d.dentistId}>{d.displayName}</option>)}</select></Field>
        <Field label="单次时长"><select value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 分钟</option><option value={60}>60 分钟</option><option value={90}>90 分钟</option></select></Field>
        <Field label="就诊需求" required className="span-2"><input value={expectedTreatment} onChange={(e) => setExpectedTreatment(e.target.value)} placeholder={treatments[0] ? `例如：${treatments[0].treatmentName}` : '例如：检查与洁牙'} /></Field>
      </FormGrid>
      <div className="slot-panel">
        <div className="card-head"><div><h3>可用时段</h3><p>{clinic ? `预约金 ${money(clinic.appointmentDepositAmount)}，支付后确认` : ''}</p></div><Button variant="secondary" size="sm" onClick={searchSlots} disabled={slotLoading || !clinic?.patientBookingEnabled}>{slotLoading ? '查询中…' : '查询可用时段'}</Button></div>
        {slots.length ? <div className="slot-grid">{slots.map((slot) => <button key={`${slot.scheduleId}-${slot.startAt}`} className={selected?.startAt === slot.startAt && selected?.scheduleId === slot.scheduleId ? 'active' : ''} onClick={() => setSelected(slot)}><strong>{new Date(slot.startAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })}</strong><span>{slot.dentistName}</span></button>)}</div> : <Empty title="请选择日期并查询" description="仅展示已发布排班、牙医资质有效且未被占用的时段。" />}
      </div>
      {selected && <div className="summary-strip"><div><span>选中时段</span><strong>{dateTime(selected.startAt)}</strong></div><div><span>牙医</span><strong>{selected.dentistName}</strong></div><div><span>预约金</span><strong>{money(clinic?.appointmentDepositAmount)}</strong></div><div><span>支付期限</span><strong>创建后 15 分钟</strong></div></div>}
      <div className="patient-form-actions"><Button onClick={submit} disabled={saving || !selected || !clinic?.patientBookingEnabled}>{saving ? '正在创建…' : '创建预约并去支付'}</Button></div>
    </Card>
  </div>;
}
