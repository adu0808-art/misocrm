// 연구 참여인력 CRUD (과제 전용)
const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['project_id', 'name', 'org', 'role', 'position', 'participation_rate',
  'start_date', 'end_date', 'annual_cost', 'labor_cost', 'note', 'employee_number',
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];

router.get('/', (req, res) => {
  if (!req.query.project_id) return res.json([]);
  res.json(db.prepare('SELECT * FROM research_members WHERE project_id=? ORDER BY id').all(req.query.project_id));
});

// 직원의 월별 참여율 배정/잔여 현황 (같은 사업연도 모든 과제 합산)
router.get('/allocation', (req, res) => {
  const { employee_number, name, year } = req.query;
  if (!employee_number && !name) return res.json({ months: [], projects: [] });
  const where = employee_number ? 'rm.employee_number = ?' : 'rm.name = ?';
  const params = [employee_number || name];
  let yearClause = '';
  if (year) { yearClause = ' AND p.business_year = ?'; params.push(Number(year)); }
  const rows = db.prepare(`
    SELECT rm.*, p.id AS pid, p.project_code, p.project_name, p.business_year
    FROM research_members rm JOIN projects p ON rm.project_id = p.id
    WHERE ${where}${yearClause}
    ORDER BY p.project_code`).all(...params);
  const alloc = Array(12).fill(0);
  const projects = rows.map(r => {
    const m = [];
    for (let i = 1; i <= 12; i++) { const v = r['m' + i] || 0; alloc[i - 1] += v; m.push(v); }
    return { project_id: r.pid, project_code: r.project_code, project_name: r.project_name, m };
  });
  const round1 = n => Math.round(n * 10) / 10;
  const months = alloc.map((a, i) => ({ month: i + 1, allocated: round1(a), remaining: round1(100 - a) }));
  res.json({ employee_number: employee_number || null, name: name || null, year: year || null, months, projects });
});
router.post('/', (req, res) => {
  const vals = FIELDS.map(f => req.body[f] ?? null);
  const r = db.prepare(`INSERT INTO research_members (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...vals);
  res.json({ id: r.lastInsertRowid });
});
router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE research_members SET ${sets} WHERE id=?`).run(...FIELDS.map(f => req.body[f] ?? null), req.params.id);
  res.json({ ok: true });
});
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM research_members WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
