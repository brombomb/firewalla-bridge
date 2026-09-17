import express from 'express';
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

const app = express();
const PORT = process.env.PORT || 7153;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

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

// Global error handling
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`==============================================`);
  console.log(`  Firewalla Local Bridge running on port ${PORT}`);
  console.log(`  Target Box: ${FIREWALLA_IP}`);
  if (process.env.API_TOKEN) {
    console.log(`  🔒 Authentication: ENABLED (API_TOKEN set)`);
  } else {
    console.log(`  🔓 Authentication: DISABLED (LAN open mode)`);
  }
  console.log(`==============================================`);
  await initFirewalla();
});
