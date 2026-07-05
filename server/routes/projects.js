const express = require('express');
const db = require('../db');
const router = express.Router();

const PROJECT_FIELDS = [
  'project_code', 'project_name', 'project_type_id', 'status', 'division_id',
  'manager_id', 'pm_id', 'sales_rep_id', 'proposal_deadline',
  'customer_id', 'customer_contact', 'prime_contractor',
  'business_year', 'start_date', 'end_date',
  'total_budget', 'participation_type', 'total_purchase', 'tech_support_date',
  'participation_rate', 'participation_amount', 'win_probability',
  'expected_revenue', 'actual_revenue',
  'has_solution', 'sw_registered', 'competitor', 'intro_channel', 'overview',
  'is_favorite', 'top_domain', 'sub_domain',
  'y2023','y2024','y2025','y2026','y2027','y2028','y2029','y2030'
];

function buildWhere(q) {
  const where = [];
  const params = [];
  const add = (cond, ...vals) => { where.push(cond); params.push(...vals); };

  // 기준년도 필터: 사업년도가 일치하거나, 해당 연도에 매출/매입 거래가 발생한 프로젝트를 포함
  // → 회계연도 관점에서 누락 없이 대시보드와 합계가 일치하도록 함
  if (q.year) add(
    '(p.business_year = ? OR IFNULL(ys.year_sales,0) > 0 OR IFNULL(yp.year_purchase,0) > 0)',
    q.year
  );
  if (q.division_id)       add('p.division_id = ?', q.division_id);
  if (q.status)            add('p.status = ?', q.status);
  if (q.statuses)          { const arr = q.statuses.split(','); add(`p.status IN (${arr.map(()=>'?').join(',')})`, ...arr); }
  if (q.keyword)           add('(p.project_name LIKE ? OR p.project_code LIKE ?)', `%${q.keyword}%`, `%${q.keyword}%`);
  if (q.project_code)      add('p.project_code LIKE ?', `%${q.project_code}%`);
  if (q.project_name)      add('p.project_name LIKE ?', `%${q.project_name}%`);
  if (q.customer_keyword)  add('c.name LIKE ?', `%${q.customer_keyword}%`);
  if (q.customer_id)       add('p.customer_id = ?', q.customer_id);
  if (q.prime_contractor)  add('p.prime_contractor LIKE ?', `%${q.prime_contractor}%`);
  if (q.sales_rep_id)      add('p.sales_rep_id = ?', q.sales_rep_id);
  if (q.manager_id)        add('p.manager_id = ?', q.manager_id);
  if (q.pm_id)             add('p.pm_id = ?', q.pm_id);
  if (q.staff_id)          add('(p.manager_id = ? OR p.pm_id = ? OR p.sales_rep_id = ?)', q.staff_id, q.staff_id, q.staff_id);
  if (q.intro_channel)     add('p.intro_channel LIKE ?', `%${q.intro_channel}%`);
  if (q.participation_type)add('p.participation_type = ?', q.participation_type);
  if (q.project_type_id)   add('p.project_type_id = ?', q.project_type_id);
  if (q.has_solution)      add('p.has_solution = ?', q.has_solution);
  if (q.sw_only === '1')   add("p.sw_registered = 'Y'");
  if (q.exclude_internal === '1') add('IFNULL(pt.is_internal,0) = 0');
  if (q.favorite_only === '1') add('p.is_favorite = 1');
  if (q.solution_id)       add('EXISTS (SELECT 1 FROM project_solutions ps WHERE ps.project_id = p.id AND ps.solution_id = ?)', q.solution_id);
  // 당해 매출 또는 매입이 있는 프로젝트만 (ys / yp는 BASE_SELECT의 LEFT JOIN 알리아스)
  if (q.has_transactions === '1') {
    add('(IFNULL(ys.year_sales, 0) > 0 OR IFNULL(yp.year_purchase, 0) > 0)');
  }

  return { where, params };
}

// year_sales: 해당 연도 계산서 발행일자 기준 매출 합
// year_purchase: 해당 연도 계산서 발행일자 기준 매입 합
const YEAR_JOIN_SQL = `
  LEFT JOIN (
    SELECT project_id, SUM(sales_amount) AS year_sales
    FROM project_sales WHERE strftime('%Y', invoice_date) = ?
    GROUP BY project_id
  ) ys ON ys.project_id = p.id
  LEFT JOIN (
    SELECT project_id, SUM(purchase_amount) AS year_purchase
    FROM project_purchases WHERE strftime('%Y', invoice_date) = ?
    GROUP BY project_id
  ) yp ON yp.project_id = p.id`;

const BASE_SELECT = `
  SELECT p.*, d.name AS division_name, c.name AS customer_name,
         pt.name AS project_type_name, pt.is_internal AS type_is_internal,
         um.name AS manager_name, up.name AS pm_name, us.name AS sales_rep_name,
         COALESCE(ys.year_sales, 0)   AS year_sales,
         COALESCE(yp.year_purchase,0) AS year_purchase
  FROM projects p
  LEFT JOIN divisions d ON p.division_id = d.id
  LEFT JOIN customers c ON p.customer_id = c.id
  LEFT JOIN project_types pt ON p.project_type_id = pt.id
  LEFT JOIN users um ON p.manager_id = um.id
  LEFT JOIN users up ON p.pm_id = up.id
  LEFT JOIN users us ON p.sales_rep_id = us.id
  ${YEAR_JOIN_SQL}`;

function yearOrCurrent(req) {
  return req.query.year ? String(req.query.year) : String(new Date().getFullYear());
}

router.get('/', (req, res) => {
  const { where, params } = buildWhere(req.query);
  const yr = yearOrCurrent(req);
  const sql = `${BASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.is_favorite DESC, p.start_date DESC, p.id DESC`;
  res.json(db.prepare(sql).all(yr, yr, ...params));
});

// 합계 + 상태별 건수
router.get('/aggregate', (req, res) => {
  const { where, params } = buildWhere(req.query);
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const yr = yearOrCurrent(req);
  const yearCol = req.query.year ? `y${parseInt(req.query.year, 10)}` : null;
  const yearAmountCol = (yearCol && /^y\d{4}$/.test(yearCol)) ? `COALESCE(SUM(p.${yearCol}),0)` : `0`;
  const join = `FROM projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN project_types pt ON p.project_type_id = pt.id
    ${YEAR_JOIN_SQL}`;
  const totals = db.prepare(`SELECT
      COUNT(*) AS cnt,
      COALESCE(SUM(p.total_budget),0)          AS total_budget,
      COALESCE(SUM(p.participation_amount),0)  AS participation_amount,
      ${yearAmountCol}                          AS year_amount,
      COALESCE(SUM(ys.year_sales),0)            AS year_sales,
      COALESCE(SUM(yp.year_purchase),0)         AS year_purchase,
      COALESCE(SUM(p.expected_revenue),0)      AS expected_revenue,
      COALESCE(SUM(p.actual_revenue),0)        AS actual_revenue
    ${join} ${whereClause}`).get(yr, yr, ...params);
  // 상태별 카운트 - has_transactions 같은 필터에서 ys/yp 별칭을 쓰므로 동일 JOIN 사용
  const statusJoin = `FROM projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN project_types pt ON p.project_type_id = pt.id
    ${YEAR_JOIN_SQL}`;
  const statusRows = db.prepare(`SELECT p.status, COUNT(*) AS cnt ${statusJoin} ${whereClause} GROUP BY p.status`).all(yr, yr, ...params);
  res.json({ totals, statuses: statusRows });
});

router.get('/:id', (req, res) => {
  const yr = yearOrCurrent(req);
  const sql = `${BASE_SELECT} WHERE p.id = ?`;
  const row = db.prepare(sql).get(yr, yr, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// 프로젝트 코드 자동 생성: {유형코드}{YY}{일련번호3} (예: P26001)
function generateProjectCode(typeId, year) {
  let prefix = 'P';
  if (typeId) {
    const t = db.prepare('SELECT code FROM project_types WHERE id=?').get(typeId);
    if (t && t.code) prefix = String(t.code).trim().toUpperCase();
  }
  const yy = String((Number(year) || new Date().getFullYear()) % 100).padStart(2, '0');
  const base = `${prefix}${yy}`;
  const rows = db.prepare('SELECT project_code FROM projects WHERE project_code LIKE ?').all(base + '%');
  let max = 0;
  for (const r of rows) {
    const m = String(r.project_code).slice(base.length).match(/^(\d+)/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${base}${String(max + 1).padStart(3, '0')}`;
}

router.post('/', (req, res) => {
  const body = { ...req.body };
  // 코드 미입력 시 자동 부여 (충돌 시 다음 번호로 재시도)
  if (!body.project_code || !String(body.project_code).trim()) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateProjectCode(body.project_type_id, body.business_year);
      const dup = db.prepare('SELECT 1 FROM projects WHERE project_code=?').get(code);
      if (!dup) { body.project_code = code; break; }
    }
  }
  const values = PROJECT_FIELDS.map(f => body[f] ?? null);
  const placeholders = PROJECT_FIELDS.map(() => '?').join(',');
  const result = db.prepare(`INSERT INTO projects (${PROJECT_FIELDS.join(',')}) VALUES (${placeholders})`).run(...values);
  res.json({ id: result.lastInsertRowid, project_code: body.project_code });
});

router.put('/:id', (req, res) => {
  const sets = PROJECT_FIELDS.map(f => `${f}=?`).join(',');
  const values = PROJECT_FIELDS.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE projects SET ${sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values, req.params.id);
  res.json({ ok: true });
});

router.patch('/:id/status', (req, res) => {
  db.prepare('UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

router.patch('/:id/favorite', (req, res) => {
  db.prepare('UPDATE projects SET is_favorite=? WHERE id=?').run(req.body.is_favorite ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 프로젝트 통합 일정 (제안마감/사업기간/매출/매입/활동/투입/솔루션 설치)
router.get('/:id/schedule', (req, res) => {
  const id = req.params.id;
  const proj = db.prepare(`
    SELECT project_code, project_name, proposal_deadline, start_date, end_date, tech_support_date
    FROM projects WHERE id=?
  `).get(id);
  if (!proj) return res.status(404).json({ error: 'Not found' });

  const events = [];
  const push = (date, type, title, color, extra = {}) => {
    if (!date) return;
    events.push({ date: String(date).slice(0, 10), type, title, color, ...extra });
  };

  // 1) 프로젝트 자체 일정
  push(proj.proposal_deadline, '마감', '제안 마감일', '#dc2626', { category: 'deadline' });
  push(proj.start_date,        '수행', '사업 시작',   '#2563eb', { category: 'p_start' });
  push(proj.end_date,          '수행', '사업 종료',   '#1d4ed8', { category: 'p_end' });
  push(proj.tech_support_date, '기술', '기술지원확약서', '#a855f7', { category: 'tech' });

  // 2) 매출 - 세금계산서 발행일 / 입금(예정)일
  db.prepare('SELECT * FROM project_sales WHERE project_id=?').all(id).forEach(s => {
    const salesDetail = {
      invoice_date: s.invoice_date, invoice_issued: s.invoice_issued,
      sales_amount: s.sales_amount, unpaid_balance: s.unpaid_balance,
      collection_type: s.collection_type, cash_or_note: s.cash_or_note,
      payment_due_date: s.payment_due_date, paid: s.paid, notes: s.notes
    };
    push(s.invoice_date, '매출', `세금계산서 발행`, '#16a34a',
      { category: 'sales_invoice', source_id: s.id, amount: s.sales_amount, paid: s.paid, detail: salesDetail });
    push(s.payment_due_date, '매출', `입금 ${s.paid==='Y'?'완료':'예정'}`,
      s.paid==='Y' ? '#22c55e' : '#eab308',
      { category: 'sales_due', source_id: s.id, amount: s.sales_amount, paid: s.paid, detail: salesDetail });
  });

  // 3) 매입 - 세금계산서 발행일 / 지급(예정)일
  db.prepare('SELECT * FROM project_purchases WHERE project_id=?').all(id).forEach(p => {
    const purcDetail = {
      purchase_code: p.purchase_code, vendor: p.vendor, description: p.description,
      purchase_amount: p.purchase_amount,
      invoice_date: p.invoice_date, invoice_issued: p.invoice_issued, invoice_number: p.invoice_number,
      payment_due_date: p.payment_due_date, paid: p.paid
    };
    push(p.invoice_date, '매입', `세금계산서 발행 (${p.vendor || ''})`, '#f97316',
      { category: 'purc_invoice', source_id: p.id, amount: p.purchase_amount, paid: p.paid, detail: purcDetail });
    push(p.payment_due_date, '매입', `${p.purchase_code || '지급'} ${p.paid==='Y'?'완료':'예정'} (${p.vendor || ''})`,
      p.paid==='Y' ? '#0891b2' : '#fb923c',
      { category: 'purc_due', source_id: p.id, amount: p.purchase_amount, paid: p.paid, detail: purcDetail });
  });

  // 4) 활동
  db.prepare(`
    SELECT a.*, u.name AS creator_name
    FROM activities a LEFT JOIN users u ON a.created_by = u.id
    WHERE a.project_id=?
  `).all(id).forEach(a => {
    push(a.activity_date, '활동', `${a.category || ''} ${a.title || ''}`.trim() || '활동', '#ec4899',
      { category: 'activity', source_id: a.id, detail: {
        category_orig: a.category, title: a.title, content: a.content,
        post_win_rate: a.post_win_rate, creator_name: a.creator_name
      }});
  });

  // 5) 솔루션 설치확인일
  db.prepare(`
    SELECT ps.*, s.name AS solution_name, s.vendor AS solution_vendor
    FROM project_solutions ps LEFT JOIN solutions s ON ps.solution_id=s.id
    WHERE ps.project_id=?
  `).all(id).forEach(s => {
    push(s.install_date, '솔루션', `${s.solution_name || ''} 설치`, '#64748b',
      { category: 'install', source_id: s.id, amount: s.delivery_amount, detail: {
        solution_name: s.solution_name, solution_vendor: s.solution_vendor,
        spec: s.spec, quantity: s.quantity,
        standard_price: s.standard_price, internal_cost: s.internal_cost,
        discount_rate: s.discount_rate, delivery_amount: s.delivery_amount,
        contract_issued: s.contract_issued, notes: s.notes
      }});
  });

  // 6) 투입 시작/철수
  db.prepare('SELECT * FROM project_resources WHERE project_id=?').all(id).forEach(r => {
    const resDetail = {
      category_orig: r.category, affiliation: r.affiliation, name: r.name, position: r.position,
      start_date: r.start_date, end_date: r.end_date,
      participation_rate: r.participation_rate, effort_mm: r.effort_mm, total_days: r.total_days,
      standard_price: r.standard_price, internal_cost: r.internal_cost,
      discount_rate: r.discount_rate, internal_total: r.internal_total
    };
    push(r.start_date, '투입', `${r.name || ''}(${r.category || ''}) 투입`, '#92400e',
      { category: 'res_start', source_id: r.id, detail: resDetail });
    push(r.end_date, '투입', `${r.name || ''}(${r.category || ''}) 철수`, '#a16207',
      { category: 'res_end', source_id: r.id, detail: resDetail });
  });

  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  res.json(events);
});

// 프로젝트 연도별 매출/매입 합계 (invoice_date 기준)
router.get('/:id/yearly-breakdown', (req, res) => {
  const id = req.params.id;
  const sales = db.prepare(`
    SELECT strftime('%Y', invoice_date) AS year, SUM(sales_amount) AS amount
    FROM project_sales
    WHERE project_id=? AND invoice_date IS NOT NULL
    GROUP BY year
  `).all(id);
  const purc = db.prepare(`
    SELECT strftime('%Y', invoice_date) AS year, SUM(purchase_amount) AS amount
    FROM project_purchases
    WHERE project_id=? AND invoice_date IS NOT NULL
    GROUP BY year
  `).all(id);
  const years = new Set();
  sales.forEach(r => r.year && years.add(r.year));
  purc.forEach(r => r.year && years.add(r.year));
  const salesMap = Object.fromEntries(sales.map(r => [r.year, r.amount]));
  const purcMap = Object.fromEntries(purc.map(r => [r.year, r.amount]));
  const rows = Array.from(years).sort().map(y => ({
    year: Number(y),
    sales: salesMap[y] || 0,
    purchase: purcMap[y] || 0,
    profit: (salesMap[y] || 0) - (purcMap[y] || 0)
  }));
  res.json(rows);
});

router.get('/:id/summary', (req, res) => {
  const id = req.params.id;
  const sales = db.prepare('SELECT COALESCE(SUM(sales_amount),0) AS s, COALESCE(SUM(total_amount),0) AS t, COALESCE(SUM(unpaid_balance),0) AS unpaid FROM project_sales WHERE project_id=?').get(id);
  const purc = db.prepare('SELECT COALESCE(SUM(purchase_amount),0) AS p, COALESCE(SUM(total_amount),0) AS t FROM project_purchases WHERE project_id=?').get(id);
  const sol = db.prepare('SELECT COALESCE(SUM(delivery_amount),0) AS d, COALESCE(SUM(internal_cost*quantity),0) AS cost FROM project_solutions WHERE project_id=?').get(id);
  res.json({
    sales_total: sales.s, sales_with_vat: sales.t, unpaid: sales.unpaid,
    purchase_total: purc.p, purchase_with_vat: purc.t,
    solution_delivery: sol.d, solution_cost: sol.cost,
    gross_profit: (sales.s || 0) - (purc.p || 0)
  });
});

module.exports = router;
