// 연구비 집행 CRUD (과제 전용, 비목별)
const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['project_id', 'category', 'item_name', 'planned_amount', 'executed_amount',
  'exec_date', 'vendor', 'year_no', 'note'];

router.get('/', (req, res) => {
  if (!req.query.project_id) return res.json([]);
  res.json(db.prepare('SELECT * FROM research_costs WHERE project_id=? ORDER BY id').all(req.query.project_id));
});
router.post('/', (req, res) => {
  const vals = FIELDS.map(f => req.body[f] ?? null);
  const r = db.prepare(`INSERT INTO research_costs (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...vals);
  res.json({ id: r.lastInsertRowid });
});
router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE research_costs SET ${sets} WHERE id=?`).run(...FIELDS.map(f => req.body[f] ?? null), req.params.id);
  res.json({ ok: true });
});
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM research_costs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
