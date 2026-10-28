const app = getApp();
const { call } = require('../../utils/api');

Page({
  data: { loading: true, error: '', user: null, patient: null, genderLabel: '', form: { phone: '', email: '', billingAddress: '' }, saving: false },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await app.ensureSession();
      if (!session.user || session.user.staff) {
        if (session.user && session.user.staff) app.logout();
        wx.reLaunch({ url: '/pages/login/login' });
        return;
      }
      const patient = session.patient || null;
      const genderLabel = patient ? ({ MALE: '男', FEMALE: '女', OTHER: '其他' }[patient.gender] || '未填写') : '';
      this.setData({
        loading: false, user: session.user, patient, genderLabel,
        form: {
          phone: patient ? patient.phone || '' : '',
          email: patient ? patient.email || '' : '',
          billingAddress: patient ? patient.billingAddress || '' : ''
        }
      });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  input(event) { this.setData({ ['form.' + event.currentTarget.dataset.field]: event.detail.value }); },
  async save() {
    this.setData({ saving: true });
    try {
      await call('updateProfile', { data: this.data.form });
      wx.showToast({ title: '资料已更新', icon: 'success' });
      this.load();
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },
  goRefunds() { wx.navigateTo({ url: '/pages/refunds/refunds' }); },
  goBinding() { wx.navigateTo({ url: '/pages/binding/binding' }); },
  goClinics() { wx.navigateTo({ url: '/pages/clinics/clinics' }); },
  logout() {
    wx.showModal({ title: '退出登录', content: '退出当前患者账号？', success: async (res) => {
      if (!res.confirm) return;
      try { await call('logoutStaff'); } catch (e) {}
      app.logout();
      wx.reLaunch({ url: '/pages/login/login' });
    }});
  }
});
