import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { refreshCache, getFwGroup, getBoxDisplayName, FIREWALLA_IP } from '../client/firewalla.js';
import { cache, getHostList, getAlarmList, getInitData } from '../client/cache.js';
import { getActiveAlarms } from '../utils/alarms.js';
import { isAuthenticated } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../../public/index.html');

// GET /: Serves index.html to browsers or JSON status to API clients
router.get('/', asyncHandler(async (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(INDEX_HTML_PATH);
  }

  const isConnected = !!getFwGroup();

  // If token is configured and caller is unauthenticated, return minimal status
  if (!isAuthenticated(req)) {
    return res.json({
      name: 'Firewalla Local Bridge',
      status: isConnected ? 'connected' : 'unpaired',
      uptime: Math.floor(process.uptime()),
    });
  }

  if (isConnected && (!cache.hosts || !cache.alarms || !cache.initData)) {
    await refreshCache();
  }

  const devCount = getHostList().length;
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};

  const activeAlarms = getActiveAlarms(rawAlarms, rules, appConfs, false).length;
  const securityAlarms = getActiveAlarms(rawAlarms, rules, appConfs, true).length;
  const ignoredCount = Math.max(0, rawAlarms.length - activeAlarms);

  res.json({
    name: 'Firewalla Local Bridge',
    status: isConnected ? 'connected' : 'unpaired',
    boxName: getBoxDisplayName(),
    firewallaIp: FIREWALLA_IP,
    cachedDevices: devCount,
    activeAlarms,
    securityAlarms,
    ignoredAlarms: ignoredCount,
  });
}));

// GET /health: Health check endpoint
router.get('/health', asyncHandler(async (req, res) => {
  const isConnected = !!getFwGroup();

  // Minimal health status for unauthenticated requests when API_TOKEN is active
  if (!isAuthenticated(req)) {
    return res.json({
      status: isConnected ? 'connected' : 'unpaired',
      uptime: Math.floor(process.uptime()),
    });
  }

  if (isConnected && (!cache.hosts || !cache.alarms || !cache.initData)) {
    await refreshCache();
  }

  const hostList = getHostList();
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};

  const activeAlarms = getActiveAlarms(rawAlarms, rules, appConfs, false).length;
  const securityAlarms = getActiveAlarms(rawAlarms, rules, appConfs, true).length;

  res.json({
    status: isConnected ? 'connected' : 'unpaired',
    firewallaIp: FIREWALLA_IP,
    boxName: getBoxDisplayName(),
    cachedDevices: hostList.length,
    cachedAlarms: activeAlarms,
    securityAlarms,
    ignoredAlarms: Math.max(0, rawAlarms.length - activeAlarms),
  });
}));

export default router;
