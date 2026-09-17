import { Router } from 'express';
import { refreshCache, getFwGroup, getBoxDisplayName } from '../client/firewalla.js';
import { getHostList, getAlarmList, getInitData } from '../client/cache.js';
import { getActiveAlarms } from '../utils/alarms.js';

const router = Router();

// GET /v2/boxes (matches MSP /v2/boxes, enriched with live telemetry)
router.get('/v2/boxes', async (req, res) => {
  await refreshCache();
  const fwGroup = getFwGroup();
  const hosts = getHostList();
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};
  const activeAlarms = getActiveAlarms(rawAlarms, rules, appConfs, false);

  const model = fwGroup && fwGroup.model ? fwGroup.model : (initData.model || 'purple');

  res.json([
    {
      gid: fwGroup ? fwGroup.gid : 'local-box',
      name: getBoxDisplayName(),
      model: model,
      mode: initData.mode || 'router',
      online: true,
      publicIp: initData.publicIp || (initData.publicIps && initData.publicIps[0]) || '',
      version: initData.versionStr || initData.version || '',
      uptime: initData.uptime || initData.osUptime || 0,
      deviceCount: hosts.length,
      ruleCount: initData.policyRuleNumber || (initData.policyRules ? initData.policyRules.length : 0),
      alarmCount: activeAlarms.length,
    },
  ]);
});

export default router;
