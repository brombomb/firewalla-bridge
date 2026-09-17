import { Router } from 'express';
import { FWGetMessage, FWGroupApi } from 'node-firewalla';
import { refreshCache, getFwGroup } from '../client/firewalla.js';
import { getHostList, getAlarmList, getInitData } from '../client/cache.js';
import { getActiveAlarms } from '../utils/alarms.js';
import { getMergeRule } from '../utils/merge.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// In-memory cache for live 1-hour flows to prevent router CPU exhaustion (30s TTL)
let flow1hCache = {
  data: null,
  timestamp: 0,
};

// GET /v2/trends/flows (matches MSP /v2/trends/flows)
router.get('/v2/trends/flows', asyncHandler(async (req, res) => {
  await refreshCache();
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};

  const alarms = getActiveAlarms(rawAlarms, rules, appConfs, false);
  const nowSec = Math.floor(Date.now() / 1000);
  const hourlyCounts = new Array(24).fill(0);

  // Group real active alarms / threats by actual timestamp into 24 one-hour buckets
  for (const a of alarms) {
    let ts = parseFloat(a.timestamp || a.alarmTimestamp || 0);
    if (!ts) continue;
    if (ts > 1e11) ts = Math.floor(ts / 1000);
    if (ts > nowSec) ts = nowSec;
    const hoursAgo = Math.floor((nowSec - ts) / 3600);
    if (hoursAgo >= 0 && hoursAgo < 24) {
      hourlyCounts[23 - hoursAgo]++;
    }
  }

  const results = hourlyCounts.map((count, idx) => ({
    ts: nowSec - (23 - idx) * 3600,
    value: count,
  }));

  res.json(results);
}));

// GET /v2/flows (matches MSP /v2/flows, supporting ?groupBy=device)
router.get('/v2/flows', asyncHandler(async (req, res) => {
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
      let flows;
      const nowMs = Date.now();
      if (flow1hCache.data && nowMs - flow1hCache.timestamp < 30000) {
        flows = flow1hCache.data;
      } else {
        const now = Math.floor(nowMs / 1000);
        const flowMsg = new FWGetMessage('flows', { begin: now - 3600, end: now, limit: 300 });
        const flowRes = await FWGroupApi.sendMessageToBox(fwGroup, flowMsg);
        flows = flowRes.flows || [];
        flow1hCache = {
          data: flows,
          timestamp: nowMs,
        };
      }

      // Name lookup map by MAC and IP (prototype-safe Map)
      const nameMap = new Map();
      hosts.forEach((h) => {
        const name = h.name || h.bonjourName || h.bname || h.modelName || h.ip || 'Device';
        if (h.mac) nameMap.set(h.mac.toLowerCase(), name);
        if (h.ip) nameMap.set(h.ip, name);
      });

      const byDev = new Map();
      flows.forEach((f) => {
        const devKey = (f.device || f.deviceIP || '').toLowerCase();
        if (!devKey) return;

        const mergeRule = getMergeRule(devKey) || (f.deviceIP ? getMergeRule(f.deviceIP) : null);
        const groupKey = mergeRule ? mergeRule.primaryId.toLowerCase() : devKey;
        const devId = mergeRule ? mergeRule.primaryId : (f.device || f.deviceIP);
        const devName = mergeRule ? mergeRule.name : (nameMap.get(devKey) || f.deviceIP || devKey);
        const devIp = mergeRule ? mergeRule.ip : (f.deviceIP || '');
        const fDown = Number(f.download || 0);
        const fUp = Number(f.upload || 0);

        if (!byDev.has(groupKey)) {
          byDev.set(groupKey, {
            device: {
              id: devId,
              name: devName,
              ip: devIp,
            },
            download: 0,
            upload: 0,
            total: 0,
          });
        }
        const entry = byDev.get(groupKey);
        entry.download += fDown;
        entry.upload += fUp;
        entry.total += fDown + fUp;
      });

      const sorted1h = Array.from(byDev.values())
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

    const down = Number((h.flowsummary && h.flowsummary.inbytes) || h.download || h.totalDownload || 0);
    const up = Number((h.flowsummary && h.flowsummary.outbytes) || h.upload || h.totalUpload || 0);

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
}));

export default router;
