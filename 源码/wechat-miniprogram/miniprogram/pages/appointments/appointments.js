const app = getApp();
const { call } = require('../../utils/api');
const { dateLabel, statusLabel } = require('../../utils/format');

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING_PAYMENT', label: '待支付' },
  { key: 'SCHEDULED', label: '已确认' },
  { key: 'ATTENDED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' }
];

Page({
  data: { loading: true, error: '', allItems: [], items: [], filters: FILTERS, filter: 'ALL' },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await app.ensureSession();
      if (!session.user) { wx.reLaunch({ url: '/pages/login/login' }); return; }
      if (session.user.staff) { app.logout(); wx.reLaunch({ url: '/pages/login/login' }); return; }
      const rows = await call('listAppointments');
      const allItems = (rows || []).map((a) => ({
        ...a,
        timeLabel: dateLabel(a.date, a.startMinute, a.endMinute),
        statusLabel: statusLabel(a.status)
      }));
      this.setData({ loading: false, allItems });
      this.applyFilter(this.data.filter, allItems);
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  applyFilter(filter, source) {
    const all = source || this.data.allItems;
    const items = filter === 'ALL' ? all : all.filter((a) => a.status === filter);
    this.setData({ filter, items });
  },
  setFilter(event) { this.applyFilter(event.currentTarget.dataset.key); },
  goBooking() { wx.navigateTo({ url: '/pages/booking/booking' }); },
  openDetail(event) { wx.navigateTo({ url: '/pages/appointments/detail?id=' + event.currentTarget.dataset.id }); },
  findItem(id) { return this.data.allItems.find((a) => a.id === id); },
  async cancel(event) {
    const item = this.findItem(event.currentTarget.dataset.id);
    wx.showModal({ title: '取消预约', editable: true, placeholderText: '请填写取消原因', success: async (res) => {
      if (!res.confirm) return;
      try {
        const result = await call('cancelAppointment', { appointmentId: item.id, reason: res.content || '患者取消' });
        wx.showToast({ title: result.refund ? '已提交退款申请' : '预约已取消', icon: 'none' });
        this.load();
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    }});
  },
  async pay(event) {
    const item = this.findItem(event.currentTarget.dataset.id);
    if (!item.depositOrderId) return wx.showToast({ title: '该预约没有预约金订单', icon: 'none' });
    wx.showActionSheet({ itemList: ['模拟支付成功', '模拟支付失败'], success: async (res) => {
      try {
        await call('payOrder', { orderId: item.depositOrderId, outcome: res.tapIndex === 0 ? 'SUCCESS' : 'FAILURE' });
        wx.showToast({ title: res.tapIndex === 0 ? '支付成功，预约已确认' : '模拟支付失败', icon: 'none' });
        this.load();
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    }});
  }
});
