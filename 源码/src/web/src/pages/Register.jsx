import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp } from '../components/AppContext.jsx';
import { Button, Card, Field, FormGrid } from '../components/ui.jsx';

const empty = {
  registrationType: 'NEW_PATIENT',
  username: '', password: '', patientName: '', birthDate: '', phone: '', email: '',
  billingAddress: '', emergencyContactName: '', emergencyContactPhone: '', clinicId: '', consent: false
};

export default function Register() {
  const { setUser } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [clinics, setClinics] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/public/clinics').then((data) => setClinics(data.items)).catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await api('/auth/register', { method: 'POST', body: {
        ...form,
        billingAddress: form.billingAddress || '未填写',
        emergencyContactName: form.emergencyContactName || '待补充',
        emergencyContactPhone: form.emergencyContactPhone || '00000000000',
        clinicId: form.clinicId ? Number(form.clinicId) : null
      } });
      setUser(data.user);
      navigate('/portal', { replace: true });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return <div className="patient-auth-page">
    <Card className="patient-auth-card">
      <Link to="/login" className="back-line"><ArrowLeft size={15} /> 返回登录</Link>
      <div className="eyebrow"><UserPlus size={14} /> PATIENT REGISTRATION</div>
      <h1>创建患者账号</h1>
      <p className="muted">新患者会创建新的患者档案；已有档案请选择“已有患者档案”，由门店工作人员核验后绑定。</p>
      {error && <div className="inline-error">{error}</div>}
      <form onSubmit={submit}>
        <FormGrid columns={2}>
          <Field label="注册类型" required className="span-2">
            <select value={form.registrationType} onChange={(e) => setForm({ ...form, registrationType: e.target.value })}>
              <option value="NEW_PATIENT">我是新患者（创建新档案）</option>
              <option value="EXISTING_PATIENT">我已有患者档案（申请绑定）</option>
            </select>
          </Field>
          <Field label="登录用户名" required><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" /></Field>
          <Field label="登录密码" required hint="至少 8 位"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="患者姓名" required><input value={form.patientName} onChange={(e) => setForm({ ...form, patientName: e.target.value })} /></Field>
          <Field label="出生日期" required><input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
          <Field label="手机号" required><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="电子邮箱"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="账单地址"><input value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} placeholder="新患者建议填写" /></Field>
          <Field label="建档/申请诊所"><select value={form.clinicId} onChange={(e) => setForm({ ...form, clinicId: e.target.value })}><option value="">请选择</option>{clinics.map((c) => <option key={c.clinicId} value={c.clinicId}>{c.clinicNo} · {c.postalAddress}</option>)}</select></Field>
          <Field label="紧急联系人"><input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} /></Field>
          <Field label="紧急联系电话"><input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} /></Field>
        </FormGrid>
        <label className="check-line"><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />我已阅读并同意患者服务、隐私保护及预约金规则。</label>
        <Button type="submit" className="login-submit" disabled={loading}>{loading ? '正在创建…' : '创建账号并进入患者端'}</Button>
      </form>
      <div className="login-foot">已有账号？<Link className="text-link" to="/login">返回登录</Link></div>
    </Card>
  </div>;
}
