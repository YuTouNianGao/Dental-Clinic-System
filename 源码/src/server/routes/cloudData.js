import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { cloudAction, cloudConfigured, cloudOverview } from '../cloudBridge.js';
import { syncSchedulesToCloud } from '../cloudSync.js';

const router = Router();

router.get('/overview', asyncHandler(async (req, res) => {
  if (!cloudConfigured()) return res.status(503).json({ error: { code: 'CLOUD_NOT_CONFIGURED', message: '云开发同步未配置' } });
  res.json(await cloudOverview(req.query.refresh === '1'));
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  if (!cloudConfigured()) return res.status(503).json({ error: { code: 'CLOUD_NOT_CONFIGURED', message: '云开发同步未配置' } });
  res.json(await cloudOverview(true));
}));

router.post('/sync-schedules', asyncHandler(async (req, res) => {
  if (!cloudConfigured()) return res.status(503).json({ error: { code: 'CLOUD_NOT_CONFIGURED', message: '云开发同步未配置' } });
  const result = await syncSchedulesToCloud();
  if (!result?.ok) throw new Error(result?.message || '排班同步失败');
  res.json(result);
}));

router.patch('/appointments/:id/status', asyncHandler(async (req, res) => {
  if (!cloudConfigured()) return res.status(503).json({ error: { code: 'CLOUD_NOT_CONFIGURED', message: '云开发同步未配置' } });
  const result = await cloudAction('updateAppointmentStatus', { id: req.params.id, status: req.body.status });
  if (!result?.ok) throw new Error(result?.message || '预约状态更新失败');
  res.json(result);
}));

export default router;
