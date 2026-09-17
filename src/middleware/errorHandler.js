/**
 * Global error handling middleware.
 */
export function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.url}:`, err.message || err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
  });
}
