const app = getApp();
const { call } = require('../../utils/api');
const { timeLabel } = require('../../utils/format');

function buildDates() {
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  const rows = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(Date.now() + (i + 1) * 86400000 + 8 * 3600000);
    const date = d.toISOString().slice(0, 10);
    rows.push({ date, week: '周' + week[d.getUTCDay()], day: date.slice(8) });
  }
  return rows;
}

Page({
  data: {
    loading: true, error: '',
    clinics: [], clinicIndex: 0,
    departments: [], departmentIndex: 0,
    dentists: [], dentistIndex: -1,
    dates: [], date: '', slots: [], selectedIndex: -1,
    expectedTreatment: '口腔检查', saving: false, deposit: '0.00'
  },
  onShow() { this.init(); },
  async init() {
    try {
      const session = await app.ensureSession();
      if (!session.user) { wx.reLaunch({ url: '/pages/login/login' }); return; }
      if (session.user.staff) { app.logout(); wx.reLaunch({ url: '/pages/login/login' }); return; }
      const [clinics, departments] = await Promise.all([call('listClinics'), call('listDepartments')]);
      const enabled = clinics.findIndex((c) => c.patientBookingEnabled);
      const clinicIndex = enabled >= 0 ? enabled : 0;
      const dates = buildDates();
      this.setData({
        clinics, clinicIndex, departments, departmentIndex: 0,
        dates, date: dates[0].date, loading: false,
        deposit: clinics[clinicIndex] ? clinics[clinicIndex].deposit : '0.00'
      });
      if (clinics[clinicIndex] && departments[0]) await this.loadDentists();
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  async loadDentists() {
    const clinic = this.data.clinics[this.data.clinicIndex];
    const department = this.data.departments[this.data.departmentIndex];
    if (!clinic || !department) return;
    try {
      const dentists = await call('listDentists', { clinicId: clinic.id, departmentId: department.code });
      this.setData({ dentists, dentistIndex: dentists.length ? 0 : -1, slots: [], selectedIndex: -1 });
      if (dentists.length) await this.loadSlots();
    } catch (error) { this.setData({ dentists: [], dentistIndex: -1, error: error.message }); }
  },
  clinicChange(event) {
    const clinicIndex = Number(event.detail.value);
    this.setData({ clinicIndex, deposit: this.data.clinics[clinicIndex].deposit, dentists: [], dentistIndex: -1, slots: [], selectedIndex: -1 });
    this.loadDentists();
  },
  selectDepartment(event) {
    const departmentIndex = Number(event.currentTarget.dataset.index);
    this.setData({ departmentIndex, dentists: [], dentistIndex: -1, slots: [], selectedIndex: -1 });
    this.loadDentists();
  },
  selectDoctor(event) {
    this.setData({ dentistIndex: Number(event.currentTarget.dataset.index), slots: [], selectedIndex: -1 });
    this.loadSlots();
  },
  selectDate(event) { this.setData({ date: event.currentTarget.dataset.date, slots: [], selectedIndex: -1 }); this.loadSlots(); },
  async loadSlots() {
    const clinic = this.data.clinics[this.data.clinicIndex];
    const dentist = this.data.dentists[this.data.dentistIndex];
    if (!clinic || !dentist) return;
    try {
      const result = await call('availability', { clinicId: clinic.id, date: this.data.date, dentistId: dentist.id });
      const slots = (result.slots || []).map((s) => ({ ...s, label: timeLabel(s.startMinute), endLabel: timeLabel(s.endMinute) }));
      this.setData({ slots, selectedIndex: -1 });
    } catch (error) { this.setData({ slots: [], error: error.message }); }
  },
  selectSlot(event) { this.setData({ selectedIndex: Number(event.currentTarget.dataset.index) }); },
  inputTreatment(event) { this.setData({ expectedTreatment: event.detail.value }); },
  async submit() {
    const clinic = this.data.clinics[this.data.clinicIndex];
    const dentist = this.data.dentists[this.data.dentistIndex];
    const slot = this.data.slots[this.data.selectedIndex];
    if (!clinic) return wx.showToast({ title: '请选择诊所', icon: 'none' });
    if (!dentist) return wx.showToast({ title: '请选择医生', icon: 'none' });
    if (!slot) return wx.showToast({ title: '请选择时段', icon: 'none' });
    if (!this.data.expectedTreatment.trim()) return wx.showToast({ title: '请填写就诊需求', icon: 'none' });
    this.setData({ saving: true });
    try {
      const result = await call('createAppointment', {
        clinicId: clinic.id, dentistId: dentist.id,
        departmentId: (this.data.departments[this.data.departmentIndex] || {}).id || '',
        date: this.data.date,
        startMinute: slot.startMinute, durationMinutes: slot.durationMinutes,
        expectedTreatment: this.data.expectedTreatment.trim()
      });
      wx.showToast({ title: '预约已占位', icon: 'success' });
      setTimeout(() => wx.navigateTo({ url: '/pages/payments/payments?focus=' + result.order._id }), 500);
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  }
});
