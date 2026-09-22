/**
 * Bandwidth and network throughput calculation utilities.
 */

/**
 * Calculates current and historical bandwidth metrics from Firewalla telemetry.
 *
 * @param {object} initData - Telemetry payload from initService.init()
 * @param {Array} [hosts=[]] - List of discovered LAN hosts
 * @returns {object} Formatted bandwidth summary
 */
export function calculateBandwidthSummary(initData = {}, hosts = []) {
  const last60 = initData.last60 || {};
  const downloadBuckets = Array.isArray(last60.download) ? last60.download : [];
  const uploadBuckets = Array.isArray(last60.upload) ? last60.upload : [];

  // Determine latest 60-second throughput window
  let currentDownloadBytes = 0;
  let currentUploadBytes = 0;
  let currentTs = 0;

  if (downloadBuckets.length > 0) {
    const lastDown = downloadBuckets[downloadBuckets.length - 1];
    if (Array.isArray(lastDown) && lastDown.length >= 2) {
      currentTs = Number(lastDown[0]) || 0;
      currentDownloadBytes = Number(lastDown[1]) || 0;
    }
  }

  if (uploadBuckets.length > 0) {
    const lastUp = uploadBuckets[uploadBuckets.length - 1];
    if (Array.isArray(lastUp) && lastUp.length >= 2) {
      if (!currentTs) currentTs = Number(lastUp[0]) || 0;
      currentUploadBytes = Number(lastUp[1]) || 0;
    }
  }

  // 60-second interval: Bytes/s and Mbps (1 Mbps = 1,000,000 bits/sec)
  const downloadBytesPerSecond = Math.round(currentDownloadBytes / 60);
  const uploadBytesPerSecond = Math.round(currentUploadBytes / 60);
  const downloadMbps = Math.round(((currentDownloadBytes * 8) / 60 / 1e6) * 100) / 100;
  const uploadMbps = Math.round(((currentUploadBytes * 8) / 60 / 1e6) * 100) / 100;

  // Last 60-minute aggregated statistics
  const total60Down =
    Number(last60.totalDownload) ||
    downloadBuckets.reduce((acc, b) => acc + (Array.isArray(b) ? Number(b[1]) || 0 : 0), 0);
  const total60Up =
    Number(last60.totalUpload) ||
    uploadBuckets.reduce((acc, b) => acc + (Array.isArray(b) ? Number(b[1]) || 0 : 0), 0);

  const avg60DownMbps = total60Down > 0 ? Math.round(((total60Down * 8) / 3600 / 1e6) * 100) / 100 : 0;
  const avg60UpMbps = total60Up > 0 ? Math.round(((total60Up * 8) / 3600 / 1e6) * 100) / 100 : 0;

  // Monthly data usage
  const monthly = initData.monthlyDataUsage || {};
  const monthlyDown = Number(monthly.totalDownload) || 0;
  const monthlyUp = Number(monthly.totalUpload) || 0;
  const monthlyBeginTs = Number(monthly.monthlyBeginTs) || 0;
  const monthlyEndTs = Number(monthly.monthlyEndTs) || 0;

  // Aggregated host bytes across discovered devices
  let hostDown = 0;
  let hostUp = 0;
  if (Array.isArray(hosts)) {
    for (const h of hosts) {
      hostDown += Number((h.flowsummary && h.flowsummary.inbytes) || h.download || h.totalDownload || 0);
      hostUp += Number((h.flowsummary && h.flowsummary.outbytes) || h.upload || h.totalUpload || 0);
    }
  }

  return {
    current: {
      timestamp: currentTs,
      downloadMbps,
      uploadMbps,
      downloadBytesPerSecond,
      uploadBytesPerSecond,
    },
    last60Minutes: {
      totalDownloadBytes: total60Down,
      totalUploadBytes: total60Up,
      averageDownloadMbps: avg60DownMbps,
      averageUploadMbps: avg60UpMbps,
    },
    monthly: {
      totalDownloadBytes: monthlyDown,
      totalUploadBytes: monthlyUp,
      monthlyBeginTs,
      monthlyEndTs,
    },
    devices: {
      totalDownloadBytes: hostDown,
      totalUploadBytes: hostUp,
    },
  };
}

/**
 * Formats 1-minute historical bandwidth buckets for graphing and analytics.
 *
 * @param {object} initData - Telemetry payload from initService.init()
 * @returns {Array<object>} Chronological list of bandwidth bucket datapoints
 */
export function formatBandwidthHistory(initData = {}) {
  const last60 = initData.last60 || {};
  const downloadBuckets = Array.isArray(last60.download) ? last60.download : [];
  const uploadBuckets = Array.isArray(last60.upload) ? last60.upload : [];

  const upMap = new Map();
  for (const item of uploadBuckets) {
    if (Array.isArray(item) && item.length >= 2) {
      upMap.set(Number(item[0]), Number(item[1]) || 0);
    }
  }

  const history = [];
  for (const item of downloadBuckets) {
    if (Array.isArray(item) && item.length >= 2) {
      const ts = Number(item[0]);
      const downBytes = Number(item[1]) || 0;
      const upBytes = upMap.get(ts) || 0;

      history.push({
        timestamp: ts,
        downloadBytes: downBytes,
        uploadBytes: upBytes,
        downloadMbps: Math.round(((downBytes * 8) / 60 / 1e6) * 100) / 100,
        uploadMbps: Math.round(((upBytes * 8) / 60 / 1e6) * 100) / 100,
        downloadBytesPerSecond: Math.round(downBytes / 60),
        uploadBytesPerSecond: Math.round(upBytes / 60),
      });
    }
  }

  return history;
}
