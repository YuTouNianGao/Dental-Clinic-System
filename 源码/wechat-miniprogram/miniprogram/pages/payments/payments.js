const app = getApp();
const { call } = require('../../utils/api');
const { money, statusLabel, dateTimeLabel } = require('../../utils/format');

Page({
  data: { loading: true, error: '', items: [] },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await app.ensureSession();
      if (!session.user) { wx.reLaunch({ url: '/pages/login/login' }); return; }
      if (session.user.staff) { app.logout(); wx.reLaunch({ url: '/pages/login/login' }); return; }
      const rows = await call('listOrders');
      const items = (rows || []).map((o) => ({
        ...o,
        amountLabel: money(o.amountCents),
        statusLabel: statusLabel(o.status),
        typeLabel: o.type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额',
        timeLabel: dateTimeLabel(o.createdAt)
      }));
      this.setData({ loading: false, items });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  goRefunds() { wx.navigateTo({ url: '/pages/refunds/refunds' }); },
  async pay(event) {
    const order = this.data.items[event.currentTarget.dataset.index];
    wx.showActionSheet({ itemList: ['模拟支付成功', '模拟支付失败'], success: async (res) => {
      try {
        await call('payOrder', { orderId: order.id, outcome: res.tapIndex === 0 ? 'SUCCESS' : 'FAILURE' });
        wx.showToast({ title: res.tapIndex === 0 ? '支付成功' : '模拟失败', icon: 'none' });
        this.load();
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    }});
  }
});
