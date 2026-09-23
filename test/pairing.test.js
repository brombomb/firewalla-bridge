import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQrCodeString, parseQrCode, validateQrCode } from '../src/utils/pairing.js';

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
});
