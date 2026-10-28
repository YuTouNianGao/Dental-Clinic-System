const { call } = require('../../utils/api');

Page({
  data: {
    name: '', genderIndex: 0, genders: ['男', '女', '其他'],
    age: '', phone: '', password: '', confirm: '', loading: false, error: ''
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  genderChange(event) { this.setData({ genderIndex: Number(event.detail.value) }); },
  async submit() {
    const name = this.data.name.trim();
    const ageText = String(this.data.age).trim();
    const age = Number(ageText);
    const phone = this.data.phone.trim();
    if (name.length < 2) return wx.showToast({ title: '请填写真实姓名', icon: 'none' });
    if (!ageText || !Number.isInteger(age) || age < 0 || age > 120) return wx.showToast({ title: '年龄需在 0-120 之间', icon: 'none' });
    if (!/^\d{6,20}$/.test(phone)) return wx.showToast({ title: '请输入有效手机号', icon: 'none' });
    if (this.data.password.length < 6) return wx.showToast({ title: '密码至少 6 位', icon: 'none' });
    if (this.data.password !== this.data.confirm) return wx.showToast({ title: '两次密码不一致', icon: 'none' });
    this.setData({ loading: true, error: '' });
    try {
      const result = await call('registerPatient', {
        data: {
          name, age, phone, gender: ['MALE', 'FEMALE', 'OTHER'][this.data.genderIndex],
          password: this.data.password
        }
      });
      wx.setStorageSync('adc_last_account', result.account);
      wx.showModal({
        title: '注册成功',
        content: `患者账号：${result.account}\n患者编号：${result.patientNo}\n\n请用账号和密码登录。`,
        showCancel: false,
        success: () => wx.navigateBack()
      });
    } catch (error) { this.setData({ error: error.message || '注册失败' }); }
    finally { this.setData({ loading: false }); }
  }
});
