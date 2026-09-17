import fs from 'fs';
import {
  SecureUtil,
  FWGroup,
  FWGroupApi,
  HostService,
  AlarmService,
  NetworkService,
  InitService,
} from 'node-firewalla';
import { cache, CACHE_TTL_MS } from './cache.js';

export const FIREWALLA_IP = process.env.FIREWALLA_IP || '192.168.1.1';
export const KEY_DIR = process.env.KEY_DIR || './keys';
export const BOX_NAME_OVERRIDE = process.env.BOX_NAME || '';

let fwGroup = null;
let hostService = null;
let alarmService = null;
let networkService = null;
let initService = null;

// Single-flight promise lock to prevent parallel cache stampedes
let refreshPromise = null;

export function getFwGroup() {
  return fwGroup;
}

export function getBoxDisplayName() {
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

export async function initFirewalla() {
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

/**
 * Refreshes cache from local Firewalla box with single-flight locking.
 * Prevents multiple simultaneous requests from spamming the embedded CPU.
 */
export async function refreshCache() {
  const now = Date.now();
  if (now - cache.lastUpdated < CACHE_TTL_MS && cache.hosts && cache.alarms && cache.initData) {
    return;
  }

  if (!fwGroup) {
    const ok = await initFirewalla();
    if (!ok) return;
  }

  // If a refresh is already in flight, await the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
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
      cache.lastUpdated = Date.now();
    } catch (err) {
      console.error('Error refreshing Firewalla cache:', err.message || err);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
