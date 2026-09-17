import crypto from 'crypto';

/**
 * Validates a token in constant time using SHA-256 hashes to prevent timing side-channel attacks.
 * @param {string} token
 * @param {string} expectedToken
 * @returns {boolean}
 */
export function isTokenValid(token, expectedToken) {
  if (!token || !expectedToken) return false;
  const hash1 = crypto.createHash('sha256').update(String(token)).digest();
  const hash2 = crypto.createHash('sha256').update(String(expectedToken)).digest();
  return crypto.timingSafeEqual(hash1, hash2);
}

/**
 * Checks whether the request has valid credentials if API_TOKEN is configured.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isAuthenticated(req) {
  const expectedToken = (process.env.API_TOKEN || '').trim();
  if (!expectedToken) {
    return true;
  }

  const authHeader = req.headers.authorization || '';
  let token = '';

  if (authHeader.startsWith('Token ')) {
    token = authHeader.slice(6).trim();
  } else if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  return isTokenValid(token, expectedToken);
}

/**
 * Optional API Token authentication middleware.
 * If API_TOKEN is configured in environment, requests to protected endpoints require
 * a valid authorization header:
 * - Authorization: Token <your_token> (matches official MSP format)
 * - Authorization: Bearer <your_token>
 */
export function authMiddleware(req, res, next) {
  const expectedToken = (process.env.API_TOKEN || '').trim();

  // If no token is set in environment, allow all requests (open LAN mode)
  if (!expectedToken) {
    return next();
  }

  // Allow root path, health check, documentation, favicon, and OpenAPI spec through middleware
  if (
    req.path === '/' ||
    req.path === '/health' ||
    req.path === '/docs' ||
    req.path === '/favicon.ico' ||
    req.path === '/openapi.json' ||
    req.path === '/swagger.json'
  ) {
    return next();
  }

  if (isAuthenticated(req)) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Invalid or missing API token. Provide header "Authorization: Token <your_token>".',
  });
}
