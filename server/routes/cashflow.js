// 자금현황 (현금흐름) - 수주완료 프로젝트 기준
//  · 받을 돈(미수금) = project_sales.paid='N' 의 매출금액 (입금예정일 기준)
//  · 줄 돈(미지급)   = project_purchases.paid='N' 의 매입금액 (지급예정일 기준)
//  · 들어온 돈/나간 돈 = paid='Y' (참고용 누적 실적)
const express = require('express');
const db = require('../db');
const router = express.Router();

const WON_STATUS = '수주완료';

// 공통 WHERE: 수주완료 프로젝트
//  ps/pp 별칭, p 별칭 사용
const SALES_BASE = `
  FROM project_sales s
  JOIN projects p ON s.project_id = p.id
  LEFT JOIN divisions d ON p.division_id = d.id
  WHERE p.status = '${WON_STATUS}'`;
const PURC_BASE = `
  FROM project_purchases pu
  JOIN projects p ON pu.project_id = p.id
  LEFT JOIN divisions d ON p.division_id = d.id
  WHERE p.status = '${WON_STATUS}'`;

// 선택 가능한 연도 목록 (미수/미지급의 결제예정일 기준)
function availableYears() {
  const rows = db.prepare(`
    SELECT DISTINCT y FROM (
      SELECT substr(s.payment_due_date,1,4) AS y ${SALES_BASE} AND s.paid='N' AND s.payment_due_date IS NOT NULL AND s.payment_due_date != ''
      UNION
      SELECT substr(pu.payment_due_date,1,4) AS y ${PURC_BASE} AND pu.paid='N' AND pu.payment_due_date IS NOT NULL AND pu.payment_due_date != ''
    ) WHERE y IS NOT NULL AND y != '' ORDER BY y DESC
  `).all();
  return rows.map(r => Number(r.y)).filter(Boolean);
}

// 요약: KPI + 월별 + 본부별  (year 선택 시 결제예정일 연도 기준 필터)
router.get('/summary', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const year = req.query.year ? String(parseInt(req.query.year, 10)) : '';
  // 연도 필터 조건 (선택 시: 결제예정일 연도 일치)
  const sYear = year ? ` AND substr(s.payment_due_date,1,4) = '${year}'` : '';
  const pYear = year ? ` AND substr(pu.payment_due_date,1,4) = '${year}'` : '';

  // ---- KPI ----
  const recv = db.prepare(`
    SELECT
      COALESCE(SUM(s.sales_amount),0) AS total,
      COALESCE(SUM(CASE WHEN s.payment_due_date IS NOT NULL AND s.payment_due_date < ? THEN s.sales_amount ELSE 0 END),0) AS overdue,
      COUNT(*) AS cnt
    ${SALES_BASE} AND s.paid='N'${sYear}
  `).get(today);

  const pay = db.prepare(`
    SELECT
      COALESCE(SUM(pu.purchase_amount),0) AS total,
      COALESCE(SUM(CASE WHEN pu.payment_due_date IS NOT NULL AND pu.payment_due_date < ? THEN pu.purchase_amount ELSE 0 END),0) AS overdue,
      COUNT(*) AS cnt
    ${PURC_BASE} AND pu.paid='N'${pYear}
  `).get(today);

  // 누적 실적 (이미 들어온/나간) - 입금/지급일이 없으니 발행일자 연도 기준
  const sDoneYear = year ? ` AND substr(s.invoice_date,1,4) = '${year}'` : '';
  const pDoneYear = year ? ` AND substr(pu.invoice_date,1,4) = '${year}'` : '';
  const recvDone = db.prepare(`SELECT COALESCE(SUM(s.sales_amount),0) AS total ${SALES_BASE} AND s.paid='Y'${sDoneYear}`).get();
  const payDone  = db.prepare(`SELECT COALESCE(SUM(pu.purchase_amount),0) AS total ${PURC_BASE} AND pu.paid='Y'${pDoneYear}`).get();

  // ---- 월별 현금흐름 (미수/미지급, 예정일 기준) ----
  const recvMonthly = db.prepare(`
    SELECT substr(s.payment_due_date,1,7) AS ym, COALESCE(SUM(s.sales_amount),0) AS amount, COUNT(*) AS cnt
    ${SALES_BASE} AND s.paid='N' AND s.payment_due_date IS NOT NULL AND s.payment_due_date != ''${sYear}
    GROUP BY ym
  `).all();
  const payMonthly = db.prepare(`
    SELECT substr(pu.payment_due_date,1,7) AS ym, COALESCE(SUM(pu.purchase_amount),0) AS amount, COUNT(*) AS cnt
    ${PURC_BASE} AND pu.paid='N' AND pu.payment_due_date IS NOT NULL AND pu.payment_due_date != ''${pYear}
    GROUP BY ym
  `).all();

  // ---- 운영비(판관비+공통비) : division_monthly_expenses (연도 필터) ----
  const opexWhere = year ? ` WHERE m.year = ${parseInt(year,10)}` : '';
  const opexMonthlyRows = db.prepare(`
    SELECT m.year AS y, m.month AS mo, COALESCE(SUM(m.sga + m.common_cost),0) AS amount
    FROM division_monthly_expenses m ${opexWhere}
    GROUP BY m.year, m.month
  `).all();
  const opexByYm = {};
  opexMonthlyRows.forEach(r => {
    const ym = String(r.y) + '-' + String(r.mo).padStart(2,'0');
    opexByYm[ym] = (opexByYm[ym] || 0) + r.amount;
  });
  const opexTotal = opexMonthlyRows.reduce((s,r)=>s+r.amount,0);

  // ---- 월별 현금흐름 (미수/미지급 + 운영비, 예정일 기준) ----
  const monthsSet = new Set([...recvMonthly.map(r=>r.ym), ...payMonthly.map(r=>r.ym), ...Object.keys(opexByYm)].filter(Boolean));
  const rM = Object.fromEntries(recvMonthly.map(r=>[r.ym, r]));
  const pM = Object.fromEntries(payMonthly.map(r=>[r.ym, r]));
  const curYm = today.slice(0,7);
  const monthly = Array.from(monthsSet).sort().map(ym => {
    const inflow = rM[ym]?.amount || 0;
    const purc = pM[ym]?.amount || 0;
    const opex = opexByYm[ym] || 0;
    const outflow = purc + opex;             // 나갈 돈 = 미지급 매입 + 운영비
    return {
      ym,
      inflow, purchase: purc, opex, outflow,
      net: inflow - outflow,
      inflow_cnt: rM[ym]?.cnt || 0,
      outflow_cnt: pM[ym]?.cnt || 0,
      is_past: ym < curYm,
      is_current: ym === curYm
    };
  });
  // 누적 순현금
  let cum = 0;
  monthly.forEach(m => { cum += m.net; m.cumulative = cum; });

  // ---- 일별 현금흐름 (운영비는 매월 1일에 귀속) ----
  const recvDaily = db.prepare(`
    SELECT s.payment_due_date AS d, COALESCE(SUM(s.sales_amount),0) AS amount, COUNT(*) AS cnt
    ${SALES_BASE} AND s.paid='N' AND s.payment_due_date IS NOT NULL AND s.payment_due_date != ''${sYear}
    GROUP BY s.payment_due_date
  `).all();
  const payDaily = db.prepare(`
    SELECT pu.payment_due_date AS d, COALESCE(SUM(pu.purchase_amount),0) AS amount, COUNT(*) AS cnt
    ${PURC_BASE} AND pu.paid='N' AND pu.payment_due_date IS NOT NULL AND pu.payment_due_date != ''${pYear}
    GROUP BY pu.payment_due_date
  `).all();
  const rD = Object.fromEntries(recvDaily.map(r=>[r.d, r]));
  const pD = Object.fromEntries(payDaily.map(r=>[r.d, r]));
  const opexByDay = {};
  Object.entries(opexByYm).forEach(([ym, amt]) => { opexByDay[ym + '-01'] = amt; }); // 월 운영비 → 1일 귀속
  const daysSet = new Set([...recvDaily.map(r=>r.d), ...payDaily.map(r=>r.d), ...Object.keys(opexByDay)].filter(Boolean));
  let cumD = 0;
  const daily = Array.from(daysSet).sort().map(d => {
    const inflow = rD[d]?.amount || 0;
    const purc = pD[d]?.amount || 0;
    const opex = opexByDay[d] || 0;
    const outflow = purc + opex;
    const net = inflow - outflow;
    cumD += net;
    return {
      d, inflow, purchase: purc, opex, outflow, net, cumulative: cumD,
      inflow_cnt: rD[d]?.cnt || 0, outflow_cnt: pD[d]?.cnt || 0,
      is_past: d < today, is_current: d === today
    };
  });

  // ---- 본부별 현금흐름 (운영비 포함) ----
  const recvDiv = db.prepare(`
    SELECT d.id AS division_id, d.name AS division_name,
      COALESCE(SUM(s.sales_amount),0) AS amount, COUNT(*) AS cnt,
      COALESCE(SUM(CASE WHEN s.payment_due_date < ? THEN s.sales_amount ELSE 0 END),0) AS overdue
    ${SALES_BASE} AND s.paid='N'${sYear}
    GROUP BY d.id
  `).all(today);
  const payDiv = db.prepare(`
    SELECT d.id AS division_id, d.name AS division_name,
      COALESCE(SUM(pu.purchase_amount),0) AS amount, COUNT(*) AS cnt,
      COALESCE(SUM(CASE WHEN pu.payment_due_date < ? THEN pu.purchase_amount ELSE 0 END),0) AS overdue
    ${PURC_BASE} AND pu.paid='N'${pYear}
    GROUP BY d.id
  `).all(today);
  const opexDiv = db.prepare(`
    SELECT m.division_id, dv.name AS division_name, COALESCE(SUM(m.sga + m.common_cost),0) AS amount
    FROM division_monthly_expenses m LEFT JOIN divisions dv ON m.division_id = dv.id
    ${opexWhere}
    GROUP BY m.division_id
  `).all();

  const divMap = {};
  const ensureDiv = (id, name) => {
    if (!divMap[id]) divMap[id] = { division_id: id, division_name: name, recv: 0, recv_overdue: 0, recv_cnt: 0, pay: 0, pay_overdue: 0, pay_cnt: 0, opex: 0 };
    return divMap[id];
  };
  recvDiv.forEach(r => { const x = ensureDiv(r.division_id, r.division_name); x.recv = r.amount; x.recv_overdue = r.overdue; x.recv_cnt = r.cnt; });
  payDiv.forEach(r => { const x = ensureDiv(r.division_id, r.division_name); x.pay = r.amount; x.pay_overdue = r.overdue; x.pay_cnt = r.cnt; });
  opexDiv.forEach(r => { const x = ensureDiv(r.division_id, r.division_name); x.opex = r.amount; });
  const byDivision = Object.values(divMap)
    .map(d => ({ ...d, outflow: d.pay + d.opex, net: d.recv - d.pay - d.opex }))
    .sort((a,b) => (b.recv + b.pay + b.opex) - (a.recv + a.pay + a.opex));

  const outflowTotal = pay.total + opexTotal;
  res.json({
    today,
    year: year ? Number(year) : null,
    years: availableYears(),
    kpi: {
      receivable: recv.total, receivable_cnt: recv.cnt, receivable_overdue: recv.overdue,
      payable: pay.total, payable_cnt: pay.cnt, payable_overdue: pay.overdue,
      opex: opexTotal,                          // 판관비+공통비(운영비)
      outflow: outflowTotal,                    // 나갈 돈 = 미지급 + 운영비
      net: recv.total - outflowTotal,           // 순현금 = 받을 돈 - 나갈 돈(운영비 포함)
      received_done: recvDone.total, paid_done: payDone.total
    },
    monthly,
    daily,
    byDivision
  });
});

// 미수금 상세 목록 (받을 돈)
router.get('/receivables', (req, res) => {
  const { division_id, ym, overdue, year } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const cond = [];
  const params = [];
  if (division_id) { cond.push('p.division_id = ?'); params.push(division_id); }
  if (year) { cond.push("substr(s.payment_due_date,1,4) = ?"); params.push(String(parseInt(year,10))); }
  if (ym) { cond.push("substr(s.payment_due_date,1,7) = ?"); params.push(ym); }
  if (overdue === '1') { cond.push("s.payment_due_date < ?"); params.push(today); }
  const extra = cond.length ? ' AND ' + cond.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT s.id, s.invoice_date, s.sales_amount, s.payment_due_date, s.collection_type, s.cash_or_note, s.paid,
           p.id AS project_id, p.project_code, p.project_name,
           c.name AS customer_name, d.name AS division_name
    FROM project_sales s
    JOIN projects p ON s.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN divisions d ON p.division_id = d.id
    WHERE p.status='${WON_STATUS}' AND s.paid='N' ${extra}
    ORDER BY (s.payment_due_date IS NULL), s.payment_due_date
  `).all(...params);
  res.json({ today, rows });
});

// 미지급 상세 목록 (줄 돈)
router.get('/payables', (req, res) => {
  const { division_id, ym, overdue, year } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const cond = [];
  const params = [];
  if (division_id) { cond.push('p.division_id = ?'); params.push(division_id); }
  if (year) { cond.push("substr(pu.payment_due_date,1,4) = ?"); params.push(String(parseInt(year,10))); }
  if (ym) { cond.push("substr(pu.payment_due_date,1,7) = ?"); params.push(ym); }
  if (overdue === '1') { cond.push("pu.payment_due_date < ?"); params.push(today); }
  const extra = cond.length ? ' AND ' + cond.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT pu.id, pu.invoice_date, pu.purchase_amount, pu.payment_due_date, pu.purchase_code, pu.vendor, pu.description, pu.paid,
           p.id AS project_id, p.project_code, p.project_name,
           c.name AS customer_name, d.name AS division_name
    FROM project_purchases pu
    JOIN projects p ON pu.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN divisions d ON p.division_id = d.id
    WHERE p.status='${WON_STATUS}' AND pu.paid='N' ${extra}
    ORDER BY (pu.payment_due_date IS NULL), pu.payment_due_date
  `).all(...params);
  res.json({ today, rows });
});

module.exports = router;
