import React, { useEffect, useState } from 'react';
import { api, dateTime, money } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function SettlementExceptions() {
  const { notify } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = () => { setLoading(true); api('/staff/settlement-exceptions').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); };
  useEffect(load, []);
  const review = async (row) => {
    const note = window.prompt('请输入人工复核备注（系统不会自动退款、结转或释放抵扣）');
    if (!note?.trim()) return;
    try { await api(`/staff/settlement-exceptions/${row.exception_id}/review`, { method: 'POST', body: { note: note.trim() } }); notify('已标记人工复核中'); load(); }
    catch (err) { notify(err.message, 'error'); }
  };
  return <div>
    <PageHeader eyebrow="SETTLEMENT EXCEPTIONS" title="结算作废资金异常" description="作废涉及预约金抵扣或已支付余额时，系统不会自动退款、结转或释放抵扣，必须人工复核。" />
    {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : !items.length ? <Card><Empty title="暂无待处理异常" /></Card> : <Card><Table><thead><tr><th>异常单</th><th>结算 / 患者</th><th>类型</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((e) => <tr key={e.exception_id}><td><strong>{e.exception_no}</strong><small className="block">{dateTime(e.detected_at)}</small></td><td>{e.settlement_no}<small className="block">{e.patient_name} · {money(e.total_amount)}</small></td><td>{e.exception_type}<small className="block">预约金/余额已保留</small></td><td><Badge value={e.status} /></td><td>{['PENDING','IN_REVIEW'].includes(e.status) && <Button size="xs" onClick={() => review(e)}>人工复核</Button>}</td></tr>)}</tbody></Table></Card>}
  </div>;
}
