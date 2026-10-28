import React, { useEffect, useState } from 'react';
import { api, dateTime, money } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PaymentOrders() {
  const { notify } = useApp();
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = () => { setLoading(true); api('/staff/payment-orders').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); };
  useEffect(load, []);
  const open = async (row) => { try { setDetail(await api('/staff/payment-orders/' + row.order_id)); } catch (err) { notify(err.message, 'error'); } };
  const collect = async (row) => {
    const amount = window.prompt('本次收款金额', String(row.amount));
    if (!amount) return;
    const receiptNo = window.prompt('收据/凭证号');
    if (!receiptNo) return;
    try {
      await api(`/staff/payment-orders/${row.order_id}/offline-payments`, { method: 'POST', body: { amount, channel: 'CASH', receiptNo, note: '前台登记收款' } });
      notify('收款已登记，等待主管/财务确认'); load(); if (detail?.order?.order_id === row.order_id) open(row);
    } catch (err) { notify(err.message, 'error'); }
  };
  const confirm = async (tx) => {
    try { await api(`/staff/payment-transactions/${tx.transaction_id}/confirm`, { method: 'POST' }); notify('收款已确认'); open({ order_id: detail.order.order_id }); load(); }
    catch (err) { notify(err.message, 'error'); }
  };
  return <div>
    <PageHeader eyebrow="PATIENT PAYMENTS" title="患者支付订单" description="患者预约金、诊后余额、模拟支付与线下收款登记；线下收款须经主管/财务确认后才冲减欠款。" />
    {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : !items.length ? <Card><Empty title="暂无患者支付订单" /></Card> : <Card><Table><thead><tr><th>订单</th><th>患者</th><th>类型 / 金额</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((o) => <tr key={o.order_id}><td><strong>{o.order_no}</strong><small className="block">{dateTime(o.created_at)}</small></td><td>{o.patient_name}<small className="block">{o.patient_no} · {o.clinic_no}</small></td><td>{o.order_type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额'}<small className="block">{money(o.amount)}</small></td><td><Badge value={o.status} /><small className="block">已付 {money(o.amount_paid)}</small></td><td><div className="row-actions"><Button size="xs" variant="ghost" onClick={() => open(o)}>流水</Button>{o.order_type === 'VISIT_BALANCE' && ['PENDING_PAYMENT','PARTIALLY_PAID'].includes(o.status) && <Button size="xs" onClick={() => collect(o)}>线下收款</Button>}</div></td></tr>)}</tbody></Table></Card>}
    {detail && <Card className="section-card"><div className="card-head"><div><h2>收款流水 · {detail.order.order_no}</h2><p>登记与确认分离；确认前不冲减欠款。</p></div><Button size="sm" variant="ghost" onClick={() => setDetail(null)}>关闭</Button></div><Table><thead><tr><th>流水号</th><th>金额</th><th>渠道</th><th>状态</th><th>凭证</th><th></th></tr></thead><tbody>{detail.transactions.map((t) => <tr key={t.transaction_id}><td>{t.transaction_no}</td><td>{money(t.amount)}</td><td>{t.channel}</td><td><Badge value={t.status} /></td><td>{t.receipt_no || '—'}</td><td>{t.status === 'RECORDED' && <Button size="xs" onClick={() => confirm(t)}>确认收款</Button>}</td></tr>)}</tbody></Table></Card>}
  </div>;
}
