import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { refreshCache, getFwGroup, getBoxDisplayName, FIREWALLA_IP } from '../client/firewalla.js';
import { cache, getHostList, getAlarmList, getInitData } from '../client/cache.js';
import { getActiveAlarms } from '../utils/alarms.js';
import { isAuthenticated } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../../public/index.html');
const PKG_PATH = path.resolve(__dirname, '../../package.json');

let bridgeVersion = '1.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  if (pkg.version) bridgeVersion = pkg.version;
} catch (_) {}

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
      version: bridgeVersion,
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
    version: bridgeVersion,
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
      version: bridgeVersion,
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
    version: bridgeVersion,
    firewallaIp: FIREWALLA_IP,
    boxName: getBoxDisplayName(),
    cachedDevices: hostList.length,
    cachedAlarms: activeAlarms,
    securityAlarms,
    ignoredAlarms: Math.max(0, rawAlarms.length - activeAlarms),
  });
}));

const OPENAPI_JSON_PATH = path.resolve(__dirname, '../../public/openapi.json');
const FLAME_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔥</text></svg>`;

// GET /favicon.ico: Serves flame emoji SVG favicon
router.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(FLAME_FAVICON_SVG);
});

// GET /swagger.json: Alias for /openapi.json
router.get('/swagger.json', (req, res) => {
  res.sendFile(OPENAPI_JSON_PATH);
});

// GET /docs: Interactive API documentation (Scalar)
router.get('/docs', (req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <title>Firewalla Bridge API Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>">
    <style>body { margin: 0; background: #0d1117; }</style>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`);
});

export default router;
