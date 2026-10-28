const app = getApp();
const { call } = require('../../utils/api');

Page({
  data: { account: '', password: '', loading: false, error: '' },
  onShow() {
    const last = wx.getStorageSync('adc_last_account');
    if (last && !this.data.account) this.setData({ account: last });
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  goRegister() { wx.navigateTo({ url: '/pages/register/register' }); },
  async patientLogin() {
    if (!this.data.account.trim() || !this.data.password) return wx.showToast({ title: '请输入患者账号和密码', icon: 'none' });
    this.setData({ loading: true, error: '' });
    try {
      const result = await call('loginPatient', { account: this.data.account.trim(), password: this.data.password });
      app.setPatientSession(result.user, result.patient, result.token);
      wx.switchTab({ url: '/pages/home/home' });
    } catch (error) { this.setData({ error: error.message || '登录失败' }); }
    finally { this.setData({ loading: false }); }
  }
});
