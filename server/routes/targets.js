const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const { year } = req.query;
  const where = year ? 'WHERE t.year = ?' : '';
  const params = year ? [year] : [];
  const sql = `SELECT t.*, d.name AS division_name, d.code AS division_code, d.sort_order
               FROM sales_targets t LEFT JOIN divisions d ON t.division_id = d.id
               ${where} ORDER BY t.year DESC, d.sort_order, d.id`;
  res.json(db.prepare(sql).all(...params));
});

router.post('/upsert', (req, res) => {
  const { year, division_id, target_revenue, target_profit, memo } = req.body;
  const exist = db.prepare('SELECT id FROM sales_targets WHERE year=? AND division_id=?').get(year, division_id);
  if (exist) {
    db.prepare('UPDATE sales_targets SET target_revenue=?, target_profit=?, memo=? WHERE id=?')
      .run(target_revenue || 0, target_profit || 0, memo || null, exist.id);
    res.json({ id: exist.id, updated: true });
  } else {
    const r = db.prepare('INSERT INTO sales_targets (year,division_id,target_revenue,target_profit,memo) VALUES (?,?,?,?,?)')
      .run(year, division_id, target_revenue || 0, target_profit || 0, memo || null);
    res.json({ id: r.lastInsertRowid, created: true });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sales_targets WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/years', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT year FROM sales_targets ORDER BY year DESC').all();
  res.json(rows.map(r => r.year));
});

module.exports = router;
