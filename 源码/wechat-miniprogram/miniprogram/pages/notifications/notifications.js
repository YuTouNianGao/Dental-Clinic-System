const { call } = require('../../utils/api');
const { dateTimeLabel } = require('../../utils/format');

Page({
  data: { loading: true, error: '', items: [] },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const items = await call('listNotifications');
      this.setData({ loading: false, items: (items || []).map((n) => ({ ...n, timeLabel: dateTimeLabel(n.createdAt) })) });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  async read(event) {
    const item = this.data.items[event.currentTarget.dataset.index];
    if (item.readAt) return;
    try { await call('readNotification', { notificationId: item._id }); this.load(); }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  }
});
