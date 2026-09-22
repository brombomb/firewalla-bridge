import { Router } from 'express';
import { refreshCache } from '../client/firewalla.js';
import { getInitData, getHostList } from '../client/cache.js';
import { calculateBandwidthSummary, formatBandwidthHistory } from '../utils/bandwidth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /v2/bandwidth: Current throughput rate, last 60-minute totals, and monthly data usage
router.get('/v2/bandwidth', asyncHandler(async (req, res) => {
  await refreshCache();
  const initData = getInitData();
  const hosts = getHostList();

  const summary = calculateBandwidthSummary(initData, hosts);

  if (req.query.history === 'true' || req.query.includeHistory === 'true') {
    summary.history = formatBandwidthHistory(initData);
  }

  res.json(summary);
}));

// GET /v2/bandwidth/history: 60-minute historical bandwidth buckets (1-minute resolution)
router.get('/v2/bandwidth/history', asyncHandler(async (req, res) => {
  await refreshCache();
  const initData = getInitData();
  res.json(formatBandwidthHistory(initData));
}));

// GET /v2/trends/bandwidth: Alias matching MSP trend conventions (/v2/trends/*)
router.get('/v2/trends/bandwidth', asyncHandler(async (req, res) => {
  await refreshCache();
  const initData = getInitData();
  res.json(formatBandwidthHistory(initData));
}));

export default router;
