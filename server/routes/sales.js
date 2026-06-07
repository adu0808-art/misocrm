const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['project_id','invoice_date','invoice_issued','sales_amount','vat','total_amount','unpaid_balance','collection_type','cash_or_note','payment_due_date','paid','notes'];

router.get('/', (req, res) => {
  const { project_id } = req.query;
  const where = project_id ? 'WHERE project_id = ?' : '';
  const params = project_id ? [project_id] : [];
  res.json(db.prepare(`SELECT * FROM project_sales ${where} ORDER BY invoice_date DESC, id DESC`).all(...params));
});

router.post('/', (req, res) => {
  const values = FIELDS.map(f => req.body[f] ?? null);
  const result = db.prepare(`INSERT INTO project_sales (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...values);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  const values = FIELDS.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE project_sales SET ${sets} WHERE id=?`).run(...values, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM project_sales WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
