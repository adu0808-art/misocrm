// 과제(정부 지원 과제) 관리 — projects 테이블의 project_type code='G' 레코드 사용
const express = require('express');
const db = require('../db');
const router = express.Router();

// 과제로 쓰는 projects 컬럼 (상용 프로젝트와 공유하되 과제 관점 필드)
const RESEARCH_FIELDS = [
  'project_name', 'division_id', 'manager_id', 'pm_id',
  'customer_id', 'prime_contractor', 'specialized_agency',
  'business_year', 'start_date', 'end_date',
  'total_budget', 'gov_fund', 'private_cash', 'private_inkind',
  'research_stage', 'research_year_no', 'research_total_years', 'overview'
];

function researchTypeId() {
  const t = db.prepare("SELECT id FROM project_types WHERE code='G'").get();
  return t ? t.id : null;
}

// 과제번호 자동 생성 (G{YY}{일련번호3})
function generateCode(year) {
  const yy = String((Number(year) || new Date().getFullYear()) % 100).padStart(2, '0');
  const base = `G${yy}`;
  const rows = db.prepare('SELECT project_code FROM projects WHERE project_code LIKE ?').all(base + '%');
  let max = 0;
  for (const r of rows) {
    const m = String(r.project_code).slice(base.length).match(/^(\d+)/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${base}${String(max + 1).padStart(3, '0')}`;
}

const BASE_SELECT = `
  SELECT p.*, d.name AS division_name, c.name AS customer_name,
    um.name AS manager_name, up.name AS lead_name,
    (SELECT COUNT(*) FROM research_members rm WHERE rm.project_id=p.id) AS member_count,
    (SELECT COALESCE(SUM(executed_amount),0) FROM research_costs rc WHERE rc.project_id=p.id) AS cost_executed,
    (SELECT COALESCE(SUM(planned_amount),0)  FROM research_costs rc WHERE rc.project_id=p.id) AS cost_planned,
    (SELECT COALESCE(SUM(sales_amount),0)    FROM project_sales ps WHERE ps.project_id=p.id) AS funds_received
  FROM projects p
  LEFT JOIN divisions d ON p.division_id = d.id
  LEFT JOIN customers c ON p.customer_id = c.id
  LEFT JOIN users um ON p.manager_id = um.id
  LEFT JOIN users up ON p.pm_id = up.id
  LEFT JOIN project_types pt ON p.project_type_id = pt.id
  WHERE pt.code='G'`;

router.get('/', (req, res) => {
  const q = req.query;
  const yr = String(q.year || new Date().getFullYear());
  // 당해 연도 연구비(수급) = 해당 연도 발행 project_sales 합계
  const listSelect = `
    SELECT p.*, d.name AS division_name, c.name AS customer_name,
      um.name AS manager_name, up.name AS lead_name,
      (SELECT COUNT(*) FROM research_members rm WHERE rm.project_id=p.id) AS member_count,
      (SELECT COALESCE(SUM(executed_amount),0) FROM research_costs rc WHERE rc.project_id=p.id) AS cost_executed,
      (SELECT COALESCE(SUM(planned_amount),0)  FROM research_costs rc WHERE rc.project_id=p.id) AS cost_planned,
      (SELECT COALESCE(SUM(sales_amount),0)    FROM project_sales ps WHERE ps.project_id=p.id) AS funds_received,
      (SELECT COALESCE(SUM(sales_amount),0)    FROM project_sales ps WHERE ps.project_id=p.id AND substr(ps.invoice_date,1,4)=?) AS year_funds
    FROM projects p
    LEFT JOIN divisions d ON p.division_id = d.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users um ON p.manager_id = um.id
    LEFT JOIN users up ON p.pm_id = up.id
    LEFT JOIN project_types pt ON p.project_type_id = pt.id
    WHERE pt.code='G'`;
  const cond = [], params = [yr];
  if (q.year) {
    cond.push("(p.business_year = ? OR (substr(p.start_date,1,4) <= ? AND substr(p.end_date,1,4) >= ?))");
    params.push(q.year, String(q.year), String(q.year));
  }
  if (q.division_id) { cond.push('p.division_id = ?'); params.push(q.division_id); }
  const stageList = (q.stages ? q.stages.split(',') : (q.stage ? [q.stage] : [])).filter(Boolean);
  if (stageList.length) {
    const real = stageList.filter(s => s !== '__none__');
    const parts = [];
    if (real.length) parts.push(`p.research_stage IN (${real.map(() => '?').join(',')})`);
    if (stageList.includes('__none__')) parts.push('p.research_stage IS NULL');
    cond.push('(' + parts.join(' OR ') + ')'); real.forEach(s => params.push(s));
  }
  if (q.keyword)     { cond.push('(p.project_name LIKE ? OR p.project_code LIKE ?)'); params.push(`%${q.keyword}%`, `%${q.keyword}%`); }
  const where = cond.length ? ' AND ' + cond.join(' AND ') : '';
  const rows = db.prepare(`${listSelect}${where} ORDER BY p.business_year DESC, p.project_code DESC`).all(...params);
  res.json(rows);
});

router.get('/aggregate', (req, res) => {
  const q = req.query;
  const yr = String(q.year || new Date().getFullYear());
  const cond = [], params = [];
  if (q.year) {
    cond.push("(p.business_year = ? OR (substr(p.start_date,1,4) <= ? AND substr(p.end_date,1,4) >= ?))");
    params.push(q.year, String(q.year), String(q.year));
  }
  if (q.division_id) { cond.push('p.division_id = ?'); params.push(q.division_id); }
  const where = cond.length ? ' AND ' + cond.join(' AND ') : '';
  const stages = db.prepare(`
    SELECT COALESCE(p.research_stage,'미지정') AS stage, COUNT(*) AS cnt
    FROM projects p JOIN project_types pt ON p.project_type_id=pt.id
    WHERE pt.code='G'${where} GROUP BY COALESCE(p.research_stage,'미지정')
  `).all(...params);
  const totals = db.prepare(`
    SELECT COUNT(*) AS cnt,
      COALESCE(SUM(p.total_budget),0) AS total_budget,
      COALESCE(SUM(p.gov_fund),0) AS gov_fund,
      COALESCE(SUM((SELECT COALESCE(SUM(executed_amount),0) FROM research_costs rc WHERE rc.project_id=p.id)),0) AS cost_executed,
      COALESCE(SUM((SELECT COALESCE(SUM(sales_amount),0) FROM project_sales ps WHERE ps.project_id=p.id)),0) AS funds_received,
      COALESCE(SUM((SELECT COALESCE(SUM(sales_amount),0) FROM project_sales ps WHERE ps.project_id=p.id AND substr(ps.invoice_date,1,4)=?)),0) AS year_funds
    FROM projects p JOIN project_types pt ON p.project_type_id=pt.id
    WHERE pt.code='G'${where}
  `).get(yr, ...params);
  res.json({ stages, totals });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`${BASE_SELECT} AND p.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const typeId = researchTypeId();
  if (!typeId) return res.status(400).json({ error: "프로젝트 유형 'G'(정부 지원 과제)가 없습니다." });
  const body = { ...req.body };
  const year = body.business_year || new Date().getFullYear();
  let code = body.project_code && String(body.project_code).trim();
  if (!code) {
    for (let i = 0; i < 20; i++) { const c = generateCode(year); if (!db.prepare('SELECT 1 FROM projects WHERE project_code=?').get(c)) { code = c; break; } }
  }
  const cols = ['project_code', 'project_type_id', 'status', ...RESEARCH_FIELDS];
  const vals = [code, typeId, body.status || '수행중', ...RESEARCH_FIELDS.map(f => body[f] ?? null)];
  const r = db.prepare(`INSERT INTO projects (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...vals);
  res.json({ id: r.lastInsertRowid, project_code: code });
});

router.put('/:id', (req, res) => {
  const body = req.body || {};
  const sets = RESEARCH_FIELDS.map(f => `${f}=?`).join(',');
  const vals = RESEARCH_FIELDS.map(f => body[f] ?? null);
  db.prepare(`UPDATE projects SET ${sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...vals, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
