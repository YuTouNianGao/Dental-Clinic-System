import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarClock, CheckCircle2 } from 'lucide-react';
import { api, dateOnly } from '../lib/api.js';
import { useApp } from '../components/AppContext.jsx';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader } from '../components/ui.jsx';

const TYPE = { EXAM: '检查', CLEANING: '洁牙', PERIO: '牙周', ORTHO: '正畸' };
const STATUS = { DUE: '待安排', SCHEDULED: '已预约', COMPLETED: '已完成', DISMISSED: '已忽略' };

export default function Recalls() {
  const { notify } = useApp();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overdue');
  const load = () => { setError(null); api('/clinical/recalls' + (tab === 'overdue' ? '?due=overdue' : '')).then((d) => setItems(d.items)).catch(setError); };
  useEffect(load, [tab]);
  const update = async (row, status) => {
    try { await api('/clinical/recalls/' + row.recall_id, { method: 'PATCH', body: { status } }); notify('召回状态已更新'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };
  const overdue = (items || []).filter((r) => r.status === 'DUE' && r.due_date < new Date().toISOString().slice(0, 10)).length;
  return <div>
    <PageHeader eyebrow="CLINICAL / RECALLS" title="召回与复查" description="参考 OpenDental Recall List：把到期未预约、已预约和已完成患者放进同一张召回清单。" />
    <div className="clinical-kpis">
      <div><span>当前清单</span><strong>{items?.length || 0}</strong></div>
      <div><span>逾期</span><strong>{overdue}</strong></div>
      <div><span>待安排</span><strong>{(items || []).filter((r) => r.status === 'DUE').length}</strong></div>
      <div><span>已完成</span><strong>{(items || []).filter((r) => r.status === 'COMPLETED').length}</strong></div>
    </div>
    <Card>
      <div className="pipeline-tabs"><button className={tab === 'overdue' ? 'active' : ''} onClick={() => setTab('overdue')}>逾期待召回</button><button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>全部召回</button></div>
      {!items ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : !items.length ? <Empty title="暂无召回任务" description="在患者临床档案中创建复查计划。" /> : <div className="recall-page-list">
        {items.map((r) => <div className="recall-page-row" key={r.recall_id}>
          <div className={'recall-dot ' + (r.status === 'DUE' ? 'due' : '')} />
          <div className="recall-person"><strong>{r.patient_name}</strong><small>{r.patient_no} · {r.phone}</small></div>
          <div className="recall-type"><Bell size={14} />{TYPE[r.recall_type]}</div>
          <div className="recall-date"><CalendarClock size={14} />{dateOnly(r.due_date)}</div>
          <Badge value={r.status}>{STATUS[r.status]}</Badge>
          <div className="recall-page-actions">
            <Link className="text-link" to={'/patients/' + r.patient_id}>档案</Link>
            {r.status !== 'COMPLETED' && <Button size="xs" variant="ghost" onClick={() => update(r, 'COMPLETED')}><CheckCircle2 size={14} />完成</Button>}
          </div>
        </div>)}
      </div>}
    </Card>
  </div>;
}
