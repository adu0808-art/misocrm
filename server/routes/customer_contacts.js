const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['customer_id','name','position','department','phone','mobile','email','is_primary','notes'];

router.get('/', (req, res) => {
  const { customer_id } = req.query;
  const where = customer_id ? 'WHERE customer_id = ?' : '';
  const params = customer_id ? [customer_id] : [];
  res.json(db.prepare(`SELECT * FROM customer_contacts ${where} ORDER BY is_primary DESC, id`).all(...params));
});

router.post('/', (req, res) => {
  const values = FIELDS.map(f => req.body[f] ?? null);
  const result = db.prepare(
    `INSERT INTO customer_contacts (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`
  ).run(...values);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  const values = FIELDS.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE customer_contacts SET ${sets} WHERE id=?`).run(...values, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM customer_contacts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
