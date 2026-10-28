import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ClipboardPlus, ReceiptText, WalletCards, Bell, UserRound, Clock3 } from 'lucide-react';
import { api, dateTime, money, sumMoney } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';

export default function PatientHome() {
  const { user } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => { setError(null); api('/patient/home').then(setData).catch(setError); };
  useEffect(load, []);

  if (user.linkStatus !== 'ACTIVE') return <div>
    <PageHeader eyebrow="PATIENT PORTAL" title="患者档案待核验" description="您的账号已创建，但既有患者档案尚未完成绑定审核。" />
    <Card className="notice-card"><Clock3 size={22} /><div><strong>等待门店核验</strong><p>请携带有效身份证明到申请诊所，由前台/主管/总部核验后开放预约、就诊和账单信息。</p><Link className="text-link" to="/portal/profile">查看绑定状态</Link></div></Card>
  </div>;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;

  const openOrders = (data.paymentOrders || []).filter((o) => ['PENDING_PAYMENT', 'PARTIALLY_PAID'].includes(o.status));
  const upcoming = (data.appointments || []).filter((a) => ['PENDING_PAYMENT', 'SCHEDULED'].includes(a.status)).slice(0, 3);
  return <div>
    <PageHeader eyebrow="PATIENT PORTAL" title={`您好，${data.patient?.patient_name || user.displayName}`} description="查看预约、待支付金额、就诊记录和站内通知。" actions={<Link to="/portal/booking"><Button><CalendarPlus size={16} />预约就诊</Button></Link>} />
    <div className="patient-metric-grid">
      <Card className="patient-metric"><span>待支付预约金</span><strong>{money(sumMoney(openOrders.filter((o) => o.order_type === 'APPOINTMENT_DEPOSIT').map((o) => o.amount)))}</strong><Link to="/portal/payments">查看支付订单</Link></Card>
      <Card className="patient-metric"><span>待支付诊后余额</span><strong>{money(sumMoney(openOrders.filter((o) => o.order_type === 'VISIT_BALANCE').map((o) => o.amount)))}</strong><Link to="/portal/payments">查看支付订单</Link></Card>
      <Card className="patient-metric"><span>未读通知</span><strong>{data.notifications.filter((n) => !n.read_at).length}</strong><Link to="/portal/notifications">查看通知</Link></Card>
      <Card className="patient-metric"><span>近期就诊</span><strong>{data.visits.length}</strong><Link to="/portal/visits">查看记录</Link></Card>
    </div>

    <div className="patient-two-col">
      <Card>
        <div className="card-head"><div><h2>最近预约</h2><p>待支付预约请在 15 分钟内完成支付</p></div><Link className="text-link" to="/portal/appointments">全部预约</Link></div>
        {upcoming.length ? <div className="patient-list">{upcoming.map((a) => <div key={a.appointment_id} className="patient-list-row"><div><strong>{dateTime(a.scheduled_start_at)}</strong><small>{a.clinic_no} · {a.dentist_name} · {a.appointment_no}</small></div><div className="patient-row-actions"><Badge value={a.status} /><Link className="text-link" to={`/portal/appointments/${a.appointment_id}`}>查看</Link></div></div>)}</div> : <Empty title="暂无待就诊预约" description="可以现在选择诊所和时段。" />}
      </Card>
      <Card>
        <div className="card-head"><div><h2>待处理事项</h2><p>支付、退款和通知状态</p></div></div>
        <div className="patient-quick-links">
          <Link to="/portal/payments"><WalletCards size={18} />支付订单</Link>
          <Link to="/portal/charges"><ReceiptText size={18} />收费账单</Link>
          <Link to="/portal/visits"><ClipboardPlus size={18} />就诊记录</Link>
          <Link to="/portal/notifications"><Bell size={18} />站内通知</Link>
          <Link to="/portal/profile"><UserRound size={18} />个人资料</Link>
        </div>
        {data.notifications.slice(0, 3).map((n) => <div key={n.notification_id} className="patient-notice-line"><strong>{n.title}</strong><span>{n.body}</span></div>)}
      </Card>
    </div>
  </div>;
}
