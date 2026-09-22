import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initFirewalla, FIREWALLA_IP } from './client/firewalla.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route modules
import indexRoutes from './routes/index.js';
import boxesRoutes from './routes/boxes.js';
import alarmsRoutes from './routes/alarms.js';
import flowsRoutes from './routes/flows.js';
import devicesRoutes from './routes/devices.js';
import rulesRoutes from './routes/rules.js';
import speedtestRoutes from './routes/speedtest.js';
import bandwidthRoutes from './routes/bandwidth.js';

const app = express();
const PORT = process.env.PORT || 7153;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CORS middleware (applies to all endpoints including static assets)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Static files (dashboard HTML/CSS/assets and openapi.json)
app.use(express.static(path.resolve(__dirname, '../public')));

// Authentication middleware (validates API_TOKEN if configured)
app.use(authMiddleware);

// API routes
app.use('/', indexRoutes);
app.use('/', boxesRoutes);
app.use('/', alarmsRoutes);
app.use('/', flowsRoutes);
app.use('/', devicesRoutes);
app.use('/', rulesRoutes);
app.use('/', speedtestRoutes);
app.use('/', bandwidthRoutes);

// Global error handling
app.use(errorHandler);

// Start server
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`==============================================`);
  console.log(`  Firewalla Local Bridge running on port ${PORT}`);
  console.log(`  Target Box: ${FIREWALLA_IP}`);
  console.log(`  CORS Origin: ${CORS_ORIGIN}`);
  if (process.env.API_TOKEN) {
    console.log(`  🔒 Authentication: ENABLED (API_TOKEN set)`);
  } else {
    console.log(`  🔓 Authentication: DISABLED (LAN open mode)`);
  }
  console.log(`==============================================`);
  await initFirewalla();
});

// Graceful shutdown handling for container PID 1 lifecycle
const shutdown = (signal) => {
  console.log(`\nReceived ${signal}, closing server gracefully...`);
  server.close(() => {
    console.log('HTTP server closed successfully.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close server in time, forcing exit.');
    process.exit(1);
  }, 5000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
