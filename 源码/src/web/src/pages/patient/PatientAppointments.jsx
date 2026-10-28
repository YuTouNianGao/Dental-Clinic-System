import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, CreditCard, RefreshCcw, XCircle } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { useApp } from '../../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientAppointments() {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = () => { setLoading(true); setError(null); api('/patient/appointments?pageSize=50').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); };
  useEffect(load, []);

  const cancel = async (appointment) => {
    const reason = window.prompt('请填写取消原因');
    if (!reason?.trim()) return;
    try {
      const result = await api(`/patient/appointments/${appointment.appointment_id}/cancel`, { method: 'POST', body: { reason: reason.trim() } });
      notify(result.refundEligible ? '预约已取消，退款申请已提交审核' : '预约已取消；本次预约金按规则不退款');
      load();
    } catch (err) { notify(err.message, 'error'); }
  };

  const reschedule = async (appointment) => {
    if (!window.confirm('改期将先取消当前预约，再独立创建新预约；旧预约金不会转移到新预约。是否继续？')) return;
    const reason = window.prompt('请填写改期原因', '患者申请改期');
    if (!reason?.trim()) return;
    try {
      const result = await api(`/patient/appointments/${appointment.appointment_id}/cancel`, { method: 'POST', body: { reason: `改期：${reason.trim()}` } });
      notify(result.refundEligible ? '原预约已取消，退款申请已提交；请重新选择时段' : '原预约已取消；请重新选择时段');
      navigate(`/portal/booking?clinicId=${appointment.clinic_id}`);
    } catch (err) { notify(err.message, 'error'); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  return <div>
    <PageHeader eyebrow="APPOINTMENTS" title="我的预约" description="查看预约状态、支付预约金、取消预约。改期请先取消原预约，再独立创建新预约。" />
    {!items.length ? <Card><Empty title="暂无预约" description="可以从预约就诊开始选择诊所和时段。" /></Card> : <Card>
      <Table><thead><tr><th>预约</th><th>牙医 / 诊所</th><th>预约金</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {items.map((a) => <tr key={a.appointment_id}>
          <td><strong>{dateTime(a.scheduled_start_at)}</strong><small className="block">{a.appointment_no}</small></td>
          <td>{a.dentist_name}<small className="block">{a.clinic_no}</small></td>
          <td>{a.order_id ? money(a.deposit_amount) : '—'}<small className="block">{a.payment_status || ''}</small></td>
          <td><Badge value={a.status} />{a.status === 'PENDING_PAYMENT' && a.expires_at && <small className="block">支付截止 {dateTime(a.expires_at)}</small>}</td>
          <td><div className="row-actions">
            <Link className="text-link" to={`/portal/appointments/${a.appointment_id}`}>详情</Link>
            {a.order_id && a.payment_status === 'PENDING_PAYMENT' && <Link className="text-link" to={`/portal/payments/${a.order_id}`}><CreditCard size={14} />支付</Link>}
            {['PENDING_PAYMENT', 'SCHEDULED'].includes(a.status) && <Button size="xs" variant="ghost danger" onClick={() => cancel(a)}><XCircle size={14} />取消</Button>}
            {a.status === 'SCHEDULED' && <Button size="xs" variant="ghost" onClick={() => reschedule(a)}><RefreshCcw size={14} />改期</Button>}
          </div></td>
        </tr>)}
      </tbody></Table>
    </Card>}
  </div>;
}
