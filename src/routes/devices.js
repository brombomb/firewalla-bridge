import { Router } from 'express';
import { refreshCache } from '../client/firewalla.js';
import { getHostList } from '../client/cache.js';
import { getMergeRule } from '../utils/merge.js';

const router = Router();

// GET /v2/devices (matches MSP /v2/devices)
router.get('/v2/devices', async (req, res) => {
  await refreshCache();
  const hosts = getHostList();

  const devMap = new Map();
  for (const h of hosts) {
    const rawId = (h.mac || h.devId || h.ip || '').toLowerCase();
    const mergeRule = getMergeRule(rawId) || (h.ip ? getMergeRule(h.ip) : null);

    const id = mergeRule ? mergeRule.primaryId : (h.mac || h.devId || h.ip);
    const name = mergeRule ? mergeRule.name : (h.name || h.bonjourName || h.bname || h.modelName || h.ip || 'Device');
    const ip = mergeRule ? mergeRule.ip : (h.ip || '');
    const isOnline = !h.stale && h.online !== false;

    const down = (h.flowsummary && h.flowsummary.inbytes) || h.download || h.totalDownload || 0;
    const up = (h.flowsummary && h.flowsummary.outbytes) || h.upload || h.totalUpload || 0;

    const groupKey = (id || '').toLowerCase();
    if (!devMap.has(groupKey)) {
      devMap.set(groupKey, {
        id,
        name,
        ip,
        online: isOnline,
        totalDownload: down,
        totalUpload: up,
      });
    } else {
      const existing = devMap.get(groupKey);
      existing.totalDownload += down;
      existing.totalUpload += up;
      existing.online = existing.online || isOnline;
      if (!existing.ip && ip) existing.ip = ip;
    }
  }

  res.json(Array.from(devMap.values()));
});

export default router;
