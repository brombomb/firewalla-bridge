import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isTokenValid, isAuthenticated, authMiddleware } from '../src/middleware/auth.js';

describe('Authentication Middleware (src/middleware/auth.js)', () => {
  describe('isTokenValid()', () => {
    it('returns true when token matches expected token', () => {
      assert.equal(isTokenValid('super-secret-token-123', 'super-secret-token-123'), true);
    });

    it('returns false when tokens differ', () => {
      assert.equal(isTokenValid('wrong-token', 'super-secret-token-123'), false);
    });

    it('returns false for empty or null inputs', () => {
      assert.equal(isTokenValid('', 'secret'), false);
      assert.equal(isTokenValid('secret', ''), false);
      assert.equal(isTokenValid(null, 'secret'), false);
      assert.equal(isTokenValid(undefined, undefined), false);
    });

    it('handles different length tokens safely without timing or buffer length errors', () => {
      assert.equal(isTokenValid('short', 'a-very-long-token-string-here'), false);
      assert.equal(isTokenValid('a-very-long-token-string-here', 'short'), false);
    });
  });

  describe('isAuthenticated() & authMiddleware', () => {
    const originalEnv = process.env.API_TOKEN;

    afterEach(() => {
      process.env.API_TOKEN = originalEnv;
    });

    it('returns true when API_TOKEN is unset in environment (open LAN mode)', () => {
      delete process.env.API_TOKEN;
      const req = { headers: {} };
      assert.equal(isAuthenticated(req), true);
    });

    it('authenticates valid "Authorization: Token <token>" header', () => {
      process.env.API_TOKEN = 'test-token';
      const req = {
        headers: { authorization: 'Token test-token' },
      };
      assert.equal(isAuthenticated(req), true);
    });

    it('authenticates valid "Authorization: Bearer <token>" header', () => {
      process.env.API_TOKEN = 'test-token';
      const req = {
        headers: { authorization: 'Bearer test-token' },
      };
      assert.equal(isAuthenticated(req), true);
    });

    it('rejects invalid authorization tokens', () => {
      process.env.API_TOKEN = 'test-token';
      const req = {
        headers: { authorization: 'Token incorrect-token' },
      };
      assert.equal(isAuthenticated(req), false);
    });

    it('[SEC-04 Regression] does NOT authenticate via ?token= query parameter', () => {
      process.env.API_TOKEN = 'test-token';
      const req = {
        headers: {},
        query: { token: 'test-token' },
      };
      assert.equal(isAuthenticated(req), false);
    });

    it('authMiddleware passes through /, /health, /docs, /favicon.ico, /openapi.json, and /swagger.json unauthenticated', () => {
      process.env.API_TOKEN = 'test-token';
      const paths = ['/', '/health', '/docs', '/favicon.ico', '/openapi.json', '/swagger.json'];
      for (const p of paths) {
        let nextCalled = false;
        authMiddleware({ path: p, headers: {} }, {}, () => {
          nextCalled = true;
        });
        assert.equal(nextCalled, true, `Expected ${p} to pass through authMiddleware unauthenticated`);
      }
    });

    it('authMiddleware rejects protected endpoints with 401 when unauthenticated', () => {
      process.env.API_TOKEN = 'test-token';
      let statusResult = null;
      let jsonResult = null;
      const req = { path: '/v2/devices', headers: {} };
      const res = {
        status(code) {
          statusResult = code;
          return this;
        },
        json(payload) {
          jsonResult = payload;
          return this;
        },
      };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      assert.equal(nextCalled, false);
      assert.equal(statusResult, 401);
      assert.equal(jsonResult.error, 'Unauthorized');
    });
  });
});
