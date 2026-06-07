const express = require('express');
const db = require('../db');
const router = express.Router();

function crud(table, fields, options = {}) {
  const r = express.Router();
  const sortBy = options.sortBy || 'id';
  const selectExtras = options.selectExtras || '';

  r.get('/', (req, res) => {
    const rows = db.prepare(`SELECT t.* ${selectExtras} FROM ${table} t ${options.join || ''} ORDER BY ${sortBy}`).all();
    res.json(rows);
  });

  r.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT t.* ${selectExtras} FROM ${table} t ${options.join || ''} WHERE t.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  r.post('/', (req, res) => {
    const values = fields.map(f => req.body[f] ?? null);
    const placeholders = fields.map(() => '?').join(',');
    const result = db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`).run(...values);
    res.json({ id: result.lastInsertRowid });
  });

  r.put('/:id', (req, res) => {
    const sets = fields.map(f => `${f}=?`).join(',');
    const values = fields.map(f => req.body[f] ?? null);
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id=?`).run(...values, req.params.id);
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    try {
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: '참조 중인 데이터가 있어 삭제할 수 없습니다.' });
    }
  });

  return r;
}

router.use('/divisions', crud('divisions',
  ['code', 'name', 'sort_order', 'active'], { sortBy: 't.sort_order, t.id' }));

router.use('/users', crud('users',
  ['username', 'name', 'division_id', 'role', 'email', 'phone', 'active']));

router.use('/customers', crud('customers', [
  'name', 'contact_person', 'phone', 'email', 'address', 'detail_address',
  'industry', 'legal_type', 'business_no', 'corp_no',
  'top_domain', 'sub_domain', 'biz_type', 'biz_category',
  'ceo_name', 'ceo_phone', 'fax', 'notes'
]));

router.use('/project-types', crud('project_types',
  ['code', 'name', 'sort_order', 'is_internal'], { sortBy: 't.sort_order, t.id' }));

router.use('/solutions', crud('solutions', [
  'code', 'name', 'vendor', 'spec',
  'base_consumer_price', 'recommended_price', 'standard_price', 'max_discount',
  'cogs', 'internal_cost', 'is_sellable', 'is_internal', 'sales_division_id',
  'notes', 'active'
], {
  join: 'LEFT JOIN divisions d ON t.sales_division_id = d.id',
  selectExtras: ', d.name AS sales_division_name'
}));

module.exports = router;
