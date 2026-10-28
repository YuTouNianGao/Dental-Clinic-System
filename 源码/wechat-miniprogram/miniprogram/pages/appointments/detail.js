const app = getApp();
const { call } = require('../../utils/api');
const { money, dateLabel, statusLabel, dateTimeLabel } = require('../../utils/format');

Page({
  data: { loading: true, error: '', id: '', detail: null, order: null, changes: [] },
  onLoad(options) { this.setData({ id: options.id || '' }); },
  onShow() { this.load(); },
  async load() {
    if (!this.data.id) return;
    this.setData({ loading: true, error: '' });
    try {
      const session = await app.ensureSession();
      if (!session.user) { wx.reLaunch({ url: '/pages/login/login' }); return; }
      if (session.user.staff) { app.logout(); wx.reLaunch({ url: '/pages/login/login' }); return; }
      const detail = await call('getAppointment', { appointmentId: this.data.id });
      const appt = { ...detail.appointment, timeLabel: dateLabel(detail.appointment.date, detail.appointment.startMinute, detail.appointment.endMinute), statusLabel: statusLabel(detail.appointment.status) };
      const order = (detail.orders || [])[0] || null;
      this.setData({
        loading: false, detail: { ...detail, appointment: appt },
        order: order ? { ...order, amountLabel: money(order.amountCents), statusLabel: statusLabel(order.status), timeLabel: dateTimeLabel(order.createdAt) } : null,
        changes: (detail.changes || []).map((c) => ({ ...c, timeLabel: dateTimeLabel(c.createdAt), typeLabel: c.type === 'CANCEL' ? '取消预约' : '预约变更' }))
      });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  async pay() {
    if (!this.data.order) return;
    wx.showActionSheet({ itemList: ['模拟支付成功', '模拟支付失败'], success: async (res) => {
      try {
        await call('payOrder', { orderId: this.data.order.id, outcome: res.tapIndex === 0 ? 'SUCCESS' : 'FAILURE' });
        wx.showToast({ title: res.tapIndex === 0 ? '支付成功' : '模拟失败', icon: 'none' });
        this.load();
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    }});
  },
  async cancel() {
    wx.showModal({ title: '取消预约', editable: true, placeholderText: '请填写取消原因', success: async (res) => {
      if (!res.confirm) return;
      try {
        const result = await call('cancelAppointment', { appointmentId: this.data.id, reason: res.content || '患者取消' });
        wx.showToast({ title: result.refund ? '已提交退款申请' : '预约已取消', icon: 'none' });
        this.load();
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    }});
  },
  goBooking() { wx.navigateTo({ url: '/pages/booking/booking' }); }
});
