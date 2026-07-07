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

// 전 인력 월별 과제 참여율 매트릭스 (사업연도 기준, 직원별 합산)
router.get('/participation-matrix', (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const rows = db.prepare(`
    SELECT rm.name, rm.employee_number, rm.org, rm.position, rm.role,
      rm.m1,rm.m2,rm.m3,rm.m4,rm.m5,rm.m6,rm.m7,rm.m8,rm.m9,rm.m10,rm.m11,rm.m12,
      p.id AS pid, p.project_code, p.project_name
    FROM research_members rm JOIN projects p ON rm.project_id = p.id
    WHERE p.business_year = ?`).all(year);
  const uStmt = db.prepare('SELECT hq, position, active, division_id FROM users WHERE employee_number=? LIMIT 1');
  const map = new Map();
  for (const r of rows) {
    const key = r.employee_number ? ('E:' + r.employee_number) : ('N:' + (r.name || ''));
    let g = map.get(key);
    if (!g) g = map.set(key, { key, employee_number: r.employee_number || null, name: r.name || '', org: r.org || '', position: r.position || '', months: Array(12).fill(0), projects: [] }).get(key);
    const pm = [];
    for (let i = 1; i <= 12; i++) { const v = r['m' + i] || 0; g.months[i - 1] += v; pm.push(v); }
    g.projects.push({ project_id: r.pid, project_code: r.project_code, project_name: r.project_name, role: r.role, m: pm });
  }
  const out = [...map.values()].map(g => {
    let active = 1, hq = g.org, pos = g.position, division_id = null;
    if (g.employee_number) { const u = uStmt.get(g.employee_number); if (u) { active = u.active; hq = u.hq || g.org; pos = u.position || g.position; division_id = u.division_id; } }
    const months = g.months.map(v => Math.round(v * 10) / 10);
    return { key: g.key, employee_number: g.employee_number, name: g.name, org: hq || '', position: pos || '', active, division_id,
      months, maxMonth: months.length ? Math.max(...months) : 0, avg: Math.round(months.reduce((s, v) => s + v, 0) / 12 * 10) / 10,
      projectCount: g.projects.length, projects: g.projects };
  });
  out.sort((a, b) => b.maxMonth - a.maxMonth || (a.name || '').localeCompare(b.name || '', 'ko'));
  res.json({ year, rows: out });
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
