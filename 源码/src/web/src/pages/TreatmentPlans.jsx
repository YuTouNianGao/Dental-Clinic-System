import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Search, Stethoscope, X } from 'lucide-react';
import { api, dateOnly, money } from '../lib/api.js';
import { useApp } from '../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Field, FormGrid, Loading, Modal, PageHeader } from '../components/ui.jsx';

const STATUS = [
  { value: '', label: '全部' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PRESENTED', label: '已沟通' },
  { value: 'ACCEPTED', label: '已接受' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'DECLINED', label: '已拒绝' }
];
const LABELS = { DRAFT: '草稿', PRESENTED: '已沟通', ACCEPTED: '已接受', IN_PROGRESS: '进行中', COMPLETED: '已完成', DECLINED: '已拒绝' };
const ITEM_LABELS = { PLANNED: '待安排', SCHEDULED: '已预约', COMPLETED: '已完成', DECLINED: '已放弃' };
const TEETH = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28','48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];

export default function TreatmentPlans() {
  const { user, notify } = useApp();
  const [params] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [patients, setPatients] = useState([]);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ patientId: '', clinicId: '', dentistId: '', title: '个性化治疗计划', notes: '' });
  const [item, setItem] = useState({ treatmentItemId: '', toothNo: '', quantity: 1, unitPrice: '', note: '' });
  const canWrite = ['DENTIST', 'CLINIC_MANAGER', 'HQ_MANAGER'].includes(user.role);
  const isDentist = user.role === 'DENTIST';

  const load = () => {
    setLoading(true); setError(null);
    api('/clinical/treatment-plans?pageSize=100' + (status ? '&status=' + status : '') + (q ? '&q=' + encodeURIComponent(q) : ''))
      .then(setData).catch(setError).finally(() => setLoading(false));
  };
  useEffect(() => {
    Promise.all([api('/meta'), api('/patients?pageSize=100')])
      .then(([m, p]) => {
        setMeta(m); setPatients(p.items);
        setForm((f) => ({ ...f, clinicId: String(m.clinics[0]?.clinic_id || ''), dentistId: String(m.dentists[0]?.dentist_id || '') }));
      }).catch(setError);
  }, []);
  useEffect(load, [status]);
  useEffect(() => {
    const patientId = params.get('patientId');
    if (patientId && patients.length) {
      setForm((f) => ({ ...f, patientId }));
      setCreateOpen(true);
    }
  }, [patients, params]);

  const selectedTreatment = useMemo(() => meta?.treatments.find((t) => String(t.treatment_item_id) === String(item.treatmentItemId)), [meta, item.treatmentItemId]);
  const openCreate = () => {
    setForm((f) => ({ ...f, patientId: f.patientId || '', title: '个性化治疗计划', notes: '' }));
    setCreateOpen(true);
  };
  const createPlan = async () => {
    if (!form.patientId || !form.clinicId || !form.dentistId) return notify('请选择患者、诊所和牙医', 'warning');
    setSaving(true);
    try {
      const result = await api('/clinical/treatment-plans', { method: 'POST', body: { ...form, items: [] } });
      notify('治疗计划已创建');
      setCreateOpen(false);
      setDetail(result.plan);
      load();
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };
  const openDetail = async (planId) => {
    try { setDetail((await api('/clinical/treatment-plans/' + planId)).plan); }
    catch (e) { notify(e.message, 'error'); }
  };
  const updateStatus = async (nextStatus) => {
    try {
      const result = await api('/clinical/treatment-plans/' + detail.plan_id, { method: 'PATCH', body: { status: nextStatus } });
      setDetail(result.plan); load();
    } catch (e) { notify(e.message, 'error'); }
  };
  const addItem = async () => {
    if (!item.treatmentItemId || !item.unitPrice) return notify('请选择治疗项目并填写价格', 'warning');
    setSaving(true);
    try {
      const result = await api(`/clinical/treatment-plans/${detail.plan_id}/items`, { method: 'POST', body: { ...item, toothNo: item.toothNo || null } });
      setDetail(result.plan); setItemOpen(false); setItem({ treatmentItemId: '', toothNo: '', quantity: 1, unitPrice: '', note: '' }); load();
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };
  const setItemStatus = async (row, next) => {
    try {
      const result = await api('/clinical/treatment-plan-items/' + row.item_id, { method: 'PATCH', body: { status: next } });
      setDetail(result.plan); load();
    } catch (e) { notify(e.message, 'error'); }
  };
  const pickTreatment = (treatmentItemId) => {
    const t = meta?.treatments.find((x) => String(x.treatment_item_id) === String(treatmentItemId));
    setItem({ ...item, treatmentItemId, unitPrice: t?.current_price || '' });
  };

  return <div>
    <PageHeader eyebrow="CLINICAL / TREATMENT PLANS" title="治疗方案" description="参考 OpenDental Treatment Plan 与 DentalPin Treatment Plans：把建议、报价、预约和完成进度放在同一条计划线上。" actions={canWrite && <Button onClick={openCreate}><Plus size={16} />新建计划</Button>} />
    <Card className="pipeline-card">
      <div className="pipeline-tabs">{STATUS.map((s) => <button key={s.value} className={status === s.value ? 'active' : ''} onClick={() => setStatus(s.value)}>{s.label}</button>)}</div>
      <div className="pipeline-toolbar"><div className="search-field"><Search size={16} /><input placeholder="按患者、计划号或标题搜索" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} /></div><Button variant="secondary" onClick={load}>搜索</Button></div>
    </Card>
    {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : !data?.items?.length ? <Card><Empty title="暂无治疗计划" description="从一位患者的临床档案开始创建计划。" /></Card> : <div className="treatment-plan-grid">
      {data.items.map((plan) => <button className="treatment-plan-card" key={plan.plan_id} onClick={() => openDetail(plan.plan_id)}>
        <div className="tp-top"><div className="tp-avatar">{String(plan.patient_name || '患').slice(0, 1)}</div><div className="tp-patient"><strong>{plan.patient_name}</strong><small>{plan.patient_no} · {plan.plan_no}</small></div><Badge value={plan.status}>{LABELS[plan.status]}</Badge></div>
        <div className="tp-title">{plan.title}</div>
        <div className="tp-meta"><span><Stethoscope size={13} />{plan.dentist_name}</span><span>{plan.clinic_no}</span></div>
        <div className="tp-progress"><i style={{ width: (plan.item_count ? plan.completed_count / plan.item_count * 100 : 0) + '%' }} /></div>
        <div className="tp-foot"><span>{plan.completed_count}/{plan.item_count} 项完成</span><strong>{money(plan.total_amount)}</strong></div>
      </button>)}
    </div>}

    {createOpen && <Modal title="新建治疗计划" wide onClose={() => setCreateOpen(false)} footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button><Button onClick={createPlan} disabled={saving}>{saving ? '创建中…' : '创建计划'}</Button></>}>
      <FormGrid columns={2}>
        <Field label="患者" required className="span-2"><select value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}><option value="">选择患者</option>{patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name} · {p.patient_no} · {p.phone}</option>)}</select></Field>
        <Field label="诊所" required><select value={form.clinicId} onChange={(e) => setForm({ ...form, clinicId: e.target.value })}>{meta?.clinics.map((c) => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_no}</option>)}</select></Field>
        <Field label="主诊牙医" required><select value={isDentist ? user.dentistId || '' : form.dentistId} disabled={isDentist} onChange={(e) => setForm({ ...form, dentistId: e.target.value })}>{meta?.dentists.map((d) => <option key={d.dentist_id} value={d.dentist_id}>{d.display_name} · {d.employee_no}</option>)}</select></Field>
        <Field label="计划标题" required className="span-2"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="沟通备注" className="span-2"><textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="记录患者主诉、方案选择与风险告知。" /></Field>
      </FormGrid>
      <div className="info-strip"><ClipboardList size={15} />创建后可在计划详情中逐项添加治疗项目与牙位。</div>
    </Modal>}

    {detail && <Modal title={detail.title} wide onClose={() => setDetail(null)} footer={<><Button variant="ghost" onClick={() => setDetail(null)}>关闭</Button>{canWrite && <Button onClick={() => setItemOpen(true)}><Plus size={15} />添加项目</Button>}</>}>
      <div className="treatment-detail-head"><div><Badge value={detail.status}>{LABELS[detail.status]}</Badge><h2>{detail.patient_name} · {detail.plan_no}</h2><p>{detail.patient_no} · {detail.dentist_name} · {detail.clinic_no} · 更新于 {dateOnly(detail.updated_at)}</p></div><div className="tp-total">{money(detail.total_amount)}<small>计划金额</small></div></div>
      {canWrite && <div className="status-actions">{['DRAFT','PRESENTED','ACCEPTED','IN_PROGRESS','COMPLETED','DECLINED'].map((s) => <button key={s} className={detail.status === s ? 'active' : ''} onClick={() => updateStatus(s)}>{LABELS[s]}</button>)}</div>}
      {detail.notes && <div className="info-strip">{detail.notes}</div>}
      <div className="plan-items">{!detail.items.length ? <Empty title="计划尚无项目" description="添加治疗项目、牙位与价格后，患者可在小程序查看。" /> : detail.items.map((row) => <div className="plan-item-row" key={row.item_id}><div><strong>{row.treatment_name}</strong><small>{row.tooth_no ? '牙位 ' + row.tooth_no : '全口'} · {row.quantity} × {money(row.unit_price)}</small></div><div className="plan-item-actions"><Badge value={row.status}>{ITEM_LABELS[row.status]}</Badge>{canWrite && row.status !== 'COMPLETED' && <button className="text-link" onClick={() => setItemStatus(row, 'COMPLETED')}>完成</button>}</div></div>)}</div>
      <div className="plan-total-line"><span>{detail.completed_count}/{detail.item_count} 项完成</span><strong>{money(detail.total_amount)}</strong></div>
    </Modal>}

    {itemOpen && <Modal title="添加治疗项目" onClose={() => setItemOpen(false)} footer={<><Button variant="ghost" onClick={() => setItemOpen(false)}>取消</Button><Button onClick={addItem} disabled={saving}>{saving ? '添加中…' : '添加'}</Button></>}>
      <Field label="治疗项目" required><select value={item.treatmentItemId} onChange={(e) => pickTreatment(e.target.value)}><option value="">选择项目</option>{meta?.treatments.filter((t) => t.status === 'ACTIVE').map((t) => <option key={t.treatment_item_id} value={t.treatment_item_id}>{t.treatment_name} · {money(t.current_price || 0)}</option>)}</select></Field>
      <FormGrid columns={2}><Field label="牙位"><select value={item.toothNo} onChange={(e) => setItem({ ...item, toothNo: e.target.value })}><option value="">全口 / 不指定</option>{TEETH.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field><Field label="数量"><input type="number" min="1" step="1" value={item.quantity} onChange={(e) => setItem({ ...item, quantity: e.target.value })} /></Field><Field label="单价"><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItem({ ...item, unitPrice: e.target.value })} /></Field><Field label="备注"><input value={item.note} onChange={(e) => setItem({ ...item, note: e.target.value })} /></Field></FormGrid>
      {selectedTreatment && <div className="info-strip">标准价 {money(selectedTreatment.current_price || 0)}；计划价可按沟通结果调整。</div>}
    </Modal>}
  </div>;
}
