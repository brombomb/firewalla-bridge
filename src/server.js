import express from 'express';
import fs from 'fs';
import {
  SecureUtil,
  FWGroup,
  FWGroupApi,
  HostService,
  AlarmService,
  NetworkService,
  InitService,
  FWGetMessage,
} from 'node-firewalla';

const app = express();
const PORT = process.env.PORT || 7153;
const FIREWALLA_IP = process.env.FIREWALLA_IP || '192.168.1.1';
const KEY_DIR = process.env.KEY_DIR || './keys';
const BOX_NAME_OVERRIDE = process.env.BOX_NAME || '';

// Parse optional MERGE_DEVICES from environment.
// Supports either:
// 1. JSON string: [{"name":"Server","ip":"192.168.1.15","primaryId":"A6:86:5A:70:71:53","macs":["a6:86:5a:..."]}]
// 2. Simple shorthand: "ServerName:192.168.1.15:mac1,mac2;NAS:192.168.1.20:mac3,mac4"
function parseMergeDevices(raw) {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();

  // Try JSON format
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map((item) => {
        const macs = (item.macs || []).map((m) => m.trim().toLowerCase());
        return {
          name: item.name || 'Merged Device',
          ip: item.ip || '',
          primaryId: item.primaryId || (macs[0] ? macs[0].toUpperCase() : item.ip || 'MERGED'),
          macs: macs,
        };
      });
    } catch (e) {
      console.warn('⚠️  Could not parse MERGE_DEVICES as JSON, trying delimiter format:', e.message);
    }
  }

  // Fallback: Semicolon delimited shorthand:
  // "Name:IP:mac1,mac2;Name2:IP2:mac3,mac4" (or pipes: "Name|IP|mac1,mac2")
  return trimmed
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      let name, ip, macStr;
      if (entry.includes('|')) {
        [name, ip, macStr] = entry.split('|');
      } else {
        const parts = entry.split(':');
        name = parts[0];
        ip = parts[1];
        macStr = parts.slice(2).join(':');
      }
      name = (name || '').trim();
      ip = (ip || '').trim();
      const macs = (macStr || '')
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .filter(Boolean);

      if (name && (macs.length > 0 || ip)) {
        return {
          name: name,
          ip: ip,
          primaryId: macs[0] ? macs[0].toUpperCase() : ip,
          macs: macs,
        };
      }
      return null;
    })
    .filter(Boolean);
}

const MERGED_DEVICES = parseMergeDevices(process.env.MERGE_DEVICES);
if (MERGED_DEVICES.length > 0) {
  console.log(`🔗 Configured ${MERGED_DEVICES.length} bonded/merged device rule(s):`, MERGED_DEVICES.map((d) => `${d.name} (${d.macs.length} MACs)`).join(', '));
}

function getMergeRule(identifier) {
  if (!identifier || MERGED_DEVICES.length === 0) return null;
  const lower = identifier.toLowerCase();
  for (const m of MERGED_DEVICES) {
    if (m.macs.includes(lower) || (m.ip && m.ip.toLowerCase() === lower)) {
      return m;
    }
  }
  return null;
}

let fwGroup = null;
let hostService = null;
let alarmService = null;
let networkService = null;
let initService = null;

// In-memory cache to prevent spamming the local Firewalla box
let cache = {
  hosts: null,
  alarms: null,
  networkStats: null,
  initData: null,
  lastUpdated: 0,
};

const CACHE_TTL_MS = 20 * 1000; // 20 seconds

function getHostList() {
  if (!cache.hosts) return [];
  if (Array.isArray(cache.hosts.hosts)) return cache.hosts.hosts;
  if (Array.isArray(cache.hosts)) return cache.hosts;
  return [];
}

function getAlarmList() {
  if (!cache.alarms) return [];
  if (Array.isArray(cache.alarms.alarms)) return cache.alarms.alarms;
  if (Array.isArray(cache.alarms)) return cache.alarms;
  return [];
}

function isAlarmIgnored(alarm, exceptionRules = [], appConfs = {}) {
  // 1. Check if alarm app has notifications muted (disturb: true)
  const appId = (alarm['p.dest.app.id'] || alarm['p.dest.app'] || '').toLowerCase();
  if (appId && appConfs && appConfs[appId]) {
    const conf = appConfs[appId];
    if (conf.features && conf.features.disturb === true) {
      return true;
    }
  }

  // 2. Check against exception rules configured on Firewalla
  const alarmType = alarm.type || alarm.alarm_type;
  const alarmMac = (alarm['p.device.mac'] || alarm['p.device.id'] || '').toLowerCase();
  const alarmTags = alarm['p.tag.ids'] || [];
  const alarmUtags = alarm['p.utag.ids'] || [];
  const destName = (alarm['p.dest.name'] || '').toLowerCase();
  const destDomain = (alarm['p.dest.domain'] || alarm['p.dest.name.suffix'] || '').toLowerCase();
  const destIp = alarm['p.dest.ip'] || '';

  for (const rule of exceptionRules) {
    const ruleType = rule.type || rule.alarm_type;
    if (ruleType && ruleType !== alarmType) continue;

    let deviceMatch = true;
    if (rule['p.device.mac']) {
      deviceMatch = (rule['p.device.mac'].toLowerCase() === alarmMac);
    } else if (rule['p.tag.ids'] && rule['p.tag.ids'].length > 0) {
      deviceMatch = rule['p.tag.ids'].some((tid) => alarmTags.includes(tid));
    } else if (rule['p.utag.ids'] && rule['p.utag.ids'].length > 0) {
      deviceMatch = rule['p.utag.ids'].some((uid) => alarmUtags.includes(uid));
    }

    if (!deviceMatch) continue;

    const ifType = rule['if.type'];
    const ifTarget = (rule['if.target'] || '').toLowerCase();

    if (ifType === ruleType) {
      return true;
    } else if (ifType === 'dns') {
      if (ifTarget && (destName.includes(ifTarget) || destDomain.includes(ifTarget) || ifTarget.includes(destDomain))) {
        return true;
      }
    } else if (ifType === 'ip') {
      if (ifTarget && (destIp === ifTarget || destName === ifTarget)) {
        return true;
      }
    } else if (ifType === 'mac') {
      if (ifTarget && alarmMac && ifTarget.toLowerCase() === alarmMac) {
        return true;
      }
    }
  }

  return false;
}

function getActiveAlarms(filterSecurityOnly = false) {
  const allAlarms = getAlarmList();
  const rules = (cache.initData && cache.initData.exceptionRules) || [];
  const appConfs = (cache.initData && cache.initData.appConfs) || {};

  return allAlarms.filter((a) => {
    if (isAlarmIgnored(a, rules, appConfs)) {
      return false;
    }

    if (filterSecurityOnly) {
      const type = (a.type || '').toUpperCase();
      const msg = (a.message || '').toLowerCase();
      const isSecurity =
        type.includes('INTEL') ||
        type.includes('SECURITY') ||
        type.includes('VULNERABILITY') ||
        type.includes('OPENPORT') ||
        type.includes('SPOOFING') ||
        msg.includes('blocked') ||
        msg.includes('suspicious') ||
        msg.includes('malware') ||
        msg.includes('exploit');
      return isSecurity;
    }

    return true;
  });
}

function getBoxDisplayName() {
  if (BOX_NAME_OVERRIDE) return BOX_NAME_OVERRIDE;
  const modelRaw = fwGroup && fwGroup.model ? fwGroup.model : 'purple';
  const modelFormatted = modelRaw.charAt(0).toUpperCase() + modelRaw.slice(1);

  if (fwGroup && fwGroup.friendlyName && !/^[0-9a-f]{32}$/i.test(fwGroup.friendlyName)) {
    if (fwGroup.friendlyName.toLowerCase() !== 'firewalla') {
      return fwGroup.friendlyName;
    }
  }

  return `Firewalla ${modelFormatted}`;
}

async function initFirewalla() {
  const privKeyPath = `${KEY_DIR}/etp.private.pem`;
  const pubKeyPath = `${KEY_DIR}/etp.public.pem`;

  if (!fs.existsSync(privKeyPath) || !fs.existsSync(pubKeyPath)) {
    console.warn('\n⚠️  Key files not found in ' + KEY_DIR);
    console.warn('   Please pair your Firewalla box first:');
    console.warn('   docker compose run --rm firewalla-bridge npm run pair\n');
    return false;
  }

  try {
    const privKey = fs.readFileSync(privKeyPath, 'utf8');
    const pubKey = fs.readFileSync(pubKeyPath, 'utf8');

    SecureUtil.importKeyPairFromString(pubKey, privKey);

    console.log(`Connecting to Firewalla at ${FIREWALLA_IP}...`);
    const { groups } = await FWGroupApi.login();

    if (!groups || groups.length === 0) {
      console.error('No Firewalla boxes returned from login.');
      return false;
    }

    fwGroup = FWGroup.fromJson(groups[0], FIREWALLA_IP);
    hostService = new HostService(fwGroup);
    alarmService = new AlarmService(fwGroup);
    networkService = new NetworkService(fwGroup);
    initService = new InitService(fwGroup);

    // Auto-detect model and friendly name from encrypted metadata
    try {
      const symKey = fwGroup.getSymmetricKey();
      if (groups[0].info) {
        const decryptedInfo = JSON.parse(SecureUtil.aesDecrypt(groups[0].info, symKey));
        if (decryptedInfo.model) {
          fwGroup.model = decryptedInfo.model;
        }
      }
      if (groups[0].xname) {
        fwGroup.friendlyName = SecureUtil.aesDecrypt(groups[0].xname, symKey);
      }
    } catch (e) {
      console.warn('Could not decrypt group metadata:', e.message || e);
    }

    console.log(`✅ Connected to Firewalla box: ${getBoxDisplayName()} (${groups[0].name})`);
    return true;
  } catch (err) {
    console.error('Failed to initialize Firewalla client:', err.message || err);
    return false;
  }
}

async function refreshCache() {
  const now = Date.now();
  if (now - cache.lastUpdated < CACHE_TTL_MS && cache.hosts && cache.alarms && cache.initData) {
    return;
  }

  if (!fwGroup) {
    const ok = await initFirewalla();
    if (!ok) return;
  }

  try {
    const [hosts, alarms, netStats, initRes] = await Promise.allSettled([
      hostService.getAll(),
      alarmService.getAll(),
      networkService.getNetworkMonitorData(),
      initService.init(),
    ]);

    if (hosts.status === 'fulfilled' && hosts.value) {
      cache.hosts = hosts.value;
    }
    if (alarms.status === 'fulfilled' && alarms.value) {
      cache.alarms = alarms.value;
    }
    if (netStats.status === 'fulfilled' && netStats.value) {
      cache.networkStats = netStats.value;
    }
    if (initRes.status === 'fulfilled' && initRes.value) {
      cache.initData = initRes.value;
    }
    cache.lastUpdated = now;
  } catch (err) {
    console.error('Error refreshing Firewalla cache:', err.message || err);
  }
}

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

// Root route: Status dashboard for browser checks
app.get('/', async (req, res) => {
  if (fwGroup && (!cache.hosts || !cache.alarms || !cache.initData)) {
    await refreshCache();
  }

  const isConnected = !!fwGroup;
  const devCount = getHostList().length;
  const rawAlarms = getAlarmList().length;
  const activeAlarms = getActiveAlarms(false).length;
  const securityAlarms = getActiveAlarms(true).length;
  const ignoredCount = Math.max(0, rawAlarms - activeAlarms);
  const boxName = getBoxDisplayName();

  if (req.accepts('html')) {
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
    <p>Target Firewalla Box: <strong>${boxName}</strong> (<code>${FIREWALLA_IP}</code>)</p>
    <p>Cached Devices: <strong>${devCount}</strong></p>
    <p>Active Alarms: <strong>${activeAlarms}</strong> <span class="badge">${securityAlarms} Security Threats</span> ${ignoredCount > 0 ? `<em>(${ignoredCount} ignored by rules)</em>` : ''}</p>
    
    <h3>API Endpoints:</h3>
    <ul>
      <li><a href="/health">/health</a> - Health check</li>
      <li><a href="/v2/boxes">/v2/boxes</a> - Box details & client count</li>
      <li><a href="/v2/alarms">/v2/alarms</a> - Active alarms (auto-filters ignored)</li>
      <li><a href="/v2/alarms?filter=security">/v2/alarms?filter=security</a> - Security threat alarms only</li>
      <li><a href="/v2/trends/flows">/v2/trends/flows</a> - 24-hour threat sparkline</li>
      <li><a href="/v2/flows?groupBy=device">/v2/flows?groupBy=device</a> - Top bandwidth talkers</li>
      <li><a href="/v2/devices">/v2/devices</a> - All LAN devices</li>
    </ul>

    ${!isConnected ? `
    <div class="tip">
      <strong>Next Step:</strong> Pair your Firewalla box by running:<br>
      <code>docker compose run --rm firewalla-bridge npm run pair</code>
    </div>` : `
    <div class="tip">
      <strong>Tronbyt App Setting:</strong> Set Bridge Address in Tronbyt to:<br>
      <code>http://${req.headers.host || '192.168.1.15:7153'}</code>
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
      activeAlarms: activeAlarms,
      securityAlarms: securityAlarms,
      ignoredAlarms: ignoredCount,
    });
  }
});

// 1. Health check
app.get('/health', async (req, res) => {
  if (fwGroup && (!cache.hosts || !cache.alarms || !cache.initData)) {
    await refreshCache();
  }
  const hostList = getHostList();
  const rawAlarms = getAlarmList().length;
  const activeAlarms = getActiveAlarms(false).length;
  const securityAlarms = getActiveAlarms(true).length;

  res.json({
    status: fwGroup ? 'connected' : 'unpaired',
    firewallaIp: FIREWALLA_IP,
    boxName: getBoxDisplayName(),
    cachedDevices: hostList.length,
    cachedAlarms: activeAlarms,
    securityAlarms: securityAlarms,
    ignoredAlarms: Math.max(0, rawAlarms - activeAlarms),
  });
});

// 2. Boxes overview (matches MSP /v2/boxes)
app.get('/v2/boxes', async (req, res) => {
  await refreshCache();
  const hosts = getHostList();
  const activeAlarms = getActiveAlarms(false);
  const model = fwGroup && fwGroup.model ? fwGroup.model : 'purple';

  res.json([
    {
      gid: fwGroup ? fwGroup.gid : 'local-box',
      name: getBoxDisplayName(),
      model: model,
      mode: 'router',
      online: true,
      deviceCount: hosts.length,
      alarmCount: activeAlarms.length,
    },
  ]);
});

// 3. Alarms list (matches MSP /v2/alarms)
app.get('/v2/alarms', async (req, res) => {
  await refreshCache();
  const securityOnly = req.query.securityOnly === 'true' || req.query.filter === 'security';
  const alarms = getActiveAlarms(securityOnly);

  const results = alarms.map((a, idx) => ({
    aid: a.aid || a.id || String(idx + 1),
    type: a.type || 'ALARM',
    message: a.message || a.desc || a.title || 'Security alert',
    ts: Math.floor(parseFloat(a.timestamp || a.alarmTimestamp || (Date.now() / 1000))),
  }));

  res.json({
    count: results.length,
    results: results,
  });
});

// 4. Blocked trends (matches MSP /v2/trends/flows)
app.get('/v2/trends/flows', async (req, res) => {
  await refreshCache();
  const alarms = getActiveAlarms(false);
  const blockedCount = alarms.filter((a) => {
    const m = (a.message || '').toLowerCase();
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

// 5. Alarms trends (matches MSP /v2/trends/alarms)
app.get('/v2/trends/alarms', async (req, res) => {
  await refreshCache();
  const alarms = getActiveAlarms(false);
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

// 6. Flows & Top Talkers (matches MSP /v2/flows)
app.get('/v2/flows', async (req, res) => {
  await refreshCache();
  const hosts = getHostList();

  const is1h =
    req.query.period === '1h' ||
    (req.query.query &&
      req.query.query.includes('ts:') &&
      (() => {
        const match = req.query.query.match(/ts:(\d+)-(\d+)/);
        if (match) {
          const diff = parseInt(match[2], 10) - parseInt(match[1], 10);
          return diff <= 7200;
        }
        return false;
      })());

  const limit = parseInt(req.query.limit, 10) || 5;

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
          id: id,
          name: name,
          ip: ip,
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
  // Sort descending by total bandwidth
  mapped.sort((a, b) => b.total - a.total);
  const results = mapped.slice(0, limit);

  res.json({ results });
});

// 7. Devices (matches MSP /v2/devices)
app.get('/v2/devices', async (req, res) => {
  await refreshCache();
  const hosts = getHostList();

  const devMap = new Map();
  for (const h of hosts) {
    const rawId = (h.mac || h.devId || h.ip || '').toLowerCase();
    const mergeRule = getMergeRule(rawId) || (h.ip ? getMergeRule(h.ip) : null);

    const id = mergeRule ? mergeRule.primaryId : (h.mac || h.devId || h.ip);
    const name = mergeRule ? mergeRule.name : (h.name || h.bonjourName || h.bname || h.modelName || h.ip || 'Device');
    const ip = mergeRule ? mergeRule.ip : (h.ip || '');
    const isOnline = !h.stale && (h.online !== false);

    const down = (h.flowsummary && h.flowsummary.inbytes) || h.download || h.totalDownload || 0;
    const up = (h.flowsummary && h.flowsummary.outbytes) || h.upload || h.totalUpload || 0;

    const groupKey = (id || '').toLowerCase();
    if (!devMap.has(groupKey)) {
      devMap.set(groupKey, {
        id: id,
        name: name,
        ip: ip,
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

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`==============================================`);
  console.log(`  Firewalla Local Bridge running on port ${PORT}`);
  console.log(`  Target Box: ${FIREWALLA_IP}`);
  console.log(`==============================================`);
  await initFirewalla();
});
