import { Router } from 'express';
import { refreshCache, getFwGroup, getBoxDisplayName, FIREWALLA_IP } from '../client/firewalla.js';
import { cache, getHostList, getAlarmList, getInitData } from '../client/cache.js';
import { getActiveAlarms } from '../utils/alarms.js';
import { escapeHtml } from '../utils/sanitize.js';

const router = Router();

// Root route: Status dashboard for browser checks
router.get('/', async (req, res) => {
  if (getFwGroup() && (!cache.hosts || !cache.alarms || !cache.initData)) {
    await refreshCache();
  }

  const isConnected = !!getFwGroup();
  const devCount = getHostList().length;
  const rawAlarms = getAlarmList();
  const initData = getInitData();
  const rules = initData.exceptionRules || [];
  const appConfs = initData.appConfs || {};

  const activeAlarms = getActiveAlarms(rawAlarms, rules, appConfs, false).length;
  const securityAlarms = getActiveAlarms(rawAlarms, rules, appConfs, true).length;
  const ignoredCount = Math.max(0, rawAlarms.length - activeAlarms);
  const boxName = getBoxDisplayName();

  if (req.accepts('html')) {
    // Sanitize Host header to prevent HTML injection / reflected XSS
    const hostHeader = escapeHtml(req.headers.host || `${req.hostname}:7153`);
    const safeBoxName = escapeHtml(boxName);
    const safeIp = escapeHtml(FIREWALLA_IP);

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Firewalla Local Bridge</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0D1117; color: #ECEFF1; padding: 2rem; }
    .card { background: #161B22; border: 1px solid #30363D; border-radius: 8px; padding: 1.5rem; max-width: 600px; margin: auto; }
    h1 { margin-top: 0; color: #FF5722; display: flex; align-items: center; gap: 0.5rem; }
    .status { padding: 0.5rem 1rem; border-radius: 4px; font-weight: bold; display: inline-block; margin-bottom: 1rem; }
    .connected { background: #1B4728; color: #3ED860; }
    .unpaired { background: #4D1F1D; color: #FF5252; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5rem 0; }
    a { color: #00E5FF; text-decoration: none; font-family: monospace; font-size: 1.1rem; }
    a:hover { text-decoration: underline; }
    .tip { background: #1F242C; padding: 0.75rem; border-radius: 4px; font-size: 0.9rem; color: #B0BEC5; margin-top: 1rem; }
    code { background: #2A313C; padding: 0.2rem 0.4rem; border-radius: 3px; color: #FFAB91; }
    .badge { background: #238636; color: #FFFFFF; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔥 Firewalla Local Bridge</h1>
    <div class="status ${isConnected ? 'connected' : 'unpaired'}">
      ${isConnected ? '● CONNECTED' : '● UNPAIRED (Keys Missing or Box Unreachable)'}
    </div>
    <p>Target Firewalla Box: <strong>${safeBoxName}</strong> (<code>${safeIp}</code>)</p>
    <p>Cached Devices: <strong>${devCount}</strong></p>
    <p>Active Alarms: <strong>${activeAlarms}</strong> <span class="badge">${securityAlarms} Security Threats</span> ${ignoredCount > 0 ? `<em>(${ignoredCount} ignored by rules)</em>` : ''}</p>
    
    <h3>API Endpoints:</h3>
    <ul>
      <li><a href="/health">/health</a> - Health check</li>
      <li><a href="/v2/boxes">/v2/boxes</a> - Box details & status</li>
      <li><a href="/v2/alarms">/v2/alarms</a> - Active security alarms</li>
      <li><a href="/v2/alarms?filter=security">/v2/alarms?filter=security</a> - Security threat alarms only</li>
      <li><a href="/v2/trends/flows">/v2/trends/flows</a> - 24-hour threat sparkline</li>
      <li><a href="/v2/flows?groupBy=device">/v2/flows?groupBy=device</a> - Top bandwidth talkers</li>
      <li><a href="/v2/devices">/v2/devices</a> - All LAN devices</li>
      <li><a href="/v2/rules">/v2/rules</a> - Firewall policy rules</li>
      <li><a href="/v2/speedtest">/v2/speedtest</a> - Latest speed test metrics</li>
    </ul>

    ${!isConnected ? `
    <div class="tip">
      <strong>Next Step:</strong> Pair your Firewalla box by running:<br>
      <code>docker compose run --rm firewalla-bridge npm run pair</code>
    </div>` : `
    <div class="tip">
      <strong>Dashboard App Setting:</strong> Set Bridge Address in your dashboard or Tronbyt app to:<br>
      <code>http://${hostHeader}</code>
    </div>`}
  </div>
</body>
</html>`);
  } else {
    res.json({
      name: 'Firewalla Local Bridge',
      status: isConnected ? 'connected' : 'unpaired',
      boxName: boxName,
      firewallaIp: FIREWALLA_IP,
      cachedDevices: devCount,
      activeAlarms,
      securityAlarms,
      ignoredAlarms: ignoredCount,
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  if (getFwGroup() && (!cache.hosts || !cache.alarms || !cache.initData)) {
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
    status: getFwGroup() ? 'connected' : 'unpaired',
    firewallaIp: FIREWALLA_IP,
    boxName: getBoxDisplayName(),
    cachedDevices: hostList.length,
    cachedAlarms: activeAlarms,
    securityAlarms,
    ignoredAlarms: Math.max(0, rawAlarms.length - activeAlarms),
  });
});

export default router;
