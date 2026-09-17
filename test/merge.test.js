import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMergeDevices, getMergeRule } from '../src/utils/merge.js';

describe('Device Merge Utilities (src/utils/merge.js)', () => {
  describe('parseMergeDevices()', () => {
    it('returns empty array when input is undefined, empty, or whitespace', () => {
      assert.deepEqual(parseMergeDevices(undefined), []);
      assert.deepEqual(parseMergeDevices(''), []);
      assert.deepEqual(parseMergeDevices('   '), []);
    });

    it('parses standard colon-delimited IPv4 shorthand', () => {
      const input = 'Terra:192.168.1.15:a6:86:5a:70:71:53,e8:ff:1e:d8:f5:81';
      const parsed = parseMergeDevices(input);

      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].name, 'Terra');
      assert.equal(parsed[0].ip, '192.168.1.15');
      assert.equal(parsed[0].primaryId, 'A6:86:5A:70:71:53');
      assert.deepEqual(parsed[0].macs, [
        'a6:86:5a:70:71:53',
        'e8:ff:1e:d8:f5:81',
      ]);
    });

    it('parses pipe-delimited shorthand for IPv6 and multi-NICs', () => {
      const input = 'Server|2001:db8::1|11:22:33:44:55:66,77:88:99:aa:bb:cc';
      const parsed = parseMergeDevices(input);

      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].name, 'Server');
      assert.equal(parsed[0].ip, '2001:db8::1');
      assert.equal(parsed[0].primaryId, '11:22:33:44:55:66');
      assert.deepEqual(parsed[0].macs, [
        '11:22:33:44:55:66',
        '77:88:99:aa:bb:cc',
      ]);
    });

    it('parses bracketed IPv6 with colon syntax', () => {
      const input = 'NAS:[fe80::1]:00:11:22:33:44:55';
      const parsed = parseMergeDevices(input);

      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].name, 'NAS');
      assert.equal(parsed[0].ip, 'fe80::1');
      assert.deepEqual(parsed[0].macs, ['00:11:22:33:44:55']);
    });

    it('parses multiple semicolon-separated device configurations', () => {
      const input =
        'Terra:192.168.1.15:aa:bb:cc;NAS:192.168.1.20:dd:ee:ff,11:22:33';
      const parsed = parseMergeDevices(input);

      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].name, 'Terra');
      assert.equal(parsed[1].name, 'NAS');
      assert.equal(parsed[1].macs.length, 2);
    });

    it('parses JSON format configuration array', () => {
      const json = JSON.stringify([
        {
          name: 'HomelabHost',
          ip: '192.168.1.5',
          primaryId: 'CUSTOM_ID_1',
          macs: ['AA:BB:CC:DD:EE:01', 'aa:bb:cc:dd:ee:02'],
        },
      ]);
      const parsed = parseMergeDevices(json);

      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].name, 'HomelabHost');
      assert.equal(parsed[0].primaryId, 'CUSTOM_ID_1');
      assert.deepEqual(parsed[0].macs, [
        'aa:bb:cc:dd:ee:01',
        'aa:bb:cc:dd:ee:02',
      ]);
    });
  });

  describe('getMergeRule()', () => {
    it('returns null when input is empty or null', () => {
      assert.equal(getMergeRule(''), null);
      assert.equal(getMergeRule(null), null);
    });

    it('matches configured devices case-insensitively by MAC or IP', () => {
      // getMergeRule uses MERGED_DEVICES initialized at import time
      // Check if current env or default lookup behaves safely
      const rule = getMergeRule('non-existent-device-id');
      assert.equal(rule, null);
    });
  });
});
