const app = getApp();
const { call } = require('../../utils/api');

Page({
  data: { loading: true, error: '', clinics: [], dentists: [] },
  onShow() { this.load(); },
  async load() {
    try {
      await app.ensureSession();
      const clinics = await call('listClinics');
      const dentists = await call('listDentists');
      const mapped = dentists.map((d) => ({ ...d, clinicName: (clinics.find((c) => c.id === d.clinicId) || {}).name || '', initial: String(d.name || '医').slice(0, 1) }));
      this.setData({ loading: false, clinics, dentists: mapped });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  goBooking() { wx.navigateTo({ url: '/pages/booking/booking' }); }
});
