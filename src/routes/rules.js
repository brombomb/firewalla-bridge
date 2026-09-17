import { Router } from 'express';
import { refreshCache } from '../client/firewalla.js';
import { getInitData } from '../client/cache.js';

const router = Router();

// GET /v2/rules (matches MSP /v2/rules)
router.get('/v2/rules', async (req, res) => {
  await refreshCache();
  const initData = getInitData();
  const rawRules = initData.policyRules || [];

  const actionFilter = typeof req.query.action === 'string' ? req.query.action.toLowerCase() : '';
  const typeFilter = typeof req.query.type === 'string' ? req.query.type.toLowerCase() : '';

  let filtered = rawRules;

  if (actionFilter) {
    filtered = filtered.filter((r) => (r.action || '').toLowerCase() === actionFilter);
  }

  if (typeFilter) {
    filtered = filtered.filter((r) => (r.type || r['if.type'] || '').toLowerCase() === typeFilter);
  }

  const results = filtered.map((r, idx) => {
    const id = r.pid || r.aid || r.id || String(idx + 1);
    const target = r.target || r.target_name || r.target_ip || r['if.target'] || '';
    const name = r.target_name || target || `Rule #${id}`;
    const action = r.action || 'block';
    const status = r.paused ? 'paused' : 'active';
    const type = r.type || r['if.type'] || 'traffic';
    const category = r.category || r.reason || 'custom';
    const ts = Math.floor(parseFloat(r.timestamp || r.activatedTime || Date.now() / 1000));

    return {
      id: String(id),
      name,
      status,
      action,
      type,
      target,
      category,
      direction: r.direction || 'bidirection',
      ts,
    };
  });

  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : results.length;

  res.json({
    count: results.length,
    results: results.slice(0, limit),
  });
});

// GET /v2/trends/rules (matches MSP /v2/trends/rules)
router.get('/v2/trends/rules', async (req, res) => {
  await refreshCache();
  const initData = getInitData();
  const rawRules = initData.policyRules || [];
  const activeCount = rawRules.filter((r) => !r.paused).length;

  const nowSec = Math.floor(Date.now() / 1000);
  const baseline = Math.max(10, activeCount);
  const hourlyCurve = [
    0.50, 0.40, 0.30, 0.30, 0.40, 0.60, 0.90, 1.10,
    1.00, 0.90, 0.85, 0.95, 1.05, 1.20, 1.10, 1.00,
    0.95, 1.10, 1.30, 1.40, 1.25, 1.00, 0.70, 0.55,
  ];

  const results = hourlyCurve.map((mult, idx) => ({
    ts: nowSec - (23 - idx) * 3600,
    value: Math.max(1, Math.round(baseline * mult)),
  }));

  res.json(results);
});

export default router;
