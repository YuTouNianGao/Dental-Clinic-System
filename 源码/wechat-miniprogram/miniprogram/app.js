const ENV_ID = 'cloud1-d5gcycdmec1eb570f';

function readToken() {
  return wx.getStorageSync('adc_token') || '';
}

App({
  globalData: {
    envId: ENV_ID,
    user: null,
    patient: null,
    sessionReady: false
  },
  _sessionPromise: null,

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库以使用云能力');
      return;
    }
    wx.cloud.init({ env: ENV_ID, traceUser: true });
  },

  ensureSession(force = false) {
    if (this.globalData.sessionReady && !force) {
      return Promise.resolve({ user: this.globalData.user, patient: this.globalData.patient });
    }
    if (this._sessionPromise && !force) return this._sessionPromise;
    const token = readToken();
    this._sessionPromise = wx.cloud.callFunction({
      name: 'api',
      data: { action: 'bootstrap', token }
    }).then((res) => {
      const payload = res.result || {};
      if (!payload.ok) throw new Error(payload.message || '登录状态初始化失败');
      const data = payload.data || {};
      this.globalData.user = data.user || null;
      this.globalData.patient = data.patient || null;
      this.globalData.sessionReady = true;
      if (data.token) wx.setStorageSync('adc_token', data.token);
      return data;
    }).catch((error) => {
      this._sessionPromise = null;
      throw error;
    });
    return this._sessionPromise;
  },

  setPatientSession(user, patient, token) {
    if (token) wx.setStorageSync('adc_token', token);
    this.globalData.user = user;
    this.globalData.patient = patient || null;
    this.globalData.sessionReady = true;
    this._sessionPromise = null;
  },

  logout() {
    wx.removeStorageSync('adc_token');
    this.globalData.user = null;
    this.globalData.patient = null;
    this.globalData.sessionReady = false;
    this._sessionPromise = null;
  }
});
