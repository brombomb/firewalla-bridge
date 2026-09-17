export const cache = {
  hosts: null,
  alarms: null,
  networkStats: null,
  initData: null,
  lastUpdated: 0,
};

export const CACHE_TTL_MS = 20 * 1000; // 20 seconds

export function getHostList() {
  if (!cache.hosts) return [];
  if (Array.isArray(cache.hosts.hosts)) return cache.hosts.hosts;
  if (Array.isArray(cache.hosts)) return cache.hosts;
  return [];
}

export function getAlarmList() {
  if (!cache.alarms) return [];
  if (Array.isArray(cache.alarms.alarms)) return cache.alarms.alarms;
  if (Array.isArray(cache.alarms)) return cache.alarms;
  return [];
}

export function getInitData() {
  return cache.initData || {};
}

export function getNetworkStats() {
  return cache.networkStats || {};
}
