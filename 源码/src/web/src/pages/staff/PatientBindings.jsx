import React, { useEffect, useState } from 'react';
import { Search, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { api, dateTime } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientBindings() {
  const { notify } = useApp();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = () => { setLoading(true); api('/staff/patient-bindings?status=' + status).then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); };
  useEffect(load, [status]);

  const approve = async (row) => {
    const patientId = window.prompt('请输入核验匹配的患者 ID（可从患者档案页面查询）', row.matched_patient_id || '');
    if (!patientId) return;
    try {
      await api(`/staff/patient-bindings/${row.user_id}/approve`, { method: 'POST', body: { patientId: Number(patientId), note: '前台/主管核验身份后绑定' } });
      notify('患者账号绑定已通过'); load();
    } catch (err) { notify(err.message, 'error'); }
  };
  const reject = async (row) => {
    const reason = window.prompt('请输入拒绝原因');
    if (!reason?.trim()) return;
    try { await api(`/staff/patient-bindings/${row.user_id}/reject`, { method: 'POST', body: { reason: reason.trim() } }); notify('已拒绝绑定申请'); load(); }
    catch (err) { notify(err.message, 'error'); }
  };
  const unbind = async (row) => {
    const reason = window.prompt('请输入解绑原因');
    if (!reason?.trim()) return;
    try { await api(`/staff/patient-bindings/${row.user_id}/unbind`, { method: 'POST', body: { reason: reason.trim() } }); notify('已解绑'); load(); }
    catch (err) { notify(err.message, 'error'); }
  };

  return <div>
    <PageHeader eyebrow="PATIENT ACCOUNT REVIEW" title="患者账号绑定" description="仅展示当前诊所范围内、待核验或已处理的绑定申请；跨诊所患者需由总部审核。" actions={<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">待核验</option><option value="REJECTED">已拒绝</option><option value="REVOKED">已解绑</option><option value="ACTIVE">已绑定</option></select>} />
    {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : !items.length ? <Card><Empty title="暂无绑定申请" /></Card> : <Card><Table><thead><tr><th>申请账号</th><th>申请信息</th><th>申请诊所</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((row) => <tr key={row.user_id}><td><strong>{row.display_name}</strong><small className="block">{row.username} · {dateTime(row.created_at)}</small></td><td>{row.requested_name || '—'}<small className="block">{row.requested_phone || '—'} · {row.requested_patient_no || '未提供患者编号'}</small>{row.matched_patient_no && <small className="block">匹配：{row.matched_patient_no} {row.matched_patient_name}</small>}</td><td>{row.requested_clinic_no || '—'}</td><td><Badge value={row.link_status} /></td><td><div className="row-actions">{row.link_status === 'PENDING' && <><Button size="xs" onClick={() => approve(row)}><UserCheck size={14} />通过</Button><Button size="xs" variant="ghost danger" onClick={() => reject(row)}><UserX size={14} />拒绝</Button></>}{row.link_status === 'ACTIVE' && <Button size="xs" variant="ghost danger" onClick={() => unbind(row)}>解绑</Button>}</div></td></tr>)}</tbody></Table></Card>}
  </div>;
}
