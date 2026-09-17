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

  const nowSec = Math.floor(Date.now() / 1000);
  const hourlyCounts = new Array(24).fill(0);

  // Group real rule activations by timestamp into 24 one-hour buckets
  for (const r of rawRules) {
    const ts = parseFloat(r.lastActivatedTime || r.activatedTime || r.timestamp || 0);
    if (!ts) continue;
    const hoursAgo = Math.floor((nowSec - ts) / 3600);
    if (hoursAgo >= 0 && hoursAgo < 24) {
      hourlyCounts[23 - hoursAgo]++;
    }
  }

  const results = hourlyCounts.map((count, idx) => ({
    ts: nowSec - (23 - idx) * 3600,
    value: count,
  }));

  res.json(results);
});

export default router;
