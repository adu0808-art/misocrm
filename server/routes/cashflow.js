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

// 요약: KPI + 월별 + 본부별
router.get('/summary', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // ---- KPI ----
  const recv = db.prepare(`
    SELECT
      COALESCE(SUM(s.sales_amount),0) AS total,
      COALESCE(SUM(CASE WHEN s.payment_due_date IS NOT NULL AND s.payment_due_date < ? THEN s.sales_amount ELSE 0 END),0) AS overdue,
      COUNT(*) AS cnt
    ${SALES_BASE} AND s.paid='N'
  `).get(today);

  const pay = db.prepare(`
    SELECT
      COALESCE(SUM(pu.purchase_amount),0) AS total,
      COALESCE(SUM(CASE WHEN pu.payment_due_date IS NOT NULL AND pu.payment_due_date < ? THEN pu.purchase_amount ELSE 0 END),0) AS overdue,
      COUNT(*) AS cnt
    ${PURC_BASE} AND pu.paid='N'
  `).get(today);

  // 누적 실적 (이미 들어온/나간)
  const recvDone = db.prepare(`SELECT COALESCE(SUM(s.sales_amount),0) AS total ${SALES_BASE} AND s.paid='Y'`).get();
  const payDone  = db.prepare(`SELECT COALESCE(SUM(pu.purchase_amount),0) AS total ${PURC_BASE} AND pu.paid='Y'`).get();

  // ---- 월별 현금흐름 (미수/미지급, 예정일 기준) ----
  const recvMonthly = db.prepare(`
    SELECT substr(s.payment_due_date,1,7) AS ym, COALESCE(SUM(s.sales_amount),0) AS amount, COUNT(*) AS cnt
    ${SALES_BASE} AND s.paid='N' AND s.payment_due_date IS NOT NULL AND s.payment_due_date != ''
    GROUP BY ym
  `).all();
  const payMonthly = db.prepare(`
    SELECT substr(pu.payment_due_date,1,7) AS ym, COALESCE(SUM(pu.purchase_amount),0) AS amount, COUNT(*) AS cnt
    ${PURC_BASE} AND pu.paid='N' AND pu.payment_due_date IS NOT NULL AND pu.payment_due_date != ''
    GROUP BY ym
  `).all();

  const monthsSet = new Set([...recvMonthly.map(r=>r.ym), ...payMonthly.map(r=>r.ym)].filter(Boolean));
  const rM = Object.fromEntries(recvMonthly.map(r=>[r.ym, r]));
  const pM = Object.fromEntries(payMonthly.map(r=>[r.ym, r]));
  const curYm = today.slice(0,7);
  const monthly = Array.from(monthsSet).sort().map(ym => {
    const inflow = rM[ym]?.amount || 0;
    const outflow = pM[ym]?.amount || 0;
    return {
      ym,
      inflow, outflow,
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

  // ---- 본부별 현금흐름 ----
  const recvDiv = db.prepare(`
    SELECT d.id AS division_id, d.name AS division_name,
      COALESCE(SUM(s.sales_amount),0) AS amount, COUNT(*) AS cnt,
      COALESCE(SUM(CASE WHEN s.payment_due_date < ? THEN s.sales_amount ELSE 0 END),0) AS overdue
    ${SALES_BASE} AND s.paid='N'
    GROUP BY d.id
  `).all(today);
  const payDiv = db.prepare(`
    SELECT d.id AS division_id, d.name AS division_name,
      COALESCE(SUM(pu.purchase_amount),0) AS amount, COUNT(*) AS cnt,
      COALESCE(SUM(CASE WHEN pu.payment_due_date < ? THEN pu.purchase_amount ELSE 0 END),0) AS overdue
    ${PURC_BASE} AND pu.paid='N'
    GROUP BY d.id
  `).all(today);

  const divMap = {};
  recvDiv.forEach(r => { divMap[r.division_id] = { division_id: r.division_id, division_name: r.division_name, recv: r.amount, recv_overdue: r.overdue, recv_cnt: r.cnt, pay: 0, pay_overdue: 0, pay_cnt: 0 }; });
  payDiv.forEach(r => {
    if (!divMap[r.division_id]) divMap[r.division_id] = { division_id: r.division_id, division_name: r.division_name, recv: 0, recv_overdue: 0, recv_cnt: 0, pay: 0, pay_overdue: 0, pay_cnt: 0 };
    divMap[r.division_id].pay = r.amount;
    divMap[r.division_id].pay_overdue = r.overdue;
    divMap[r.division_id].pay_cnt = r.cnt;
  });
  const byDivision = Object.values(divMap).map(d => ({ ...d, net: d.recv - d.pay }))
    .sort((a,b) => (b.recv + b.pay) - (a.recv + a.pay));

  res.json({
    today,
    kpi: {
      receivable: recv.total, receivable_cnt: recv.cnt, receivable_overdue: recv.overdue,
      payable: pay.total, payable_cnt: pay.cnt, payable_overdue: pay.overdue,
      net: recv.total - pay.total,
      received_done: recvDone.total, paid_done: payDone.total
    },
    monthly,
    byDivision
  });
});

// 미수금 상세 목록 (받을 돈)
router.get('/receivables', (req, res) => {
  const { division_id, ym, overdue } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const cond = [];
  const params = [];
  if (division_id) { cond.push('p.division_id = ?'); params.push(division_id); }
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
  const { division_id, ym, overdue } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const cond = [];
  const params = [];
  if (division_id) { cond.push('p.division_id = ?'); params.push(division_id); }
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
