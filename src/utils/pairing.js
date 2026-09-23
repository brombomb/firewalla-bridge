/**
 * Firewalla pairing and QR code validation utilities.
 */

/**
 * Validates the JSON payload extracted from Firewalla's Additional Pairing QR code.
 *
 * @param {string} qr - Raw string content of the QR code
 * @param {number} [now=Date.now()] - Current epoch time in ms (for testing)
 * @returns {true|string} True if valid, or a descriptive error message
 */
export function validateQrCode(qr, now = Date.now()) {
  if (!qr || typeof qr !== 'string' || !qr.trim()) {
    return 'QR code content cannot be empty';
  }

  try {
    const parsed = JSON.parse(qr.trim());
    if (typeof parsed !== 'object' || parsed === null) {
      return 'QR code content must be a JSON object';
    }

    const required = ['gid', 'seed', 'license', 'ek', 'ipaddress'];
    for (const field of required) {
      if (!(field in parsed)) {
        return `Missing field "${field}" in QR code JSON`;
      }
    }

    if (parsed.exp !== undefined && parsed.exp !== null) {
      const expVal = Number(parsed.exp);
      if (!Number.isFinite(expVal)) {
        return 'QR code has an invalid expiration timestamp';
      }
      // Handle both epoch seconds (< 1e11) and epoch milliseconds
      const expMs = expVal < 1e11 ? expVal * 1000 : expVal;
      if (now > expMs) {
        const expiredMinutesAgo = Math.max(1, Math.round((now - expMs) / 60000));
        return `⚠️ QR code expired ${expiredMinutesAgo} minute(s) ago. Please toggle Additional Pairing OFF and ON in the app for a fresh QR code.`;
      }
    }

    return true;
  } catch (err) {
    return 'QR code content must be valid JSON';
  }
}
