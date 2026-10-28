const app = getApp();
const { call } = require('../../utils/api');
const { money, statusLabel, dateTimeLabel } = require('../../utils/format');

Page({
  data: { loading: true, error: '', items: [] },
  onShow() { this.load(); },
  async load() {
    try {
      await app.ensureSession();
      const rows = await call('listRefunds');
      this.setData({ loading: false, items: (rows || []).map((r) => ({ ...r, amountLabel: money(r.amountCents), statusLabel: statusLabel(r.status), timeLabel: dateTimeLabel(r.createdAt) })) });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  }
});
