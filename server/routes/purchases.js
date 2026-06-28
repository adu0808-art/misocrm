const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['project_id','purchase_code','payment_due_date','purchase_amount','vat','total_amount','vendor','description','invoice_number','invoice_issued','invoice_date','paid'];

router.get('/', (req, res) => {
  const { project_id } = req.query;
  const where = project_id ? 'WHERE project_id = ?' : '';
  const params = project_id ? [project_id] : [];
  res.json(db.prepare(`SELECT * FROM project_purchases ${where} ORDER BY payment_due_date DESC, id DESC`).all(...params));
});

router.post('/', (req, res) => {
  const values = FIELDS.map(f => req.body[f] ?? null);
  const result = db.prepare(`INSERT INTO project_purchases (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...values);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  const values = FIELDS.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE project_purchases SET ${sets} WHERE id=?`).run(...values, req.params.id);
  res.json({ ok: true });
});

// 실지급여부 빠른 토글 (자금현황에서 사용)
router.patch('/:id/paid', (req, res) => {
  const paid = req.body.paid === 'Y' ? 'Y' : 'N';
  db.prepare('UPDATE project_purchases SET paid=? WHERE id=?').run(paid, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM project_purchases WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
