import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateQrCode } from '../src/utils/pairing.js';

describe('Pairing Utilities (src/utils/pairing.js)', () => {
  const validQr = {
    gid: '58350ccd-edb1-42a2-bece-33e8e8a27b79',
    seed: '12345678abcdef',
    license: 'abcdef1234567890',
    ek: 'encrypted_rendezvous_key_base64',
    ipaddress: '192.168.1.1',
  };

  it('accepts valid QR code JSON without exp field', () => {
    const res = validateQrCode(JSON.stringify(validQr));
    assert.equal(res, true);
  });

  it('accepts valid QR code JSON with unexpired timestamp (seconds)', () => {
    const qr = { ...validQr, exp: 2000000000 };
    const now = 1700000000000; // earlier than year 2033
    const res = validateQrCode(JSON.stringify(qr), now);
    assert.equal(res, true);
  });

  it('accepts valid QR code JSON with unexpired timestamp (scientific notation)', () => {
    const qr = { ...validQr, exp: 2.0e9 };
    const now = 1700000000000;
    const res = validateQrCode(JSON.stringify(qr), now);
    assert.equal(res, true);
  });

  it('detects and rejects expired QR code timestamp', () => {
    const qr = { ...validQr, exp: 1700000000 }; // 1.7e9 seconds
    const now = 1700000600000; // 10 minutes later
    const res = validateQrCode(JSON.stringify(qr), now);
    assert.match(res, /⚠️ QR code expired 10 minute\(s\) ago/);
  });

  it('rejects missing required fields', () => {
    const missingGid = { ...validQr };
    delete missingGid.gid;
    assert.match(validateQrCode(JSON.stringify(missingGid)), /Missing field "gid"/);

    const missingEk = { ...validQr };
    delete missingEk.ek;
    assert.match(validateQrCode(JSON.stringify(missingEk)), /Missing field "ek"/);
  });

  it('rejects empty or malformed input', () => {
    assert.match(validateQrCode(''), /cannot be empty/);
    assert.match(validateQrCode('not json'), /valid JSON/);
    assert.match(validateQrCode('123'), /JSON object/);
  });
});
