import React, { useEffect, useState } from 'react';
import { api, dateTime, money } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function Refunds() {
  const { notify } = useApp();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = () => { setLoading(true); api('/staff/refunds' + (status ? '?status=' + status : '')).then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); };
  useEffect(load, [status]);
  const act = async (row, action) => {
    try {
      if (action === 'approve') await api(`/staff/refunds/${row.refund_id}/approve`, { method: 'POST', body: { note: '资料核验通过' } });
      if (action === 'info') { const note = window.prompt('请输入需要补充的资料'); if (!note) return; await api(`/staff/refunds/${row.refund_id}/request-info`, { method: 'POST', body: { note } }); }
      if (action === 'reject') { const note = window.prompt('请输入驳回原因（驳回不自动没收，资金将进入冻结/争议）'); if (!note) return; await api(`/staff/refunds/${row.refund_id}/reject`, { method: 'POST', body: { note } }); }
      if (action === 'process') { const outcome = window.confirm('点击“确定”模拟退款成功，点击“取消”模拟退款失败') ? 'SUCCESS' : 'FAILURE'; await api(`/staff/refunds/${row.refund_id}/process`, { method: 'POST', body: { outcome } }); }
      notify('操作完成'); load();
    } catch (err) { notify(err.message, 'error'); }
  };
  return <div>
    <PageHeader eyebrow="REFUND REVIEW" title="退款审核" description="退款申请、审批、处理中、成功/失败严格区分；驳回和技术失败不会自动没收预约金。" actions={<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部状态</option>{['PENDING_REVIEW','NEEDS_INFO','APPROVED','PROCESSING','SUCCEEDED','REJECTED','FAILED'].map((s) => <option key={s} value={s}>{s}</option>)}</select>} />
    {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : !items.length ? <Card><Empty title="暂无退款任务" /></Card> : <Card><Table><thead><tr><th>退款单</th><th>患者 / 订单</th><th>原因 / 金额</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((r) => <tr key={r.refund_id}><td><strong>{r.refund_no}</strong><small className="block">{dateTime(r.created_at)}</small></td><td>{r.patient_name}<small className="block">{r.order_no}</small></td><td>{r.reason_code}<small className="block">{money(r.amount)} · {r.review_note || ''}</small></td><td><Badge value={r.status} /></td><td><div className="row-actions">{['PENDING_REVIEW','NEEDS_INFO'].includes(r.status) && <><Button size="xs" onClick={() => act(r, 'approve')}>通过</Button><Button size="xs" variant="ghost" onClick={() => act(r, 'info')}>补资料</Button><Button size="xs" variant="ghost danger" onClick={() => act(r, 'reject')}>驳回</Button></>}{['APPROVED','FAILED'].includes(r.status) && <Button size="xs" onClick={() => act(r, 'process')}>模拟退款</Button>}</div></td></tr>)}</tbody></Table></Card>}
  </div>;
}
