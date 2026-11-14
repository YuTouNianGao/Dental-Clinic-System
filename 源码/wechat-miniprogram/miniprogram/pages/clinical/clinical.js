const app = getApp();
const { call } = require('../../utils/api');
const { money } = require('../../utils/format');

const UPPER = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
const LOWER = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];
const CONDITION = {
  HEALTHY: { label: '健康', cls: 'healthy' }, CARIES: { label: '龋坏', cls: 'caries' },
  FILLING: { label: '已充填', cls: 'filling' }, CROWN: { label: '牙冠', cls: 'crown' },
  ROOT_CANAL: { label: '根管', cls: 'root' }, IMPLANT: { label: '种植', cls: 'implant' },
  MISSING: { label: '缺失', cls: 'missing' }, FRACTURE: { label: '牙折', cls: 'fracture' },
  SENSITIVE: { label: '敏感', cls: 'sensitive' }
};
const PLAN_STATUS = { DRAFT: '草稿', PRESENTED: '待确认', ACCEPTED: '已接受', IN_PROGRESS: '进行中', COMPLETED: '已完成', DECLINED: '已拒绝' };
const ITEM_STATUS = { PLANNED: '待安排', SCHEDULED: '已预约', COMPLETED: '已完成', DECLINED: '已放弃' };
const RECALL_TYPE = { EXAM: '检查', CLEANING: '洁牙', PERIO: '牙周', ORTHO: '正畸' };
const RECALL_STATUS = { DUE: '待安排', SCHEDULED: '已预约', COMPLETED: '已完成', DISMISSED: '已忽略' };

Page({
  data: {
    loading: true, error: '', tab: 'plans', plans: [], upper: [], lower: [], recalls: [],
    completed: 0, activePlans: 0, toothCount: 0, conditionLegend: Object.entries(CONDITION).map(([key, v]) => ({ key, ...v }))
  },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await app.ensureSession();
      if (!session.user) { wx.reLaunch({ url: '/pages/login/login' }); return; }
      if (session.user.staff) { app.logout(); wx.reLaunch({ url: '/pages/login/login' }); return; }
      const data = await call('clinical');
      const teeth = {};
      for (const t of data.teeth || []) teeth[t.toothNo] = t;
      const mapTooth = (no) => {
        const t = teeth[no] || { conditionCode: 'HEALTHY' };
        const meta = CONDITION[t.conditionCode] || CONDITION.HEALTHY;
        return { no, code: t.conditionCode, label: meta.label, cls: meta.cls, note: t.note || '' };
      };
      const plans = (data.plans || []).map((p) => ({
        ...p,
        statusLabel: PLAN_STATUS[p.status] || p.status,
        progress: p.itemCount ? Math.round(p.completedCount / p.itemCount * 100) : 0,
        amountLabel: money(p.totalCents),
        items: (p.items || []).map((i) => ({ ...i, statusLabel: ITEM_STATUS[i.status] || i.status, amountLabel: money(i.unitPriceCents * i.quantity) }))
      }));
      this.setData({
        loading: false, plans, upper: UPPER.map(mapTooth), lower: LOWER.map(mapTooth), recalls: data.recalls || [],
        completed: plans.reduce((n, p) => n + p.completedCount, 0),
        activePlans: plans.filter((p) => !['COMPLETED', 'DECLINED'].includes(p.status)).length,
        toothCount: data.teeth.length
      });
    } catch (error) { this.setData({ loading: false, error: error.message || '加载失败' }); }
  },
  setTab(event) { this.setData({ tab: event.currentTarget.dataset.tab }); },
  async accept(event) {
    const plan = this.data.plans.find((p) => p.id === event.currentTarget.dataset.id);
    if (!plan) return;
    wx.showModal({ title: '确认治疗计划', content: '确认接受《' + plan.title + '》？确认后诊所会据此安排后续预约。', success: async (res) => {
      if (!res.confirm) return;
      try { await call('acceptTreatmentPlan', { planId: plan.id }); wx.showToast({ title: '已确认，请等待诊所安排', icon: 'none' }); this.load(); }
      catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    }});
  },
  goBooking() { wx.navigateTo({ url: '/pages/booking/booking' }); },
  goMessages() { wx.navigateTo({ url: '/pages/notifications/notifications' }); }
});
