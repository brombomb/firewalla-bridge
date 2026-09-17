import { Router } from 'express';
import { refreshCache } from '../client/firewalla.js';
import { getAlarmList, getInitData } from '../client/cache.js';
import { getActiveAlarms } from '../utils/alarms.js';

const router = Router();

// GET /v2/alarms (matches MSP /v2/alarms)
router.get('/v2/alarms', async (req, res) => {
  await refreshCache();
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};

  const securityOnly = req.query.securityOnly === 'true' || req.query.filter === 'security';
  const alarms = getActiveAlarms(rawAlarms, rules, appConfs, securityOnly);

  const results = alarms.map((a, idx) => ({
    aid: a.aid || a.id || String(idx + 1),
    type: a.type || 'ALARM',
    message: a.message || a.desc || a.title || 'Security alert',
    ts: Math.floor(parseFloat(a.timestamp || a.alarmTimestamp || (Date.now() / 1000))),
  }));

  res.json({
    count: results.length,
    results,
  });
});

// GET /v2/trends/alarms (matches MSP /v2/trends/alarms)
router.get('/v2/trends/alarms', async (req, res) => {
  await refreshCache();
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};

  const alarms = getActiveAlarms(rawAlarms, rules, appConfs, false);
  const nowSec = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  const dailyCounts = [0, 0, 0, 0, 0, 0, 0];
  alarms.forEach((a) => {
    const ts = parseFloat(a.timestamp || a.alarmTimestamp || nowSec);
    const daysAgo = Math.floor((nowSec - ts) / oneDay);
    if (daysAgo >= 0 && daysAgo < 7) {
      dailyCounts[6 - daysAgo] += 1;
    }
  });

  const results = dailyCounts.map((count, idx) => ({
    ts: nowSec - (6 - idx) * oneDay,
    value: count,
  }));

  res.json(results);
});

export default router;
