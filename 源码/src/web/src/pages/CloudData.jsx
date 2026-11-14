import React, { useEffect, useState } from 'react';
import { Cloud, RefreshCw, Users, CalendarDays, WalletCards, ClipboardList } from 'lucide-react';
import { api, dateTime, money } from '../lib/api.js';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader } from '../components/ui.jsx';
import { useApp } from '../components/AppContext.jsx';

const STATUS = {
  PENDING_PAYMENT: '待支付', SCHEDULED: '已确认', ATTENDED: '已到诊', CANCELLED: '已取消',
  PENDING: '待支付', PAID: '已支付', PARTIALLY_PAID: '部分支付', PARTIALLY_REFUNDED: '部分退款', REFUNDING: '退款中',
  REFUNDED: '已退款', EXPIRED: '已过期', PRESENTED: '待确认', ACCEPTED: '已接受', IN_PROGRESS: '进行中', COMPLETED: '已完成'
};

export default function CloudData() {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updating, setUpdating] = useState('');
  const load = async (force = false) => {
    setLoading(true); setError(null);
    try {
      const result = force ? await api('/cloud-data/refresh', { method: 'POST' }) : await api('/cloud-data/overview');
      setData(result);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const syncSchedules = async () => {
    setSyncing(true);
    try {
      const result = await api('/cloud-data/sync-schedules', { method: 'POST' });
      const stats = result.data || {};
      notify(`排班已同步：新增 ${stats.created || 0}，更新 ${stats.updated || 0}，跳过 ${stats.skipped || 0}`);
      await load(true);
    } catch (e) { notify(e.message, 'error'); }
    finally { setSyncing(false); }
  };
  const collectOrder = async (order) => {
    setUpdating(order.id);
    try {
      await api(`/cloud-data/orders/${order.id}/collect`, { method: 'POST' });
      notify('小程序收款已登记');
      await load(true);
    } catch (e) { notify(e.message, 'error'); }
    finally { setUpdating(''); }
  };
  const refundOrder = async (order) => {
    const reason = window.prompt('退款原因', 'Web 员工退款');
    if (reason === null) return;
    setUpdating(order.id);
    try {
      await api(`/cloud-data/orders/${order.id}/refund`, { method: 'POST', body: { reason } });
      notify('小程序退款已登记');
      await load(true);
    } catch (e) { notify(e.message, 'error'); }
    finally { setUpdating(''); }
  };
  const updateAppointment = async (appointment, status) => {
    setUpdating(appointment.id);
    try {
      await api(`/cloud-data/appointments/${appointment.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      notify(status === 'CANCELLED' ? '小程序预约已取消' : '小程序预约状态已更新');
      await load(true);
    } catch (e) { notify(e.message, 'error'); }
    finally { setUpdating(''); }
  };
  return <div>
    <PageHeader eyebrow="CLOUDBASE / MINI PROGRAM" title="小程序云数据" description="读取小程序云数据，并把排班、预约状态、收款和退款写回小程序；员工可在这里核对两端数据。" actions={<><Button variant="secondary" onClick={syncSchedules} disabled={syncing}><CalendarDays size={15} />{syncing ? '同步中…' : '同步排班到小程序'}</Button><Button onClick={() => load(true)} disabled={loading}><RefreshCw size={15} />刷新云数据</Button></>} />
    {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={() => load(true)} /> : data && <>
      <div className="cloud-kpis">
        <Card><Users size={18} /><span>小程序患者</span><strong>{data.counts.patients}</strong></Card>
        <Card><CalendarDays size={18} /><span>预约</span><strong>{data.counts.appointments}</strong></Card>
        <Card><WalletCards size={18} /><span>支付订单</span><strong>{data.counts.orders}</strong></Card>
        <Card><ClipboardList size={18} /><span>治疗计划</span><strong>{data.counts.plans}</strong></Card>
      </div>
      <div className="info-strip"><Cloud size={15} />数据来源：微信云数据库 · 最近拉取 {dateTime(data.pulledAt)} {data.cached ? '（缓存）' : ''}。患者资料为云 → Web 只读；排班、预约状态、收款和退款可从 Web 写回小程序。</div>
      <div className="finance-strip">
        <div><span>已收款</span><strong>{money(Number(data.finance?.collectedCents || 0) / 100)}</strong><small>{data.counts.transactions} 笔流水</small></div>
        <div><span>已退款</span><strong className="red">{money(Number(data.finance?.refundedCents || 0) / 100)}</strong><small>{data.counts.refunds} 笔退款</small></div>
        <div><span>待收余额</span><strong>{money(Number(data.finance?.outstandingCents || 0) / 100)}</strong><small>未支付/部分支付订单</small></div>
      </div>
      <div className="cloud-grid">
        <Card>
          <div className="card-head"><div><h2>小程序患者</h2><p>按注册时间倒序</p></div><Badge tone="blue">{data.patients.length}</Badge></div>
          {!data.patients.length ? <Empty title="暂无小程序患者" /> : <div className="cloud-list">{data.patients.slice(0, 12).map((p) => <div className="cloud-row" key={p.id}><div className="tp-avatar">{String(p.name || '患').slice(0, 1)}</div><div><strong>{p.name}</strong><small>{p.patientNo} · {p.phone} · {p.gender === 'MALE' ? '男' : p.gender === 'FEMALE' ? '女' : '其他'} · {p.age} 岁</small></div></div>)}</div>}
        </Card>
        <Card>
          <div className="card-head"><div><h2>小程序预约</h2><p>含待支付、已确认和已取消</p></div><Badge tone="blue">{data.appointments.length}</Badge></div>
          {!data.appointments.length ? <Empty title="暂无小程序预约" /> : <div className="cloud-list">{data.appointments.slice(0, 12).map((a) => <div className="cloud-row" key={a.id}><div><strong>{a.patientName} · {a.date}</strong><small>{a.clinicName} · {a.dentistName} · {a.appointmentNo}</small></div><Badge value={a.status}>{STATUS[a.status] || a.status}</Badge>{a.status === 'SCHEDULED' && <div className="cloud-actions"><button disabled={updating === a.id} onClick={() => updateAppointment(a, 'ATTENDED')}>到诊</button><button disabled={updating === a.id} onClick={() => updateAppointment(a, 'CANCELLED')}>取消</button></div>}</div>)}</div>}
        </Card>
        <Card>
          <div className="card-head"><div><h2>小程序支付</h2><p>预约金 / 诊后余额</p></div><Badge tone="blue">{data.orders.length}</Badge></div>
          {!data.orders.length ? <Empty title="暂无小程序支付" /> : <div className="cloud-list">{data.orders.slice(0, 12).map((o) => <div className="cloud-row" key={o.id}><div><strong>{o.patientName || '患者'} · {money(Number(o.amountCents || 0) / 100)}</strong><small>{o.type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额'} · {o.no} · 已收 {money(Number(o.paidCents || 0) / 100)}</small></div><Badge value={o.status}>{STATUS[o.status] || o.status}</Badge><div className="cloud-actions">{!['PAID', 'REFUNDED'].includes(o.status) && <button disabled={updating === o.id} onClick={() => collectOrder(o)}>收款</button>}{Number(o.paidCents || 0) > Number(o.refundedCents || 0) && <button disabled={updating === o.id} onClick={() => refundOrder(o)}>退款</button>}</div></div>)}</div>}
        </Card>
        <Card>
          <div className="card-head"><div><h2>小程序治疗计划</h2><p>云数据库中的计划摘要</p></div><Badge tone="blue">{data.plans.length}</Badge></div>
          {!data.plans.length ? <Empty title="暂无治疗计划" /> : <div className="cloud-list">{data.plans.slice(0, 12).map((p) => <div className="cloud-row" key={p.id}><div><strong>{p.patientName} · {p.title}</strong><small>{p.no} · {money(Number(p.totalCents || 0) / 100)}</small></div><Badge value={p.status}>{STATUS[p.status] || p.status}</Badge></div>)}</div>}
        </Card>
      </div>
    </>}
  </div>;
}
