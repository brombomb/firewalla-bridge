/**
 * Optional API Token authentication middleware.
 * If API_TOKEN is configured in environment, requests to /v2/* require
 * a valid authorization header:
 * - Authorization: Token <your_token> (matches official MSP format)
 * - Authorization: Bearer <your_token>
 * - or query parameter: ?token=<your_token>
 */
export function authMiddleware(req, res, next) {
  const expectedToken = (process.env.API_TOKEN || '').trim();

  // If no token is set in environment, allow all requests (open LAN mode)
  if (!expectedToken) {
    return next();
  }

  // Allow root dashboard and health check without token
  if (req.path === '/' || req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  let token = '';

  if (authHeader.startsWith('Token ')) {
    token = authHeader.slice(6).trim();
  } else if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (token && token === expectedToken) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Invalid or missing API token. Provide header "Authorization: Token <your_token>".',
  });
}
