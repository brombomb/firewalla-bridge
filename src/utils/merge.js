/**
 * Parse optional MERGE_DEVICES configuration from environment.
 * Supports:
 * 1. JSON string: [{"name":"Server","ip":"192.168.1.100","primaryId":"AA:BB:CC:DD:EE:01","macs":["aa:bb:..."]}]
 * 2. Pipe-delimited shorthand: "Server|192.168.1.100|mac1,mac2;NAS|192.168.1.200|mac3,mac4" (recommended for IPv6)
 * 3. Colon-delimited shorthand: "Server:192.168.1.100:mac1,mac2" (for IPv4)
 *
 * @param {string|undefined} raw
 * @returns {Array<{name: string, ip: string, primaryId: string, macs: string[]}>}
 */
export function parseMergeDevices(raw) {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();

  // 1. Try JSON format
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
          macs,
        };
      });
    } catch (e) {
      console.warn('⚠️  Could not parse MERGE_DEVICES as JSON, falling back to delimiter format:', e.message);
    }
  }

  // 2. Delimited shorthand string
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
        // Handle optional bracketed IPv6 syntax: Name:[2001:db8::1]:mac1,mac2
        const bracketMatch = entry.match(/^([^:]+):\[([a-fA-F0-9:]+)\]:(.+)$/);
        if (bracketMatch) {
          name = bracketMatch[1];
          ip = bracketMatch[2];
          macStr = bracketMatch[3];
        } else {
          const parts = entry.split(':');
          name = parts[0];
          ip = parts[1];
          macStr = parts.slice(2).join(':');
        }
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

// Fast O(1) prototype-safe lookup Map
const RULE_MAP = new Map();
for (const m of MERGED_DEVICES) {
  for (const mac of m.macs) {
    RULE_MAP.set(mac.toLowerCase(), m);
  }
  if (m.ip) {
    RULE_MAP.set(m.ip.toLowerCase(), m);
  }
}

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
  if (!identifier || RULE_MAP.size === 0) return null;
  return RULE_MAP.get(identifier.toLowerCase()) || null;
}
