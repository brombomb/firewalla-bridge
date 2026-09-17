import { Router } from 'express';
import { refreshCache } from '../client/firewalla.js';
import { getInitData } from '../client/cache.js';

const router = Router();

// GET /v2/speedtest
router.get('/v2/speedtest', async (req, res) => {
  await refreshCache();
  const initData = getInitData();
  const history = initData.internetSpeedtestResults || [];

  const latest = history.length > 0 ? history[0] : null;

  if (!latest) {
    return res.json({
      available: false,
      message: 'No speed test results available yet.',
      latest: null,
    });
  }

  const result = {
    available: true,
    latest: {
      timestamp: Math.floor(parseFloat(latest.timestamp || 0)),
      downloadMbps: Math.round(((latest.result && latest.result.download) || 0) * 10) / 10,
      uploadMbps: Math.round(((latest.result && latest.result.upload) || 0) * 10) / 10,
      latencyMs: Math.round(((latest.result && latest.result.latency) || 0) * 10) / 10,
      jitterMs: Math.round(((latest.result && latest.result.jitter) || 0) * 10) / 10,
      packetLoss: (latest.result && latest.result.ploss) || 0,
      isp: (latest.client && latest.client.isp) || '',
      publicIp: (latest.client && latest.client.publicIp) || '',
      server: (latest.server && `${latest.server.sponsor || ''} (${latest.server.location || ''})`.trim()) || '',
    },
  };

  if (req.query.history === 'true') {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    result.history = history.slice(0, limit).map((h) => ({
      timestamp: Math.floor(parseFloat(h.timestamp || 0)),
      downloadMbps: Math.round(((h.result && h.result.download) || 0) * 10) / 10,
      uploadMbps: Math.round(((h.result && h.result.upload) || 0) * 10) / 10,
      latencyMs: Math.round(((h.result && h.result.latency) || 0) * 10) / 10,
    }));
  }

  res.json(result);
});

export default router;
