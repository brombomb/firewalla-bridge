import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, safeString } from '../src/utils/sanitize.js';

describe('Sanitization Utilities (src/utils/sanitize.js)', () => {
  describe('escapeHtml()', () => {
    it('escapes common HTML entities to prevent XSS', () => {
      const untrusted = '<script>alert("xss & dangerous")</script>\'test\'';
      const escaped = escapeHtml(untrusted);
      assert.equal(
        escaped,
        '&lt;script&gt;alert(&quot;xss &amp; dangerous&quot;)&lt;/script&gt;&#039;test&#039;'
      );
    });

    it('handles non-string or empty inputs safely', () => {
      assert.equal(escapeHtml(''), '');
      assert.equal(escapeHtml(null), '');
      assert.equal(escapeHtml(undefined), '');
      assert.equal(escapeHtml(12345), '');
    });
  });

  describe('safeString()', () => {
    it('trims strings properly', () => {
      assert.equal(safeString('  valid-value  '), 'valid-value');
    });

    it('returns fallback value for non-strings', () => {
      assert.equal(safeString(null, 'default'), 'default');
      assert.equal(safeString(undefined, 'default'), 'default');
      assert.equal(safeString(['array'], 'default'), 'default');
      assert.equal(safeString({}, 'fallback'), 'fallback');
    });
  });
});
