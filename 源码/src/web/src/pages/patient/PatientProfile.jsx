import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, UserRound } from 'lucide-react';
import { api, dateOnly } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Button, Card, ErrorState, Field, FormGrid, Loading, PageHeader } from '../../components/ui.jsx';

export default function PatientProfile() {
  const { user, notify } = useApp();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api('/patient/profile').then((d) => { setData(d); setForm(d.patient ? { phone: d.patient.phone, email: d.patient.email || '', billingAddress: d.patient.billing_address, emergencyContactName: d.patient.emergency_contact_name, emergencyContactPhone: d.patient.emergency_contact_phone } : null); }).catch(setError);
  useEffect(load, []);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;
  if (user.linkStatus !== 'ACTIVE' || !data.patient) return <div>
    <PageHeader eyebrow="PROFILE" title="个人资料" description="患者档案绑定状态。" />
    <Card className="notice-card"><ShieldCheck size={22} /><div><strong>账号待核验</strong><p>当前申请状态：{data.linkStatus || user.linkStatus || 'PENDING'}。审核通过前不能查看历史诊疗、收费和支付记录。</p>{data.binding?.requested_clinic_no && <p>申请诊所：{data.binding.requested_clinic_no}</p>}<Link className="text-link" to="/portal">返回首页</Link></div></Card>
  </div>;
  const save = async () => { try { await api('/patient/profile', { method: 'PUT', body: form }); notify('个人资料已更新'); load(); } catch (err) { notify(err.message, 'error'); } };
  return <div>
    <PageHeader eyebrow="PROFILE" title="个人资料" description="姓名、出生日期和患者编号由诊所核验维护；患者可更新联系方式与紧急联系人。" />
    <div className="patient-two-col">
      <Card><div className="card-head"><div><h2>基本信息</h2><p>{data.patient.patient_no}</p></div><div className="avatar soft"><UserRound size={18} /></div></div><dl className="detail-list"><div><dt>姓名</dt><dd>{data.patient.patient_name}</dd></div><div><dt>出生日期</dt><dd>{dateOnly(data.patient.birth_date)}</dd></div><div><dt>账号</dt><dd>{user.username}</dd></div><div><dt>过敏记录</dt><dd>{data.allergies.length ? data.allergies.map((a) => a.allergy_name).join('、') : '暂无'}</dd></div><div><dt>关联诊所</dt><dd>{data.clinics.length ? data.clinics.map((c) => c.clinic_no).join('、') : '暂无'}</dd></div></dl></Card>
      <Card><div className="card-head"><h2>联系资料</h2></div><FormGrid columns={1}><Field label="手机号"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><Field label="电子邮箱"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="账单地址"><input value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} /></Field><Field label="紧急联系人"><input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} /></Field><Field label="紧急联系电话"><input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} /></Field></FormGrid><div className="patient-form-actions"><Button onClick={save}>保存联系方式</Button></div></Card>
    </div>
  </div>;
}
