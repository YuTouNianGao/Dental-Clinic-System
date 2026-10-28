import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { api, dateTime } from '../../lib/api.js';
import { Button, Card, Empty, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';

export default function PatientNotifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = () => { setLoading(true); api('/patient/notifications').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); };
  useEffect(load, []);
  const read = async (id) => { await api(`/patient/notifications/${id}/read`, { method: 'POST' }); load(); };
  const readAll = async () => { await api('/patient/notifications/read-all', { method: 'POST' }); load(); };
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  return <div>
    <PageHeader eyebrow="NOTIFICATIONS" title="站内通知" description="通知仅作为业务提醒，预约、支付和退款状态以业务记录为准。" actions={<Button variant="secondary" size="sm" onClick={readAll}><CheckCheck size={15} />全部已读</Button>} />
    {!items.length ? <Card><Empty title="暂无通知" /></Card> : <Card><div className="patient-notification-list">{items.map((n) => <div key={n.notification_id} className={'patient-notification ' + (n.read_at ? '' : 'unread')}><div className="notification-icon"><Bell size={17} /></div><div><strong>{n.title}</strong><p>{n.body}</p><small>{dateTime(n.created_at)}{n.read_at ? ' · 已读' : ''}</small></div>{!n.read_at && <Button size="xs" variant="ghost" onClick={() => read(n.notification_id)}>标为已读</Button>}</div>)}</div></Card>}
  </div>;
}
