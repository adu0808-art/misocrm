const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const { year } = req.query;
  const where = year ? 'WHERE e.year = ?' : '';
  const params = year ? [year] : [];
  const sql = `SELECT e.*, d.name AS division_name, d.code AS division_code, d.sort_order
               FROM division_expenses e LEFT JOIN divisions d ON e.division_id = d.id
               ${where} ORDER BY e.year DESC, d.sort_order, d.id`;
  res.json(db.prepare(sql).all(...params));
});

router.post('/upsert', (req, res) => {
  const { year, division_id, sga, common_cost, memo } = req.body;
  const exist = db.prepare('SELECT id FROM division_expenses WHERE year=? AND division_id=?').get(year, division_id);
  if (exist) {
    db.prepare('UPDATE division_expenses SET sga=?, common_cost=?, memo=? WHERE id=?')
      .run(sga || 0, common_cost || 0, memo || null, exist.id);
    res.json({ id: exist.id, updated: true });
  } else {
    const r = db.prepare('INSERT INTO division_expenses (year,division_id,sga,common_cost,memo) VALUES (?,?,?,?,?)')
      .run(year, division_id, sga || 0, common_cost || 0, memo || null);
    res.json({ id: r.lastInsertRowid, created: true });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM division_expenses WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// 월별 판관비/공통비
// ============================================================
router.get('/monthly', (req, res) => {
  const { year, division_id } = req.query;
  const where = [];
  const params = [];
  if (year)        { where.push('year = ?'); params.push(year); }
  if (division_id) { where.push('division_id = ?'); params.push(division_id); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT m.*, d.name AS division_name, d.code AS division_code
    FROM division_monthly_expenses m
    LEFT JOIN divisions d ON m.division_id = d.id
    ${w} ORDER BY year, division_id, month
  `).all(...params);
  res.json(rows);
});

function syncYearlyExpense(year, divId) {
  const r = db.prepare(`
    SELECT COALESCE(SUM(sga),0) AS sga, COALESCE(SUM(common_cost),0) AS common_cost
    FROM division_monthly_expenses WHERE year=? AND division_id=?
  `).get(year, divId);
  const exist = db.prepare('SELECT id FROM division_expenses WHERE year=? AND division_id=?').get(year, divId);
  if (exist) {
    db.prepare('UPDATE division_expenses SET sga=?, common_cost=? WHERE id=?').run(r.sga, r.common_cost, exist.id);
  } else {
    db.prepare('INSERT INTO division_expenses (year, division_id, sga, common_cost) VALUES (?,?,?,?)').run(year, divId, r.sga, r.common_cost);
  }
  return r;
}

// 단일 월 upsert
router.post('/monthly/upsert', (req, res) => {
  const { year, month, division_id, sga, common_cost } = req.body;
  if (!year || !month || !division_id) return res.status(400).json({ error: 'year/month/division_id 필수' });
  const exist = db.prepare('SELECT id FROM division_monthly_expenses WHERE year=? AND month=? AND division_id=?').get(year, month, division_id);
  if (exist) {
    db.prepare('UPDATE division_monthly_expenses SET sga=?, common_cost=? WHERE id=?').run(sga || 0, common_cost || 0, exist.id);
  } else {
    db.prepare('INSERT INTO division_monthly_expenses (year, month, division_id, sga, common_cost) VALUES (?,?,?,?,?)').run(year, month, division_id, sga || 0, common_cost || 0);
  }
  const summary = syncYearlyExpense(year, division_id);
  res.json({ ok: true, yearly: summary });
});

// 12개월 일괄 저장
router.post('/monthly/bulk', (req, res) => {
  const { year, division_id, months } = req.body;
  if (!year || !division_id || !Array.isArray(months)) return res.status(400).json({ error: 'year/division_id/months 필수' });
  const tx = db.transaction((y, did, arr) => {
    for (const m of arr) {
      if (!m.month || m.month < 1 || m.month > 12) continue;
      const exist = db.prepare('SELECT id FROM division_monthly_expenses WHERE year=? AND month=? AND division_id=?').get(y, m.month, did);
      if (exist) {
        db.prepare('UPDATE division_monthly_expenses SET sga=?, common_cost=? WHERE id=?').run(m.sga || 0, m.common_cost || 0, exist.id);
      } else {
        db.prepare('INSERT INTO division_monthly_expenses (year, month, division_id, sga, common_cost) VALUES (?,?,?,?,?)').run(y, m.month, did, m.sga || 0, m.common_cost || 0);
      }
    }
  });
  tx(year, division_id, months);
  const summary = syncYearlyExpense(year, division_id);
  res.json({ ok: true, yearly: summary });
});

module.exports = router;
