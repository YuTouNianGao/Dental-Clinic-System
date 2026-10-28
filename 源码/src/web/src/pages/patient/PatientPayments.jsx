import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, WalletCards } from 'lucide-react';
import { api, dateTime, money } from '../../lib/api.js';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Table } from '../../components/ui.jsx';

export default function PatientPayments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = () => { setLoading(true); api('/patient/payment-orders').then((d) => setItems(d.items)).catch(setError).finally(() => setLoading(false)); };
  useEffect(load, []);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  return <div>
    <PageHeader eyebrow="PAYMENTS" title="支付订单" description="预约金与诊后余额订单；模拟支付结果仅代表业务流程测试，不代表真实资金到账。" />
    {!items.length ? <Card><Empty title="暂无支付订单" description="患者自助预约后会生成预约金订单；结算后会生成诊后余额订单。" /></Card> : <Card>
      <Table><thead><tr><th>订单</th><th>类型 / 金额</th><th>状态</th><th>到期/时间</th><th></th></tr></thead><tbody>
        {items.map((o) => <tr key={o.order_id}>
          <td><strong>{o.order_no}</strong><small className="block">{o.description || ''}</small></td>
          <td>{o.order_type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额'}<small className="block">{money(o.amount)}</small></td>
          <td><Badge value={o.status} />{o.amount_refund_reserved > 0 && <small className="block">退款处理中，资金已预留</small>}</td>
          <td>{o.expires_at ? dateTime(o.expires_at) : dateTime(o.created_at)}</td>
          <td><div className="row-actions"><Link className="text-link" to={`/portal/payments/${o.order_id}`}><CreditCard size={14} />详情</Link>{['PENDING_PAYMENT', 'PARTIALLY_PAID'].includes(o.status) && <Link className="text-link" to={`/portal/payments/${o.order_id}`}><WalletCards size={14} />支付</Link>}</div></td>
        </tr>)}
      </tbody></Table>
    </Card>}
  </div>;
}
