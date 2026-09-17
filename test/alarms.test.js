import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAlarmIgnored, getActiveAlarms } from '../src/utils/alarms.js';

describe('Alarm Utilities (src/utils/alarms.js)', () => {
  describe('isAlarmIgnored()', () => {
    it('returns false when no exception rules or app configurations exist', () => {
      const alarm = { type: 'MALWARE', message: 'Malware detected' };
      assert.equal(isAlarmIgnored(alarm, [], {}), false);
    });

    it('ignores alarm when app notifications are muted (features.disturb = true)', () => {
      const alarm = {
        type: 'APP_ALARM',
        'p.dest.app.id': 'tiktok',
      };
      const appConfs = {
        tiktok: { features: { disturb: true } },
      };
      assert.equal(isAlarmIgnored(alarm, [], appConfs), true);
    });

    it('does NOT ignore alarm when app disturb is false', () => {
      const alarm = {
        type: 'APP_ALARM',
        'p.dest.app.id': 'tiktok',
      };
      const appConfs = {
        tiktok: { features: { disturb: false } },
      };
      assert.equal(isAlarmIgnored(alarm, [], appConfs), false);
    });

    it('ignores alarm matching a DNS exception rule', () => {
      const alarm = {
        type: 'INTEL',
        'p.dest.domain': 'tracker.analytics.google.com',
        'p.device.mac': 'aa:bb:cc:dd:ee:ff',
      };
      const exceptionRules = [
        {
          type: 'INTEL',
          'p.device.mac': 'aa:bb:cc:dd:ee:ff',
          'if.type': 'dns',
          'if.target': 'google.com',
        },
      ];
      assert.equal(isAlarmIgnored(alarm, exceptionRules, {}), true);
    });

    it('[SEC-01 Regression] does NOT ignore direct-to-IP alarms when DNS rule exists', () => {
      // Direct-IP threats have empty or missing p.dest.domain and p.dest.name
      const alarm = {
        type: 'MALWARE',
        'p.dest.ip': '198.51.100.42',
        'p.device.mac': 'aa:bb:cc:dd:ee:ff',
      };
      const exceptionRules = [
        {
          type: 'MALWARE',
          'p.device.mac': 'aa:bb:cc:dd:ee:ff',
          'if.type': 'dns',
          'if.target': 'example.com',
        },
      ];
      // In vulnerable versions, 'example.com'.includes('') evaluated to true, dropping direct-IP alerts!
      assert.equal(isAlarmIgnored(alarm, exceptionRules, {}), false);
    });

    it('ignores alarm matching an IP exception rule', () => {
      const alarm = {
        type: 'OPENPORT',
        'p.dest.ip': '192.168.1.50',
      };
      const exceptionRules = [
        {
          type: 'OPENPORT',
          'if.type': 'ip',
          'if.target': '192.168.1.50',
        },
      ];
      assert.equal(isAlarmIgnored(alarm, exceptionRules, {}), true);
    });

    it('ignores alarm matching a MAC exception rule', () => {
      const alarm = {
        type: 'SPOOFING',
        'p.device.mac': '11:22:33:44:55:66',
      };
      const exceptionRules = [
        {
          type: 'SPOOFING',
          'if.type': 'mac',
          'if.target': '11:22:33:44:55:66',
        },
      ];
      assert.equal(isAlarmIgnored(alarm, exceptionRules, {}), true);
    });

    it('ignores alarm matching device tag or utag exception rules', () => {
      const alarm = {
        type: 'INTEL',
        'p.tag.ids': ['tag-iot'],
        'p.dest.domain': 'pool.ntp.org',
      };
      const exceptionRules = [
        {
          type: 'INTEL',
          'p.tag.ids': ['tag-iot'],
          'if.type': 'dns',
          'if.target': 'pool.ntp.org',
        },
      ];
      assert.equal(isAlarmIgnored(alarm, exceptionRules, {}), true);
    });
  });

  describe('getActiveAlarms()', () => {
    const rawAlarms = [
      { aid: '1', type: 'INTEL', message: 'Known botnet beacon blocked' },
      { aid: '2', type: 'VIDEO', message: 'YouTube streaming started' },
      { aid: '3', type: 'OPENPORT', message: 'Open port 22 found on LAN' },
      { aid: '4', type: 'GAMING', message: 'Roblox gaming detected', 'p.dest.app.id': 'roblox' },
    ];
    const appConfs = {
      roblox: { features: { disturb: true } }, // Muted
    };

    it('filters out muted/ignored alarms when filterSecurityOnly is false', () => {
      const active = getActiveAlarms(rawAlarms, [], appConfs, false);
      assert.equal(active.length, 3);
      assert.ok(!active.some((a) => a.aid === '4'));
    });

    it('filters to security-only threats when filterSecurityOnly is true', () => {
      const securityOnly = getActiveAlarms(rawAlarms, [], appConfs, true);
      assert.equal(securityOnly.length, 2);
      const aids = securityOnly.map((a) => a.aid);
      assert.deepEqual(aids, ['1', '3']);
    });
  });
});
