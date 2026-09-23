import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQrCodeString, parseQrCode, validateQrCode, formatDetailedError, createFWGroup } from '../src/utils/pairing.js';

describe('Pairing Utilities (src/utils/pairing.js)', () => {
  const validQr = {
    gid: '58350ccd-edb1-42a2-bece-33e8e8a27b79',
    seed: '12345678abcdef',
    license: 'abcdef1234567890',
    ek: 'encrypted_rendezvous_key_base64',
    ipaddress: '192.168.1.1',
  };

  describe('cleanQrCodeString()', () => {
    it('returns empty string for null, undefined, or empty inputs', () => {
      assert.equal(cleanQrCodeString(), '');
      assert.equal(cleanQrCodeString(null), '');
      assert.equal(cleanQrCodeString('   '), '');
    });

    it('strips markdown code fences (```json ... ```)', () => {
      const input = '```json\n{"gid":"test"}\n```';
      assert.equal(cleanQrCodeString(input), '{"gid":"test"}');
    });

    it('normalizes smart curly quotes to standard double quotes', () => {
      const input = '{\u201Cgid\u201D: \u201Ctest123\u201D}';
      assert.equal(cleanQrCodeString(input), '{"gid": "test123"}');
    });

    it('extracts JSON substring when scanner app prepends or appends text', () => {
      const input = 'Scanned Result: {"gid":"123","seed":"abc"} (Length: 32)';
      assert.equal(cleanQrCodeString(input), '{"gid":"123","seed":"abc"}');
    });
  });

  describe('parseQrCode()', () => {
    it('successfully parses valid QR code payload', () => {
      const res = parseQrCode(JSON.stringify(validQr));
      assert.equal(res.ok, true);
      assert.equal(res.data.gid, validQr.gid);
      assert.equal(res.expiresInMinutes, null);
    });

    it('successfully calculates expiresInMinutes for valid future expiration', () => {
      const qr = { ...validQr, exp: 2000000000 }; // 2.0e9 seconds
      const now = 1700000000000;
      const res = parseQrCode(JSON.stringify(qr), now);
      assert.equal(res.ok, true);
      assert.ok(res.expiresInMinutes > 0);
    });

    it('returns descriptive hint when JSON is truncated (missing closing brace)', () => {
      const truncated = '{"gid":"58350ccd-edb1-42a2-bece-33e8e8a27b79","seed":"123"';
      const res = parseQrCode(truncated);
      assert.equal(res.ok, false);
      assert.match(res.error, /Malformed JSON/);
      assert.match(res.hint, /missing the closing "}"/);
    });

    it('returns error when payload is an array instead of an object', () => {
      const res = parseQrCode('[1, 2, 3]');
      assert.equal(res.ok, false);
      assert.match(res.error, /must be a JSON object/);
    });

    it('returns error with missing field names listed', () => {
      const missing = { gid: '123' };
      const res = parseQrCode(JSON.stringify(missing));
      assert.equal(res.ok, false);
      assert.match(res.error, /Missing required field\(s\): "seed", "license", "ek", "ipaddress"/);
    });

    it('returns error with elapsed minutes for expired QR code', () => {
      const qr = { ...validQr, exp: 1700000000 };
      const now = 1700000600000; // 10 minutes later
      const res = parseQrCode(JSON.stringify(qr), now);
      assert.equal(res.ok, false);
      assert.match(res.error, /expired 10 minute\(s\) ago/);
      assert.match(res.hint, /Toggle "Allow Additional Pairing" OFF and ON/);
    });
  });

  describe('validateQrCode()', () => {
    it('returns true for valid QR code', () => {
      assert.equal(validateQrCode(JSON.stringify(validQr)), true);
    });

    it('returns error string with troubleshooting tip on failure', () => {
      const res = validateQrCode('not json');
      assert.match(res, /Malformed JSON/);
      assert.match(res, /💡 Tip:/);
    });
  });

  describe('formatDetailedError()', () => {
    it('formats plain string errors directly', () => {
      assert.equal(formatDetailedError('sample error'), 'sample error');
    });

    it('formats Error instance with message and code', () => {
      const err = new Error('connection timed out');
      err.code = 'ETIMEDOUT';
      const formatted = formatDetailedError(err);
      assert.match(formatted, /Message: connection timed out/);
      assert.match(formatted, /Code: ETIMEDOUT/);
    });

    it('formats object error like { code: 400, data: {} } without displaying as empty {}', () => {
      const err = { code: 400, data: {} };
      const formatted = formatDetailedError(err);
      assert.match(formatted, /Code: 400/);
      assert.match(formatted, /"code": 400/);
    });

    it('handles null/undefined gracefully', () => {
      assert.equal(formatDetailedError(null), 'Unknown error');
      assert.equal(formatDetailedError(undefined), 'Unknown error');
    });
  });

  describe('createFWGroup()', () => {
    it('constructs FWGroup using fallback when no symmetric keys decryptable', () => {
      const mockGroup = {
        _id: 'test-gid',
        eid: 'test-eid',
        aid: 'test-aid',
        name: 'Firewalla Box',
        symmetricKeys: [{ key: 'fake-cipher-1' }, { key: 'fake-cipher-2' }],
      };
      const group = createFWGroup(mockGroup, '192.168.1.1');
      assert.equal(group.gid, 'test-gid');
      assert.equal(group.symmetricKeyCipher, 'fake-cipher-1');
      assert.equal(group.localIp, '192.168.1.1');
    });
  });
});
