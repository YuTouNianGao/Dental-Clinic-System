import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BellRing, CalendarDays, CalendarPlus, CircleDollarSign,
  ClipboardList, Clock3, Plus, TrendingDown, UserPlus, Users
} from 'lucide-react';
import { api, dateTime, money } from '../lib/api.js';
import { useApp } from '../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader } from '../components/ui.jsx';

const PLAN_LABELS = { DRAFT: '草稿', PRESENTED: '待沟通', ACCEPTED: '已接受', IN_PROGRESS: '进行中', COMPLETED: '已完成', DECLINED: '已拒绝' };
const RECALL_TYPE = { EXAM: '检查', CLEANING: '洁牙', PERIO: '牙周', ORTHO: '正畸' };

export default function Dashboard() {
  const { user } = useApp();
  const [meta, setMeta] = useState(null);
  const [clinicId, setClinicId] = useState('');
  const [data, setData] = useState(null);
  const [clinical, setClinical] = useState({ recalls: [], plans: [], patients: [] });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setError(null);
    Promise.all([
      api('/meta'),
      api('/dashboard' + (clinicId ? '?clinicId=' + clinicId : '')),
      api('/clinical/recalls' + (clinicId ? '?clinicId=' + clinicId : '')),
      api('/clinical/treatment-plans?status=PRESENTED&pageSize=5' + (clinicId ? '&clinicId=' + clinicId : '')),
      api('/patients?pageSize=5' + (clinicId ? '&clinicId=' + clinicId : ''))
    ]).then(([m, d, r, p, recent]) => {
      setMeta(m); setData(d);
      setClinical({ recalls: r.items || [], plans: p.items || [], patients: recent.items || [] });
    }).catch(setError).finally(() => setLoading(false));
  };
  useEffect(load, [clinicId]);

  const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' });
  const overdue = (clinical.recalls || []).filter((r) => r.due_date < new Date().toISOString().slice(0, 10)).length;
  return <div>
    <PageHeader eyebrow="TODAY AT ADC" title={`早上好，${user.displayName}`} description={`${today} · 今天的预约、治疗计划和召回任务都在这里。`} actions={<><select value={clinicId} onChange={(e) => setClinicId(e.target.value)} style={{ maxWidth: 230 }}><option value="">全部授权诊所</option>{meta?.clinics.map((c) => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_no} · {c.postal_address}</option>)}</select><Link to="/appointments"><Button variant="secondary"><CalendarPlus size={15} />预约管理</Button></Link><Link to="/treatment-plans"><Button><Plus size={15} />新建计划</Button></Link></>} />
    {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : data && <>
      <div className="dash-kpis">
        <Card className="dash-kpi"><span>今日预约</span><strong>{data.metrics.scheduledToday}</strong><small>今日共 {data.metrics.appointmentsToday} 个预约 <Link to="/appointments">查看日程 <ArrowRight size={11} /></Link></small><CalendarDays size={18} /></Card>
        <Card className="dash-kpi"><span>今日有效收入</span><strong>{money(data.metrics.revenueToday)}</strong><small>{data.metrics.settledToday} 张有效结算 <Link to="/settlements">结算单 <ArrowRight size={11} /></Link></small><CircleDollarSign size={18} /></Card>
        <Card className={'dash-kpi ' + (overdue ? 'dash-kpi-alert' : '')}><span>逾期待召回</span><strong>{overdue}</strong><small>本周召回 {clinical.recalls.length} 人 <Link to="/recalls">召回清单 <ArrowRight size={11} /></Link></small><BellRing size={18} /></Card>
      </div>

      <div className="dash-grid">
        <Card className="dash-today span-2">
          <div className="card-head"><div><h2>今日日程</h2><p>按预约开始时间排列；点击患者进入临床档案。</p></div><Link to="/appointments" className="text-link">打开预约日历 <ArrowUpRight size={14} /></Link></div>
          {data.upcoming.length ? <div className="today-list">
            {data.upcoming.map((a) => <Link className="today-row" key={a.appointment_id} to={'/patients/' + a.patient_id}>
              <div className="today-time"><strong>{dateTime(a.scheduled_start_at).slice(11)}</strong><small>{dateTime(a.scheduled_start_at).slice(5, 10)}</small></div>
              <div className="today-patient"><div className="tp-avatar">{String(a.patient_name || '患').slice(0, 1)}</div><div><strong>{a.patient_name}</strong><small>{a.clinic_no} · {a.dentist_name} · {a.patient_no}</small></div></div>
              <Badge value={a.status} />
              <ArrowRight size={14} className="muted" />
            </Link>)}
          </div> : <Empty title="今天还没有预约" description="从预约管理创建新的预约，或查看本周排班。" />}
        </Card>

        <Card className="dash-attention">
          <div className="card-head"><div><h2>需要关注</h2><p>实时业务信号</p></div></div>
          <div className="attention-stack">
            <Link to="/settlements"><span><Clock3 size={16} />未结算就诊</span><strong>{data.metrics.unsettledVisits}</strong></Link>
            <Link to="/refunds"><span><TrendingDown size={16} />取消 / 未到率</span><strong>{(data.metrics.cancellationRate * 100).toFixed(1)}%</strong></Link>
            <Link to="/treatment-plans"><span><ClipboardList size={16} />待沟通计划</span><strong>{clinical.plans.length}</strong></Link>
          </div>
        </Card>

        <Card className="dash-pipeline">
          <div className="card-head"><div><h2>治疗计划 · 待沟通</h2><p>OpenDental Treatment Plan / DentalPin pipeline</p></div><Link to="/treatment-plans" className="text-link">全部 <ArrowRight size={12} /></Link></div>
          {!clinical.plans.length ? <Empty title="没有待沟通计划" /> : <div className="dash-plan-list">{clinical.plans.map((p) => <Link to={'/patients/' + p.patient_id} className="dash-plan-row" key={p.plan_id}><div><strong>{p.patient_name}</strong><small>{p.title} · {PLAN_LABELS[p.status]}</small></div><div><strong>{money(p.total_amount)}</strong><small>{p.item_count} 项</small></div></Link>)}</div>}
        </Card>

        <Card className="dash-recalls">
          <div className="card-head"><div><h2>召回与复查</h2><p>本周到期</p></div><Link to="/recalls" className="text-link">全部 <ArrowRight size={12} /></Link></div>
          {!clinical.recalls.length ? <Empty title="本周没有召回任务" /> : <div className="dash-recall-list">{clinical.recalls.slice(0, 5).map((r) => <Link to={'/patients/' + r.patient_id} className="dash-recall-row" key={r.recall_id}><span className={'recall-dot ' + (r.due_date < new Date().toISOString().slice(0, 10) ? 'due' : '')} /><div><strong>{r.patient_name}</strong><small>{RECALL_TYPE[r.recall_type]} · {r.due_date}</small></div><ArrowRight size={13} /></Link>)}</div>}
        </Card>

        <Card className="dash-recent">
          <div className="card-head"><div><h2>最近患者</h2><p>按档案更新时间</p></div><Link to="/patients" className="text-link">患者列表 <ArrowRight size={12} /></Link></div>
          <div className="recent-patient-list">{clinical.patients.map((p) => <Link to={'/patients/' + p.patient_id} key={p.patient_id}><div className="tp-avatar">{String(p.patient_name || '患').slice(0, 1)}</div><div><strong>{p.patient_name}</strong><small>{p.patient_no} · {p.phone}</small></div><ArrowRight size={13} /></Link>)}</div>
        </Card>

        <Card className="dash-week span-2">
          <div className="card-head"><div><h2>本周一览</h2><p>经营与临床的轻量快照</p></div></div>
          <div className="week-stats"><div><span>今日预约</span><strong>{data.metrics.appointmentsToday}</strong></div><div><span>有效结算</span><strong>{data.metrics.settledToday}</strong></div><div><span>服务患者</span><strong>{data.metrics.activePatients}</strong></div><div><span>取消 / 未到</span><strong>{(data.metrics.cancellationRate * 100).toFixed(1)}%</strong></div></div>
          <div className="week-foot"><Users size={14} />数据按当前角色和诊所范围实时计算 <Link to="/records" className="text-link">历史查询</Link></div>
        </Card>
      </div>
    </>}
  </div>;
}
