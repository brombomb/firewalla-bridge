/**
 * Escapes HTML characters to prevent XSS / HTML injection.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safely casts a query parameter to a clean string.
 * @param {unknown} val
 * @param {string} fallback
 * @returns {string}
 */
export function safeString(val, fallback = '') {
  if (typeof val === 'string') return val.trim();
  return fallback;
}
