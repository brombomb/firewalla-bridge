import { SecureUtil, FWGroup } from 'node-firewalla';

/**
 * Normalizes raw QR code input by stripping common copy/paste and scanner artifacts:
 * - Markdown code fences (```json ... ```)
 * - iOS/Android smart curly quotes (“ ” ‘ ’)
 * - Preamble text from barcode scanner apps (extracts substring between outermost { and })
 *
 * @param {string} raw - Raw input string
 * @returns {string} Cleaned candidate JSON string
 */
export function cleanQrCodeString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Normalize smart quotes to standard ASCII quotes
  str = str.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  str = str.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

  // If text wraps the JSON (e.g. scanner preamble like "Result: {"gid":...}"), extract { ... }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    str = str.substring(firstBrace, lastBrace + 1).trim();
  }

  return str;
}

/**
 * Thoroughly parses and validates Firewalla pairing QR code JSON.
 *
 * @param {string} raw - Raw QR code string
 * @param {number} [now=Date.now()] - Current epoch time in ms (for testing)
 * @returns {{ ok: boolean, data?: object, cleaned?: string, error?: string, hint?: string, expiresInMinutes?: number }}
 */
export function parseQrCode(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return {
      ok: false,
      error: 'QR code content cannot be empty.',
      hint: 'Scan the QR code from Firewalla app (Settings -> Advanced -> Allow Additional Pairing) and paste the JSON text.',
    };
  }

  const cleaned = cleanQrCodeString(raw);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    let hint = 'Make sure the entire JSON string was copied, starting with "{" and ending with "}".';
    if (!cleaned.startsWith('{')) {
      hint = 'The content does not start with "{". Ensure you copied the JSON payload and not an image URL or label.';
    } else if (!cleaned.endsWith('}')) {
      hint = 'The content is missing the closing "}". It may have been truncated during copy/paste.';
    } else if (err.message.includes('Unexpected token')) {
      hint = 'A character inside the JSON is malformed. Check for unescaped quotes or special characters.';
    }

    return {
      ok: false,
      error: `Malformed JSON: ${err.message}`,
      hint,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'QR code payload must be a JSON object (enclosed in curly braces {}).',
      hint: 'Ensure you copied the Firewalla QR code JSON object, not an array or plain text.',
    };
  }

  const required = ['gid', 'seed', 'license', 'ek', 'ipaddress'];
  const missing = required.filter((field) => !(field in parsed));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required field(s): ${missing.map((f) => `"${f}"`).join(', ')}.`,
      hint: 'This does not appear to be a valid Firewalla pairing QR code. Generate a new one in Settings -> Advanced -> Allow Additional Pairing.',
    };
  }

  // Expiration check
  let expMs = null;
  let expiresInMinutes = null;
  if (parsed.exp !== undefined && parsed.exp !== null) {
    const expVal = Number(parsed.exp);
    if (!Number.isFinite(expVal)) {
      return {
        ok: false,
        error: 'Invalid "exp" expiration timestamp in QR code.',
        hint: 'Generate a fresh QR code from your Firewalla app.',
      };
    }

    // Handle both epoch seconds (< 1e11) and epoch milliseconds
    expMs = expVal < 1e11 ? expVal * 1000 : expVal;
    if (now > expMs) {
      const expiredMinutesAgo = Math.max(1, Math.round((now - expMs) / 60000));
      return {
        ok: false,
        error: `⚠️ QR code expired ${expiredMinutesAgo} minute(s) ago.`,
        hint: 'Toggle "Allow Additional Pairing" OFF and ON in the Firewalla app to generate a fresh QR code.',
      };
    }

    expiresInMinutes = Math.max(1, Math.round((expMs - now) / 60000));
  }

  return {
    ok: true,
    data: parsed,
    cleaned,
    expiresAt: expMs,
    expiresInMinutes,
  };
}

/**
 * Validates the JSON payload extracted from Firewalla's Additional Pairing QR code.
 * Compatible with inquirer prompt validation.
 *
 * @param {string} qr - Raw string content of the QR code
 * @param {number} [now=Date.now()] - Current epoch time in ms (for testing)
 * @returns {true|string} True if valid, or a descriptive error message with troubleshooting hint
 */
export function validateQrCode(qr, now = Date.now()) {
  const result = parseQrCode(qr, now);
  if (!result.ok) {
    return result.hint ? `${result.error}\n   💡 Tip: ${result.hint}` : result.error;
  }
  return true;
}

/**
 * Constructs an FWGroup instance by selecting the specific symmetric key that
 * successfully decrypts with this node's private RSA key (avoiding the hardcoded
 * symmetricKeys[0] assumption when multiple client devices/phones are paired).
 *
 * @param {object} groupObj - Raw group object from Firewalla cloud login
 * @param {string} localIp - Local LAN IP address of the Firewalla box
 * @returns {FWGroup} Initialized FWGroup instance
 */
export function createFWGroup(groupObj, localIp) {
  const { _id, eid, aid, symmetricKeys, name } = groupObj;

  if (!Array.isArray(symmetricKeys) || symmetricKeys.length === 0) {
    return FWGroup.fromJson(groupObj, localIp);
  }

  let selectedCipher = null;
  let decryptedPlain = null;

  for (let i = 0; i < symmetricKeys.length; i++) {
    const item = symmetricKeys[i];
    const cipher = typeof item === 'string' ? item : (item && item.key);
    if (!cipher) continue;
    try {
      const plain = SecureUtil.rsaDecrypt(cipher);
      if (plain && plain.length > 0) {
        selectedCipher = cipher;
        decryptedPlain = plain;
        break;
      }
    } catch (_) {
      // Key was encrypted for a different paired device (e.g. phone)
    }
  }

  // Fallback to first key if decryption check couldn't find one
  if (!selectedCipher) {
    selectedCipher = typeof symmetricKeys[0] === 'string' ? symmetricKeys[0] : (symmetricKeys[0] && symmetricKeys[0].key);
  }

  const fwGroup = new FWGroup(_id, eid, aid, selectedCipher, name, localIp);
  if (decryptedPlain) {
    fwGroup.symmetricKeyPlain = decryptedPlain;
  }
  return fwGroup;
}

/**
 * Formats errors with complete diagnostic visibility, ensuring hidden,
 * non-enumerable, or object-based errors (like { code: 400 }) do not display as empty `{}`.
 *
 * @param {*} err - Error or exception caught
 * @returns {string} Formatted, human-readable error description
 */
export function formatDetailedError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;

  const parts = [];
  if (err.message) parts.push(`Message: ${err.message}`);
  if (err.code) parts.push(`Code: ${err.code}`);
  if (err.status) parts.push(`Status: ${err.status}`);
  if (err.statusCode) parts.push(`StatusCode: ${err.statusCode}`);
  if (err.errno) parts.push(`Errno: ${err.errno}`);
  if (err.syscall) parts.push(`Syscall: ${err.syscall}`);
  if (err.hostname) parts.push(`Hostname: ${err.hostname}`);

  if (err.response) {
    const respStr = typeof err.response === 'object' ? JSON.stringify(err.response) : String(err.response);
    parts.push(`Response: ${respStr}`);
  }

  try {
    const allProps = {};
    const propNames = Object.getOwnPropertyNames(err);
    for (const key of propNames) {
      if (key !== 'stack') {
        allProps[key] = err[key];
      }
    }
    const jsonStr = JSON.stringify(allProps, null, 2);
    if (jsonStr && jsonStr !== '{}') {
      parts.push(`Details: ${jsonStr}`);
    }
  } catch (_) {}

  if (err.stack && parts.length === 0) {
    parts.push(err.stack);
  }

  return parts.length > 0 ? parts.join('\n   ') : JSON.stringify(err);
}

