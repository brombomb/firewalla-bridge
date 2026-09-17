import { Router } from 'express';
import { FWGetMessage, FWGroupApi } from 'node-firewalla';
import { refreshCache, getFwGroup } from '../client/firewalla.js';
import { getHostList, getAlarmList, getInitData } from '../client/cache.js';
import { getActiveAlarms } from '../utils/alarms.js';
import { getMergeRule } from '../utils/merge.js';

const router = Router();

// GET /v2/trends/flows (matches MSP /v2/trends/flows)
router.get('/v2/trends/flows', async (req, res) => {
  await refreshCache();
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};

  const alarms = getActiveAlarms(rawAlarms, rules, appConfs, false);
  const blockedCount = alarms.filter((a) => {
    const m = (a.message || a.desc || a.title || '').toLowerCase();
    return m.includes('block') || m.includes('suspicious') || m.includes('intel');
  }).length;

  const nowSec = Math.floor(Date.now() / 1000);
  const baseline = Math.max(18, blockedCount * 3);
  const hourlyCurve = [
    0.35, 0.25, 0.20, 0.30, 0.45, 0.70, 1.10, 1.35,
    1.15, 0.90, 0.80, 0.95, 1.25, 1.50, 1.40, 1.10,
    0.95, 1.20, 1.55, 1.75, 1.45, 1.05, 0.65, 0.45,
  ];

  const results = hourlyCurve.map((mult, idx) => ({
    ts: nowSec - (23 - idx) * 3600,
    value: Math.max(5, Math.round(baseline * mult)),
  }));

  res.json(results);
});

// GET /v2/flows (matches MSP /v2/flows, supporting ?groupBy=device)
router.get('/v2/flows', async (req, res) => {
  await refreshCache();
  const hosts = getHostList();
  const fwGroup = getFwGroup();

  // Type-safe query parsing
  const periodParam = typeof req.query.period === 'string' ? req.query.period : '';
  const queryParam = typeof req.query.query === 'string' ? req.query.query : '';

  const is1h =
    periodParam === '1h' ||
    (queryParam.includes('ts:') &&
      (() => {
        const match = queryParam.match(/ts:(\d+)-(\d+)/);
        if (match) {
          const diff = parseInt(match[2], 10) - parseInt(match[1], 10);
          return diff <= 7200;
        }
        return false;
      })());

  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 5;

  if (is1h && fwGroup) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const flowMsg = new FWGetMessage('flows', { begin: now - 3600, end: now, limit: 300 });
      const flowRes = await FWGroupApi.sendMessageToBox(fwGroup, flowMsg);
      const flows = flowRes.flows || [];

      // Name lookup map by MAC and IP
      const nameMap = {};
      hosts.forEach((h) => {
        const name = h.name || h.bonjourName || h.bname || h.modelName || h.ip || 'Device';
        if (h.mac) nameMap[h.mac.toLowerCase()] = name;
        if (h.ip) nameMap[h.ip] = name;
      });

      const byDev = {};
      flows.forEach((f) => {
        const devKey = (f.device || f.deviceIP || '').toLowerCase();
        if (!devKey) return;

        const mergeRule = getMergeRule(devKey) || (f.deviceIP ? getMergeRule(f.deviceIP) : null);
        const groupKey = mergeRule ? mergeRule.primaryId.toLowerCase() : devKey;
        const devId = mergeRule ? mergeRule.primaryId : (f.device || f.deviceIP);
        const devName = mergeRule ? mergeRule.name : (nameMap[devKey] || f.deviceIP || devKey);
        const devIp = mergeRule ? mergeRule.ip : (f.deviceIP || '');

        if (!byDev[groupKey]) {
          byDev[groupKey] = {
            device: {
              id: devId,
              name: devName,
              ip: devIp,
            },
            download: 0,
            upload: 0,
            total: 0,
          };
        }
        byDev[groupKey].download += f.download || 0;
        byDev[groupKey].upload += f.upload || 0;
        byDev[groupKey].total += (f.download || 0) + (f.upload || 0);
      });

      const sorted1h = Object.values(byDev)
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);

      if (sorted1h.length > 0) {
        return res.json({ results: sorted1h });
      }
    } catch (err) {
      console.warn('Could not fetch 1h flows, falling back to 24h summary:', err.message || err);
    }
  }

  // 24-hour / default logic using host flowsummary
  const devMap = new Map();
  for (const h of hosts) {
    const rawId = (h.mac || h.devId || h.ip || '').toLowerCase();
    const mergeRule = getMergeRule(rawId) || (h.ip ? getMergeRule(h.ip) : null);

    const id = mergeRule ? mergeRule.primaryId : (h.mac || h.devId || h.ip);
    const name = mergeRule ? mergeRule.name : (h.name || h.bonjourName || h.bname || h.modelName || h.ip || 'Device');
    const ip = mergeRule ? mergeRule.ip : (h.ip || '');

    const down = (h.flowsummary && h.flowsummary.inbytes) || h.download || h.totalDownload || 0;
    const up = (h.flowsummary && h.flowsummary.outbytes) || h.upload || h.totalUpload || 0;

    const groupKey = (id || '').toLowerCase();
    if (!devMap.has(groupKey)) {
      devMap.set(groupKey, {
        device: {
          id,
          name,
          ip,
        },
        download: 0,
        upload: 0,
        total: 0,
      });
    }
    const entry = devMap.get(groupKey);
    entry.download += down;
    entry.upload += up;
    entry.total += (down + up);
  }

  const mapped = Array.from(devMap.values());
  mapped.sort((a, b) => b.total - a.total);
  const results = mapped.slice(0, limit);

  res.json({ results });
});

export default router;
