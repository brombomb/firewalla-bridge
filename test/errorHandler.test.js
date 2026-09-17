import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler, asyncHandler } from '../src/middleware/errorHandler.js';

describe('Error Handling Middleware (src/middleware/errorHandler.js)', () => {
  describe('asyncHandler()', () => {
    it('executes synchronous handlers normally without calling next with an error', async () => {
      let executed = false;
      const fn = (req, res, next) => {
        executed = true;
      };
      const wrapped = asyncHandler(fn);
      let nextCalledWith = null;

      await wrapped({}, {}, (err) => {
        nextCalledWith = err;
      });

      assert.equal(executed, true);
      assert.equal(nextCalledWith, null);
    });

    it('executes successful asynchronous handlers normally', async () => {
      let executed = false;
      const fn = async (req, res, next) => {
        await new Promise((r) => setTimeout(r, 10));
        executed = true;
      };
      const wrapped = asyncHandler(fn);
      let nextCalledWith = null;

      await wrapped({}, {}, (err) => {
        nextCalledWith = err;
      });

      assert.equal(executed, true);
      assert.equal(nextCalledWith, null);
    });

    it('[REL-01 Regression] catches rejected async promises and forwards to next(err)', async () => {
      const expectedError = new Error('Async network timeout failure');
      const fn = async () => {
        throw expectedError;
      };
      const wrapped = asyncHandler(fn);
      let caughtError = null;

      await new Promise((resolve) => {
        wrapped({}, {}, (err) => {
          caughtError = err;
          resolve();
        });
      });

      assert.equal(caughtError, expectedError);
    });
  });

  describe('errorHandler()', () => {
    // Suppress console.error logging during intentional error tests
    const origConsoleError = console.error;
    let consoleErrors = [];

    beforeEach(() => {
      consoleErrors = [];
      console.error = (...args) => consoleErrors.push(args);
    });

    afterEach(() => {
      console.error = origConsoleError;
    });

    it('returns 500 JSON payload for standard errors', () => {
      const err = new Error('Database connection failed');
      const req = { method: 'GET', url: '/v2/boxes' };
      let statusCode = 0;
      let jsonPayload = null;

      const res = {
        headersSent: false,
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          jsonPayload = payload;
          return this;
        },
      };

      errorHandler(err, req, res, () => {});

      assert.equal(statusCode, 500);
      assert.equal(jsonPayload.error, 'Error');
      assert.equal(jsonPayload.message, 'Database connection failed');
    });

    it('respects custom error status code if provided on error object', () => {
      const err = new Error('Not Found');
      err.status = 404;
      const req = { method: 'GET', url: '/v2/unknown' };
      let statusCode = 0;

      const res = {
        headersSent: false,
        status(code) {
          statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      };

      errorHandler(err, req, res, () => {});
      assert.equal(statusCode, 404);
    });

    it('delegates to next(err) if headers were already sent', () => {
      const err = new Error('Late streaming failure');
      const req = { method: 'GET', url: '/stream' };
      let nextCalledWith = null;

      const res = {
        headersSent: true,
      };

      errorHandler(err, req, res, (e) => {
        nextCalledWith = e;
      });

      assert.equal(nextCalledWith, err);
    });
  });
});
