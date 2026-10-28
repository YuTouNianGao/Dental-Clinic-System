function money(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function dateLabel(date, startMinute, endMinute) {
  if (!date) return '';
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const d = new Date(`${date}T00:00:00+08:00`);
  return `${date.slice(5)} ${week[d.getDay()]} ${timeLabel(startMinute)}-${timeLabel(endMinute)}`;
}

function timeLabel(minute) {
  const m = Number(minute || 0);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function dateTimeLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

const statusText = {
  PENDING_PAYMENT: '待支付', SCHEDULED: '已确认', ATTENDED: '已到诊', NO_SHOW: '未到诊',
  CANCELLED: '已取消', EXPIRED: '已过期', PAID: '已支付', PARTIALLY_PAID: '部分支付',
  CLOSED: '已关闭', FORFEITED: '已没收', REFUNDING: '退款处理中', REFUNDED: '已退款',
  PENDING_REVIEW: '待审核', APPROVED: '已通过', REJECTED: '已驳回', NEEDS_INFO: '待补资料',
  PROCESSING: '处理中', SUCCEEDED: '已完成', FAILED: '失败', ACTIVE: '有效', VOID: '已作废',
  RECORDED: '已登记', CONFIRMED: '已确认'
};

function statusLabel(status) { return statusText[status] || status || '—'; }

module.exports = { money, dateLabel, timeLabel, dateTimeLabel, statusLabel };
