import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBandwidthSummary, formatBandwidthHistory } from '../src/utils/bandwidth.js';

describe('Bandwidth Utilities (src/utils/bandwidth.js)', () => {
  describe('calculateBandwidthSummary()', () => {
    it('handles empty or undefined inputs safely without throwing', () => {
      const summary = calculateBandwidthSummary();
      assert.deepEqual(summary.current, {
        timestamp: 0,
        downloadMbps: 0,
        uploadMbps: 0,
        downloadBytesPerSecond: 0,
        uploadBytesPerSecond: 0,
      });
      assert.deepEqual(summary.last60Minutes, {
        totalDownloadBytes: 0,
        totalUploadBytes: 0,
        averageDownloadMbps: 0,
        averageUploadMbps: 0,
      });
      assert.deepEqual(summary.monthly, {
        totalDownloadBytes: 0,
        totalUploadBytes: 0,
        monthlyBeginTs: 0,
        monthlyEndTs: 0,
      });
      assert.deepEqual(summary.devices, {
        totalDownloadBytes: 0,
        totalUploadBytes: 0,
      });
    });

    it('calculates current rate, 60m stats, and monthly stats accurately', () => {
      const mockInitData = {
        last60: {
          download: [
            [1700000000, 10000000],
            [1700000060, 15000000], // 15MB in 60s = 250,000 B/s = 2.00 Mbps
          ],
          upload: [
            [1700000000, 5000000],
            [1700000060, 7500000], // 7.5MB in 60s = 125,000 B/s = 1.00 Mbps
          ],
          totalDownload: 1000000000, // 1GB in 3600s
          totalUpload: 500000000,
        },
        monthlyDataUsage: {
          totalDownload: 500000000000,
          totalUpload: 200000000000,
          monthlyBeginTs: 1698796800,
          monthlyEndTs: 1701388800,
        },
      };

      const mockHosts = [
        { flowsummary: { inbytes: 1000, outbytes: 500 } },
        { flowsummary: { inbytes: 2000, outbytes: 1500 } },
      ];

      const summary = calculateBandwidthSummary(mockInitData, mockHosts);

      assert.equal(summary.current.timestamp, 1700000060);
      assert.equal(summary.current.downloadMbps, 2);
      assert.equal(summary.current.uploadMbps, 1);
      assert.equal(summary.current.downloadBytesPerSecond, 250000);
      assert.equal(summary.current.uploadBytesPerSecond, 125000);

      assert.equal(summary.last60Minutes.totalDownloadBytes, 1000000000);
      assert.equal(summary.last60Minutes.totalUploadBytes, 500000000);
      assert.equal(summary.last60Minutes.averageDownloadMbps, 2.22); // (1e9 * 8) / 3600 / 1e6
      assert.equal(summary.last60Minutes.averageUploadMbps, 1.11);

      assert.equal(summary.monthly.totalDownloadBytes, 500000000000);
      assert.equal(summary.monthly.totalUploadBytes, 200000000000);
      assert.equal(summary.monthly.monthlyBeginTs, 1698796800);
      assert.equal(summary.monthly.monthlyEndTs, 1701388800);

      assert.equal(summary.devices.totalDownloadBytes, 3000);
      assert.equal(summary.devices.totalUploadBytes, 2000);
    });
  });

  describe('formatBandwidthHistory()', () => {
    it('returns empty array when no last60 buckets are present', () => {
      const history = formatBandwidthHistory({});
      assert.deepEqual(history, []);
    });

    it('merges download and upload buckets by timestamp in chronological order', () => {
      const mockInitData = {
        last60: {
          download: [
            [1700000000, 12000000],
            [1700000060, 24000000],
          ],
          upload: [
            [1700000000, 6000000],
            [1700000060, 3000000],
          ],
        },
      };

      const history = formatBandwidthHistory(mockInitData);
      assert.equal(history.length, 2);

      assert.deepEqual(history[0], {
        timestamp: 1700000000,
        downloadBytes: 12000000,
        uploadBytes: 6000000,
        downloadMbps: 1.6,
        uploadMbps: 0.8,
        downloadBytesPerSecond: 200000,
        uploadBytesPerSecond: 100000,
      });

      assert.deepEqual(history[1], {
        timestamp: 1700000060,
        downloadBytes: 24000000,
        uploadBytes: 3000000,
        downloadMbps: 3.2,
        uploadMbps: 0.4,
        downloadBytesPerSecond: 400000,
        uploadBytesPerSecond: 50000,
      });
    });
  });
});
