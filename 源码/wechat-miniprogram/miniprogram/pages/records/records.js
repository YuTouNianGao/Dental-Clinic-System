const app = getApp();
const { call } = require('../../utils/api');
const { money, statusLabel, dateTimeLabel } = require('../../utils/format');

Page({
  data: { loading: true, error: '', visits: [], settlements: [], orders: [] },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await app.ensureSession();
      if (!session.user) { wx.reLaunch({ url: '/pages/login/login' }); return; }
      if (session.user.staff) { app.logout(); wx.reLaunch({ url: '/pages/login/login' }); return; }
      const [visits, settlements, orders] = await Promise.all([call('listVisits'), call('listSettlements'), call('listOrders')]);
      this.setData({
        loading: false,
        visits: (visits || []).map((v) => ({ ...v, amountLabel: money(v.treatmentAmountCents), statusLabel: statusLabel(v.status) })),
        settlements: (settlements || []).map((s) => ({ ...s, amountLabel: money(s.totalCents), statusLabel: statusLabel(s.status), timeLabel: dateTimeLabel(s.createdAt) })),
        orders: (orders || []).map((o) => ({
          ...o,
          typeLabel: o.type === 'APPOINTMENT_DEPOSIT' ? '预约金' : '诊后余额',
          amountLabel: money(o.amountCents),
          statusLabel: statusLabel(o.status),
          timeLabel: dateTimeLabel(o.createdAt)
        }))
      });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  }
});
