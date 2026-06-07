const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['project_id','category','affiliation','name','position','start_date','end_date','participation_rate','effort_mm','total_days','standard_price','internal_cost','discount_rate','internal_total'];

router.get('/', (req, res) => {
  const { project_id } = req.query;
  const where = project_id ? 'WHERE project_id = ?' : '';
  const params = project_id ? [project_id] : [];
  res.json(db.prepare(`SELECT * FROM project_resources ${where} ORDER BY id`).all(...params));
});

router.post('/', (req, res) => {
  const values = FIELDS.map(f => req.body[f] ?? null);
  const result = db.prepare(`INSERT INTO project_resources (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...values);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  const values = FIELDS.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE project_resources SET ${sets} WHERE id=?`).run(...values, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM project_resources WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
