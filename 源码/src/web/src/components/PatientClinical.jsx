import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUpRight, CalendarClock, CheckCircle2, ClipboardList, Plus, ShieldAlert } from 'lucide-react';
import { api, dateOnly, money } from '../lib/api.js';
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, Modal } from './ui.jsx';

const UPPER = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
const LOWER = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];
const CONDITION_LABELS = {
  HEALTHY: '健康', CARIES: '龋坏', FILLING: '已充填', CROWN: '牙冠',
  ROOT_CANAL: '根管治疗', IMPLANT: '种植', MISSING: '缺失', FRACTURE: '牙折', SENSITIVE: '敏感'
};
const CONDITION_TONE = {
  HEALTHY: 'healthy', CARIES: 'caries', FILLING: 'filling', CROWN: 'crown',
  ROOT_CANAL: 'root', IMPLANT: 'implant', MISSING: 'missing', FRACTURE: 'fracture', SENSITIVE: 'sensitive'
};
const PLAN_LABELS = { DRAFT: '草稿', PRESENTED: '已沟通', ACCEPTED: '已接受', IN_PROGRESS: '进行中', COMPLETED: '已完成', DECLINED: '已拒绝' };
const RECALL_LABELS = { EXAM: '检查', CLEANING: '洁牙', PERIO: '牙周', ORTHO: '正畸' };
const RECALL_STATUS = { DUE: '待安排', SCHEDULED: '已预约', COMPLETED: '已完成', DISMISSED: '已忽略' };

function Tooth({ no, record, onClick }) {
  const condition = record?.condition_code || 'HEALTHY';
  return <button className={'tooth tooth-' + CONDITION_TONE[condition]} onClick={() => onClick(no, record)} title={`${no} · ${CONDITION_LABELS[condition]}`}>
    <span>{no}</span><i />
  </button>;
}

export default function PatientClinical({ patientId, canWrite }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tooth, setTooth] = useState(null);
  const [form, setForm] = useState({ conditionCode: 'HEALTHY', surface: '', note: '' });
  const [saving, setSaving] = useState(false);
  const load = () => { setError(null); api('/clinical/patients/' + patientId).then(setData).catch(setError); };
  useEffect(load, [patientId]);

  const openTooth = (no, record) => {
    if (!canWrite) return;
    setTooth(no);
    setForm({ conditionCode: record?.condition_code || 'HEALTHY', surface: record?.surface || '', note: record?.note || '' });
  };
  const saveTooth = async () => {
    setSaving(true);
    try {
      await api(`/clinical/patients/${patientId}/teeth/${tooth}`, { method: 'PUT', body: form });
      setTooth(null);
      load();
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  };
  const updateRecall = async (recall, status) => {
    try { await api('/clinical/recalls/' + recall.recall_id, { method: 'PATCH', body: { status } }); load(); }
    catch (e) { setError(e); }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const records = Object.fromEntries((data.teeth || []).map((t) => [t.tooth_no, t]));
  const activePlans = (data.plans || []).filter((p) => !['COMPLETED', 'DECLINED'].includes(p.status));
  const totalPlanned = activePlans.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  const completed = (data.plans || []).reduce((sum, p) => sum + Number(p.completed_count || 0), 0);
  const totalItems = (data.plans || []).reduce((sum, p) => sum + Number(p.item_count || 0), 0);

  return <div className="clinical-stack">
    <div className="clinical-kpis">
      <div><span>牙位记录</span><strong>{data.teeth.length}<small>/32</small></strong></div>
      <div><span>活跃治疗计划</span><strong>{activePlans.length}</strong></div>
      <div><span>计划金额</span><strong>{money(totalPlanned)}</strong></div>
      <div><span>计划完成度</span><strong>{totalItems ? Math.round(completed / totalItems * 100) : 0}<small>%</small></strong></div>
    </div>

    <Card className="odontogram-card">
      <div className="card-head"><div><h2>牙位图</h2><p>参考 OpenDental Chart 的 32 牙位记录；点击牙位可更新状况。</p></div><Badge tone="blue">FDI 牙位</Badge></div>
      <div className="odontogram">
        <div className="tooth-row"><span className="tooth-side">上颌</span>{UPPER.map((no) => <Tooth key={no} no={no} record={records[no]} onClick={openTooth} />)}</div>
        <div className="tooth-row"><span className="tooth-side">下颌</span>{LOWER.map((no) => <Tooth key={no} no={no} record={records[no]} onClick={openTooth} />)}</div>
      </div>
      <div className="tooth-legend">{Object.entries(CONDITION_LABELS).map(([key, label]) => <span key={key}><i className={'dot dot-' + CONDITION_TONE[key]} />{label}</span>)}</div>
    </Card>

    <div className="clinical-two-col">
      <Card>
        <div className="card-head"><div><h2>治疗计划</h2><p>从草稿、沟通、接受到完成，像 DentalPin 的 Treatment Plans 一样管理。</p></div>{canWrite && <Link className="text-link" to={'/treatment-plans?patientId=' + patientId}><Plus size={14} />新建计划</Link>}</div>
        {!data.plans.length ? <Empty title="暂无治疗计划" description="医生可在治疗方案页为患者创建分期计划。" /> : <div className="plan-list">
          {data.plans.map((plan) => <div className="plan-row" key={plan.plan_id}>
            <div className={'plan-status-line plan-' + plan.status.toLowerCase()}><ClipboardList size={16} /><span>{PLAN_LABELS[plan.status]}</span></div>
            <div className="plan-main"><strong>{plan.title}</strong><small>{plan.plan_no} · {plan.dentist_name} · {plan.clinic_no}</small><div className="plan-progress"><i style={{ width: (plan.item_count ? plan.completed_count / plan.item_count * 100 : 0) + '%' }} /></div><small>{plan.completed_count}/{plan.item_count} 项完成</small></div>
            <div className="plan-amount"><strong>{money(plan.total_amount)}</strong><small>{plan.items.length} 项</small></div>
          </div>)}
        </div>}
      </Card>
      <Card>
        <div className="card-head"><div><h2>召回 / 复查</h2><p>参考 OpenDental Recall List，保持患者复诊节奏。</p></div><CalendarClock size={18} className="muted" /></div>
        {!data.recalls.length ? <Empty title="暂无召回任务" description="可在患者治疗后创建 6 个月复查。" /> : <div className="recall-list">
          {data.recalls.map((r) => <div className="recall-row" key={r.recall_id}>
            <div className={'recall-dot ' + (r.status === 'DUE' ? 'due' : '')} />
            <div><strong>{RECALL_LABELS[r.recall_type]}复查</strong><small>到期 {dateOnly(r.due_date)} · {RECALL_STATUS[r.status]}</small></div>
            {canWrite && r.status !== 'COMPLETED' && <div className="recall-actions"><button onClick={() => updateRecall(r, 'COMPLETED')} title="标记已完成"><CheckCircle2 size={16} /></button><button onClick={() => updateRecall(r, 'DISMISSED')} title="忽略"><ArrowUpRight size={16} /></button></div>}
          </div>)}
        </div>}
      </Card>
    </div>

    {tooth && <Modal title={`牙位 ${tooth} 记录`} onClose={() => setTooth(null)} footer={<><Button variant="ghost" onClick={() => setTooth(null)}>取消</Button><Button onClick={saveTooth} disabled={saving}>{saving ? '保存中…' : '保存记录'}</Button></>}>
      <div className="warning-box" style={{ marginTop: 0 }}><div className="eyebrow" style={{ marginBottom: 6 }}><ShieldAlert size={14} />CLINICAL RECORD</div><span>牙位记录用于沟通和计划，不替代正式病历；保存操作写入审计日志。</span></div>
      <Field label="牙位状况" required><select value={form.conditionCode} onChange={(e) => setForm({ ...form, conditionCode: e.target.value })}>{Object.entries(CONDITION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="牙面"><input value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} placeholder="如：咬合面、近中" /></Field>
      <Field label="备注"><textarea rows="3" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      <div className="info-strip"><Activity size={15} />记录会立即同步到患者小程序“我的牙齿”。</div>
    </Modal>}
  </div>;
}
