const app = getApp();
const { call } = require('../../utils/api');
const { dateTimeLabel } = require('../../utils/format');

Page({
  data: { loading: true, error: '', name: '', phone: '', binding: null, saving: false },
  onShow() { this.load(); },
  async load() {
    try {
      await app.ensureSession();
      const binding = await call('getBinding');
      if (binding && binding.status === 'APPROVED') await app.ensureSession(true);
      this.setData({ loading: false, binding: binding ? { ...binding, timeLabel: dateTimeLabel(binding.createdAt) } : null });
      if (binding && binding.status === 'REJECTED') this.setData({ name: binding.patientName || '', phone: binding.phone || '' });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  async submit() {
    if (!this.data.name.trim() || !this.data.phone.trim()) return wx.showToast({ title: '请填写姓名和手机号', icon: 'none' });
    this.setData({ saving: true });
    try {
      await call('requestBinding', { name: this.data.name.trim(), phone: this.data.phone.trim() });
      wx.showToast({ title: '已提交，等待审核', icon: 'success' });
      this.load();
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  }
});
