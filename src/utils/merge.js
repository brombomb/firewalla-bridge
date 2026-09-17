/**
 * Parse optional MERGE_DEVICES configuration from environment.
 * Supports:
 * 1. JSON string: [{"name":"Server","ip":"192.168.1.15","primaryId":"A6:86:5A:70:71:53","macs":["a6:86:..."]}]
 * 2. Semicolon-delimited shorthand: "ServerName:192.168.1.15:mac1,mac2;NAS:192.168.1.20:mac3,mac4" (or pipe: "Name|IP|mac1,mac2")
 *
 * @param {string|undefined} raw
 * @returns {Array<{name: string, ip: string, primaryId: string, macs: string[]}>}
 */
export function parseMergeDevices(raw) {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();

  // Try JSON format
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map((item) => {
        const macs = (item.macs || []).map((m) => String(m).trim().toLowerCase());
        return {
          name: item.name || 'Merged Device',
          ip: item.ip || '',
          primaryId: item.primaryId || (macs[0] ? macs[0].toUpperCase() : item.ip || 'MERGED'),
          macs: macs,
        };
      });
    } catch (e) {
      console.warn('⚠️  Could not parse MERGE_DEVICES as JSON, falling back to delimiter format:', e.message);
    }
  }

  // Fallback: Delimited shorthand string
  return trimmed
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      let name = '';
      let ip = '';
      let macStr = '';

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
          name,
          ip,
          primaryId: macs[0] ? macs[0].toUpperCase() : ip,
          macs,
        };
      }
      return null;
    })
    .filter(Boolean);
}

export const MERGED_DEVICES = parseMergeDevices(process.env.MERGE_DEVICES);

if (MERGED_DEVICES.length > 0) {
  console.log(
    `🔗 Configured ${MERGED_DEVICES.length} bonded/merged device rule(s):`,
    MERGED_DEVICES.map((d) => `${d.name} (${d.macs.length} MACs)`).join(', ')
  );
}

/**
 * Returns a merge rule matching an identifier (MAC address or IP).
 * @param {string} identifier
 * @returns {{name: string, ip: string, primaryId: string, macs: string[]}|null}
 */
export function getMergeRule(identifier) {
  if (!identifier || MERGED_DEVICES.length === 0) return null;
  const lower = identifier.toLowerCase();
  for (const m of MERGED_DEVICES) {
    if (m.macs.includes(lower) || (m.ip && m.ip.toLowerCase() === lower)) {
      return m;
    }
  }
  return null;
}
