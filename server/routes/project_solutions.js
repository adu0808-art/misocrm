const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['project_id','solution_id','spec','standard_price','quantity','internal_cost','discount_rate','delivery_amount','install_date','contract_issued','notes'];

router.get('/', (req, res) => {
  const { project_id } = req.query;
  const where = project_id ? 'WHERE ps.project_id = ?' : '';
  const params = project_id ? [project_id] : [];
  const sql = `SELECT ps.*, s.name AS solution_name FROM project_solutions ps
               LEFT JOIN solutions s ON ps.solution_id = s.id
               ${where} ORDER BY ps.id DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const values = FIELDS.map(f => req.body[f] ?? null);
  const result = db.prepare(`INSERT INTO project_solutions (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...values);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  const values = FIELDS.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE project_solutions SET ${sets} WHERE id=?`).run(...values, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM project_solutions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
