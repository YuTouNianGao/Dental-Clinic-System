const app = getApp();
const { call } = require('../../utils/api');
const { money, dateLabel, statusLabel, dateTimeLabel } = require('../../utils/format');

Page({
  data: { loading: true, error: '', user: null, patient: null, home: null },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()); },
  async load(refresh = false) {
    this.setData({ loading: true, error: '' });
    try {
      const session = await app.ensureSession(refresh);
      const user = session.user;
      if (!user) { wx.reLaunch({ url: '/pages/login/login' }); return; }
      if (user.staff) {
        app.logout();
        wx.reLaunch({ url: '/pages/login/login' });
        return;
      }
      const home = await call('home');
      const mapped = this.mapHome(home);
      this.setData({ loading: false, user, patient: session.patient || home.patient || null, home: mapped });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '加载失败' });
    }
  },
  mapHome(home) {
    const orders = (home.orders || []).map((o) => ({ ...o, amountLabel: money(o.amountCents), statusLabel: statusLabel(o.status) }));
    const appointments = (home.appointments || []).map((a) => ({ ...a, timeLabel: dateLabel(a.date, a.startMinute, a.endMinute), statusLabel: statusLabel(a.status) }));
    const pendingOrders = orders.filter((o) => ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'REFUNDING'].includes(o.status));
    const nextAppointment = appointments.find((a) => a.status === 'SCHEDULED' || a.status === 'PENDING_PAYMENT') || null;
    if (nextAppointment) {
      const parts = nextAppointment.date.split('-');
      const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const d = new Date(`${nextAppointment.date}T00:00:00+08:00`);
      nextAppointment.dateBadge = `${parts[1]}.${parts[2]}`;
      nextAppointment.weekday = week[d.getDay()];
    }
    return {
      ...home,
      appointments,
      orders,
      pendingOrders,
      nextAppointment,
      upcomingCount: appointments.filter((a) => a.status === 'SCHEDULED' || a.status === 'PENDING_PAYMENT').length,
      unreadCount: (home.notifications || []).filter((n) => !n.readAt).length,
      notifications: (home.notifications || []).map((n) => ({ ...n, timeLabel: dateTimeLabel(n.createdAt) })),
      visits: (home.visits || []).map((v) => ({ ...v, timeLabel: v.visitDate }))
    };
  },
  goBooking() { wx.navigateTo({ url: '/pages/booking/booking' }); },
  goAppointments() { wx.switchTab({ url: '/pages/appointments/appointments' }); },
  goPayments() { wx.navigateTo({ url: '/pages/payments/payments' }); },
  goRecords() { wx.switchTab({ url: '/pages/records/records' }); },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },
  goRefunds() { wx.navigateTo({ url: '/pages/refunds/refunds' }); },
  goClinics() { wx.navigateTo({ url: '/pages/clinics/clinics' }); },
  goBinding() { wx.navigateTo({ url: '/pages/binding/binding' }); },
  goDetail(event) { wx.navigateTo({ url: '/pages/appointments/detail?id=' + event.currentTarget.dataset.id }); }
});
