function call(action, data = {}) {
  const token = wx.getStorageSync('adc_token') || '';
  return wx.cloud.callFunction({
    name: 'api',
    data: { action, token, ...data }
  }).then((res) => {
    const payload = res.result || {};
    if (!payload.ok) {
      const error = new Error(payload.message || '请求失败');
      error.code = payload.code || 'ERROR';
      throw error;
    }
    return payload.data;
  });
}

module.exports = { call };
