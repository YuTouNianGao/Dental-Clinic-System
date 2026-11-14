import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, UserRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, Card, Empty, ErrorState, Loading, PageHeader } from '../components/ui.jsx';

const START_HOUR = 8;
const END_HOUR = 20;

function shanghaiMinutes(value) {
  const d = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === 'hour')?.value || 0) * 60 + Number(p.find((x) => x.type === 'minute')?.value || 0);
}
function minuteText(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekLabel(date) {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('zh-CN', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' });
}

export default function ScheduleBoard() {
  const [params] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [date, setDate] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    if (!date) return;
    setLoading(true); setError(null);
    api(`/appointments?date=${date}&pageSize=100` + (clinicId ? '&clinicId=' + clinicId : ''))
      .then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false));
  };
  useEffect(() => { api('/meta').then((m) => { setMeta(m); setDate(params.get('date') || m.today); }).catch(setError); }, []);
  useEffect(load, [date, clinicId]);

  const columns = useMemo(() => {
    const map = new Map();
    for (const a of items || []) {
      const key = a.dentist_name || '未分配牙医';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return [...map.entries()].map(([name, rows]) => ({ name, rows: rows.sort((a, b) => shanghaiMinutes(a.scheduled_start_at) - shanghaiMinutes(b.scheduled_start_at)) }));
  }, [items]);
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return <div>
    <PageHeader eyebrow="SCHEDULE / DAY VIEW" title="日程看板" description="参考 OpenDental Appointments 的按牙医分列日程；每位牙医一列，时间块直接显示患者与状态。" actions={<Link to="/appointments"><Button variant="secondary"><CalendarDays size={15} />列表模式</Button></Link>} />
    <Card className="schedule-toolbar">
      <div className="schedule-controls"><Button size="sm" variant="ghost" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={15} />前一天</Button><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><Button size="sm" variant="ghost" onClick={() => setDate(shiftDate(date, 1))}>后一天<ChevronRight size={15} /></Button><Button size="sm" variant="secondary" onClick={() => setDate(meta?.today || date)}>今天</Button><select value={clinicId} onChange={(e) => setClinicId(e.target.value)}><option value="">全部诊所</option>{meta?.clinics.map((c) => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_no}</option>)}</select></div>
      <div className="schedule-date"><strong>{weekLabel(date)}</strong><span><Clock3 size={13} />08:00–20:00 · {items?.length || 0} 个预约</span></div>
    </Card>
    {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : <Card className="schedule-card">
      {!columns.length ? <Empty title="当天没有预约" description="切换日期或从预约管理创建新的预约。" /> : <div className="schedule-scroll">
        <div className="schedule-head"><div className="time-gutter" /> {columns.map((col) => <div className="dentist-head" key={col.name}><div className="tp-avatar"><UserRound size={15} /></div><div><strong>{col.name}</strong><small>{col.rows.length} 个预约</small></div></div>)}</div>
        <div className="schedule-body" style={{ height: totalMinutes }}>
          <div className="time-gutter">{hours.map((h) => <div className="hour-label" key={h} style={{ top: (h - START_HOUR) * 60 }}>{String(h).padStart(2, '0')}:00</div>)}</div>
          {columns.map((col) => <div className="dentist-column" key={col.name}>
            {hours.map((h) => <div className="hour-line" key={h} style={{ top: (h - START_HOUR) * 60 }} />)}
            {col.rows.map((a) => {
              const start = shanghaiMinutes(a.scheduled_start_at);
              const end = shanghaiMinutes(a.scheduled_end_at);
              const top = Math.max(0, start - START_HOUR * 60);
              const height = Math.max(32, end - start);
              return <Link to={'/patients/' + a.patient_id} className={'schedule-block status-' + a.status.toLowerCase()} key={a.appointment_id} style={{ top, height }} title={a.patient_name + ' · ' + (a.expected_treatment || '口腔检查')}>
                <strong>{a.patient_name}</strong><small>{minuteText(start)}–{minuteText(end)} · {a.expected_treatment || '口腔检查'}</small>
              </Link>;
            })}
          </div>)}
        </div>
      </div>}
    </Card>}
  </div>;
}
