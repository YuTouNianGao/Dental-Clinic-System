import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { cloudConfigured, cloudOverview } from '../cloudBridge.js';

const router = Router();

router.get('/overview', asyncHandler(async (req, res) => {
  if (!cloudConfigured()) return res.status(503).json({ error: { code: 'CLOUD_NOT_CONFIGURED', message: '云开发同步未配置' } });
  res.json(await cloudOverview(req.query.refresh === '1'));
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  if (!cloudConfigured()) return res.status(503).json({ error: { code: 'CLOUD_NOT_CONFIGURED', message: '云开发同步未配置' } });
  res.json(await cloudOverview(true));
}));

export default router;
