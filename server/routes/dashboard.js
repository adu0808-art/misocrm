const express = require('express');
const db = require('../db');
const router = express.Router();

// 본부별 연도별 영업목표 달성 & 영업이익
router.get('/division-summary', (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();

  // 해당 연도에 유효한 본부만 (valid_from/valid_to, NULL=제한없음)
  const divisions = db.prepare(`
    SELECT * FROM divisions
    WHERE active=1
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to   IS NULL OR valid_to   >= ?)
    ORDER BY sort_order, id
  `).all(year, year);

  // 실매출(actual_revenue) - 수주완료/수행종료 기준
  const actualRevenueRows = db.prepare(`
    SELECT division_id, COALESCE(SUM(actual_revenue),0) AS actual
    FROM projects
    WHERE business_year=? AND status IN ('수주완료','수행종료')
    GROUP BY division_id
  `).all(year);

  // 가중 파이프라인 매출(예상매출 × 수주확률)
  const pipelineRows = db.prepare(`
    SELECT division_id,
      COALESCE(SUM(CASE WHEN status IN ('수주완료','수행종료') THEN expected_revenue ELSE 0 END),0) AS won_expected,
      COALESCE(SUM(CASE WHEN status IN ('기획단계','영업단계','제안단계') THEN expected_revenue * (win_probability/100.0) ELSE 0 END),0) AS pipeline_weighted,
      COALESCE(SUM(CASE WHEN status NOT IN ('수주실패','사업보류') THEN expected_revenue ELSE 0 END),0) AS pipeline_total,
      COUNT(*) AS project_count
    FROM projects
    WHERE business_year=?
    GROUP BY division_id
  `).all(year);

  // 매출 / 매입: 계산서 발행일자(invoice_date)의 연도가 해당 연도인 트랜잭션 합계.
  //   - 매출 = SUM(project_sales.sales_amount) WHERE YEAR(ps.invoice_date)=year
  //   - 매입 = SUM(project_purchases.purchase_amount) WHERE YEAR(pp.invoice_date)=year
  //   - 수주완료 프로젝트만 대상
  const yearStr = String(year);
  // 상용 매출/매입: 과제(G) 제외, 수주완료 프로젝트만
  const NOT_RESEARCH = "p.project_type_id NOT IN (SELECT id FROM project_types WHERE code='G')";
  const realRows = db.prepare(`
    SELECT d.id AS division_id,
      COALESCE(s.sales,    0) AS sales,
      COALESCE(pu.purchase,0) AS purchase
    FROM divisions d
    LEFT JOIN (
      SELECT p.division_id, SUM(ps.sales_amount) AS sales
      FROM project_sales ps
      JOIN projects p ON ps.project_id = p.id
      WHERE strftime('%Y', ps.invoice_date) = ?
        AND p.status = '수주완료' AND ${NOT_RESEARCH}
      GROUP BY p.division_id
    ) s ON s.division_id = d.id
    LEFT JOIN (
      SELECT p.division_id, SUM(pp.purchase_amount) AS purchase
      FROM project_purchases pp
      JOIN projects p ON pp.project_id = p.id
      WHERE strftime('%Y', pp.invoice_date) = ?
        AND p.status = '수주완료' AND ${NOT_RESEARCH}
      GROUP BY p.division_id
    ) pu ON pu.division_id = d.id
  `).all(yearStr, yearStr);

  // 연구과제비: 정부 지원 과제(code='G') 중 협약체결 이후(진행단계 기준)의 연구비
  const researchRows = db.prepare(`
    SELECT p.division_id, COALESCE(SUM(ps.sales_amount),0) AS research
    FROM project_sales ps
    JOIN projects p ON ps.project_id = p.id
    JOIN project_types pt ON p.project_type_id = pt.id
    WHERE strftime('%Y', ps.invoice_date) = ? AND pt.code = 'G'
      AND p.research_stage IN ('선정','협약체결','수행중','최종평가','종료')
    GROUP BY p.division_id
  `).all(yearStr);

  const targets = db.prepare('SELECT * FROM sales_targets WHERE year=?').all(year);
  const expenses = db.prepare('SELECT * FROM division_expenses WHERE year=?').all(year);

  const map = (arr, key) => Object.fromEntries(arr.map(x => [x[key], x]));
  const actualMap = map(actualRevenueRows, 'division_id');
  const pipelineMap = map(pipelineRows, 'division_id');
  const realMap = map(realRows, 'division_id');
  const researchMap = map(researchRows, 'division_id');
  const targetMap = map(targets, 'division_id');
  const expenseMap = map(expenses, 'division_id');

  const result = divisions.map(d => {
    const target = targetMap[d.id] || { target_revenue: 0, target_profit: 0 };
    const pipe = pipelineMap[d.id] || { won_expected: 0, pipeline_weighted: 0, pipeline_total: 0, project_count: 0 };
    const real = realMap[d.id] || { sales: 0, purchase: 0 };
    const exp = expenseMap[d.id] || { sga: 0, common_cost: 0 };
    const commercial = real.sales || 0;                          // 상용 매출(과제 제외, 이익 계산용)
    const research = (researchMap[d.id] || {}).research || 0;     // 연구과제비(과제 진행단계 기준)
    const sales = commercial;                                    // (하위 계산 호환)
    const purchase = real.purchase || 0;                         // 상용 매입(과제 제외)
    const sga = exp.sga || 0;
    const common = exp.common_cost || 0;
    const grossProfit = commercial + research - purchase;        // 매출이익 = 상용매출 + 연구과제비 - 매입
    const grossProfitTarget = (target.target_profit || 0) + sga + common; // 매출이익목표
    const opProfit = grossProfit - sga - common;                 // 영업이익
    const forecast = (pipe.won_expected || 0) + (pipe.pipeline_weighted || 0);
    return {
      division_id: d.id,
      division_code: d.code,
      division_name: d.name,
      project_count: pipe.project_count,
      target_revenue: target.target_revenue || 0,
      target_profit: target.target_profit || 0,
      actual_revenue: commercial,      // 매출 표시 = 상용(연구과제비 제외)
      research_revenue: research,       // 연구과제비(별도 항목)
      purchase: purchase,
      gross_profit: grossProfit,
      gross_profit_target: grossProfitTarget,
      sga: sga,
      common_cost: common,
      operating_profit: opProfit,
      forecast_revenue: forecast,
      pipeline_weighted: pipe.pipeline_weighted || 0,
      pipeline_total: pipe.pipeline_total || 0,
      achievement_rate: target.target_revenue ? (commercial / target.target_revenue * 100) : 0,
      forecast_rate: target.target_revenue ? (forecast / target.target_revenue * 100) : 0,
      gross_profit_rate: grossProfitTarget ? (grossProfit / grossProfitTarget * 100) : 0,
      profit_rate: target.target_profit ? (opProfit / target.target_profit * 100) : 0
    };
  });

  // 회사 전체
  const total = result.reduce((acc, r) => ({
    target_revenue: acc.target_revenue + r.target_revenue,
    target_profit: acc.target_profit + r.target_profit,
    actual_revenue: acc.actual_revenue + r.actual_revenue,
    research_revenue: acc.research_revenue + r.research_revenue,
    purchase: acc.purchase + r.purchase,
    gross_profit: acc.gross_profit + r.gross_profit,
    gross_profit_target: acc.gross_profit_target + r.gross_profit_target,
    sga: acc.sga + r.sga,
    common_cost: acc.common_cost + r.common_cost,
    operating_profit: acc.operating_profit + r.operating_profit,
    forecast_revenue: acc.forecast_revenue + r.forecast_revenue,
    pipeline_weighted: acc.pipeline_weighted + r.pipeline_weighted,
    project_count: acc.project_count + r.project_count
  }), { target_revenue: 0, target_profit: 0, actual_revenue: 0, research_revenue: 0, purchase: 0, gross_profit: 0, gross_profit_target: 0, sga: 0, common_cost: 0, operating_profit: 0, forecast_revenue: 0, pipeline_weighted: 0, project_count: 0 });
  total.achievement_rate = total.target_revenue ? total.actual_revenue / total.target_revenue * 100 : 0;
  total.forecast_rate = total.target_revenue ? total.forecast_revenue / total.target_revenue * 100 : 0;
  total.gross_profit_rate = total.gross_profit_target ? total.gross_profit / total.gross_profit_target * 100 : 0;
  total.profit_rate = total.target_profit ? total.operating_profit / total.target_profit * 100 : 0;

  res.json({ year, divisions: result, total });
});

// 상태별 프로젝트 분포
router.get('/status-distribution', (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count, COALESCE(SUM(expected_revenue),0) AS expected
    FROM projects WHERE business_year=? GROUP BY status
  `).all(year);
  res.json(rows);
});

// 월별 매출 (실 매출 기준)
router.get('/monthly-revenue', (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const rows = db.prepare(`
    SELECT substr(invoice_date,6,2) AS month,
           COALESCE(SUM(sales_amount),0) AS sales
    FROM project_sales
    WHERE invoice_date LIKE ? GROUP BY month ORDER BY month
  `).all(year + '%');
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const r = rows.find(x => x.month === m);
    return { month: m, sales: r ? r.sales : 0 };
  });
  res.json(monthly);
});

// 본부 상세 (KPI + 프로젝트 + 월별 + 주요 고객사 + 상태분포)
router.get('/division-detail', (req, res) => {
  const divId = parseInt(req.query.division_id, 10);
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  if (!divId) return res.status(400).json({ error: 'division_id required' });

  const division = db.prepare('SELECT id, code, name FROM divisions WHERE id=?').get(divId);
  if (!division) return res.status(404).json({ error: 'Not found' });

  const target = db.prepare('SELECT * FROM sales_targets WHERE year=? AND division_id=?').get(year, divId) || {};
  const exp    = db.prepare('SELECT * FROM division_expenses WHERE year=? AND division_id=?').get(year, divId) || {};

  const yearStr = String(year);

  // 당해 매출 (수주완료 + invoice_date 연도 일치, 과제 제외)
  const salesRow = db.prepare(`
    SELECT COALESCE(SUM(ps.sales_amount),0) AS total
    FROM project_sales ps JOIN projects p ON ps.project_id=p.id
    WHERE strftime('%Y', ps.invoice_date)=? AND p.division_id=? AND p.status='수주완료'
      AND p.project_type_id NOT IN (SELECT id FROM project_types WHERE code='G')
  `).get(yearStr, divId);

  // 연구과제비 (정부 지원 과제 code='G' 중 협약체결 이후 진행단계)
  const researchRow = db.prepare(`
    SELECT COALESCE(SUM(ps.sales_amount),0) AS total
    FROM project_sales ps JOIN projects p ON ps.project_id=p.id
    JOIN project_types pt ON p.project_type_id=pt.id
    WHERE strftime('%Y', ps.invoice_date)=? AND p.division_id=? AND pt.code='G'
      AND p.research_stage IN ('선정','협약체결','수행중','최종평가','종료')
  `).get(yearStr, divId);

  // 당해 매입 (과제 제외)
  const purcRow = db.prepare(`
    SELECT COALESCE(SUM(pp.purchase_amount),0) AS total
    FROM project_purchases pp JOIN projects p ON pp.project_id=p.id
    WHERE strftime('%Y', pp.invoice_date)=? AND p.division_id=? AND p.status='수주완료'
      AND p.project_type_id NOT IN (SELECT id FROM project_types WHERE code='G')
  `).get(yearStr, divId);

  // 본부 소속 프로젝트 (사업년도가 맞거나 당해 거래가 있는 것)
  const projects = db.prepare(`
    SELECT p.id, p.project_code, p.project_name, p.status, p.start_date, p.end_date,
           p.expected_revenue, p.actual_revenue, p.total_budget, p.win_probability,
           p.participation_type, p.is_favorite,
           c.name AS customer_name, pt.name AS project_type_name,
           up.name AS pm_name, us.name AS sales_rep_name,
           COALESCE(ys.year_sales,0)   AS year_sales,
           COALESCE(yp.year_purchase,0) AS year_purchase
    FROM projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN project_types pt ON p.project_type_id = pt.id
    LEFT JOIN users up ON p.pm_id = up.id
    LEFT JOIN users us ON p.sales_rep_id = us.id
    LEFT JOIN (
      SELECT project_id, SUM(sales_amount) AS year_sales
      FROM project_sales WHERE strftime('%Y', invoice_date)=? GROUP BY project_id
    ) ys ON ys.project_id = p.id
    LEFT JOIN (
      SELECT project_id, SUM(purchase_amount) AS year_purchase
      FROM project_purchases WHERE strftime('%Y', invoice_date)=? GROUP BY project_id
    ) yp ON yp.project_id = p.id
    WHERE p.division_id=?
      AND (p.business_year=? OR IFNULL(ys.year_sales,0) > 0 OR IFNULL(yp.year_purchase,0) > 0)
    ORDER BY p.is_favorite DESC, COALESCE(p.start_date,'') DESC, p.id DESC
  `).all(yearStr, yearStr, divId, year);

  // 월별 매출/매입 (수주완료)
  const monthlySales = db.prepare(`
    SELECT substr(ps.invoice_date,6,2) AS month, COALESCE(SUM(ps.sales_amount),0) AS amount
    FROM project_sales ps JOIN projects p ON ps.project_id=p.id
    WHERE p.division_id=? AND ps.invoice_date LIKE ? AND p.status='수주완료'
    GROUP BY month
  `).all(divId, year + '-%');
  const monthlyPurc = db.prepare(`
    SELECT substr(pp.invoice_date,6,2) AS month, COALESCE(SUM(pp.purchase_amount),0) AS amount
    FROM project_purchases pp JOIN projects p ON pp.project_id=p.id
    WHERE p.division_id=? AND pp.invoice_date LIKE ? AND p.status='수주완료'
    GROUP BY month
  `).all(divId, year + '-%');
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const s = monthlySales.find(x => x.month === m);
    const p2 = monthlyPurc.find(x => x.month === m);
    return { month: m, sales: s ? s.amount : 0, purchase: p2 ? p2.amount : 0 };
  });

  // 상태별 분포 (그 본부 + 사업년도)
  const statusDist = db.prepare(`
    SELECT status, COUNT(*) AS count,
      COALESCE(SUM(expected_revenue),0) AS expected,
      COALESCE(SUM(actual_revenue),0) AS actual
    FROM projects WHERE division_id=? AND business_year=?
    GROUP BY status
  `).all(divId, year);

  // 주요 고객사 TOP10
  const topCust = db.prepare(`
    SELECT c.id AS customer_id, c.name AS customer_name, COUNT(p.id) AS cnt,
      COALESCE(SUM(p.expected_revenue),0) AS expected,
      COALESCE(SUM(p.actual_revenue),0)   AS actual
    FROM projects p LEFT JOIN customers c ON p.customer_id = c.id
    WHERE p.division_id=? AND p.business_year=? AND c.id IS NOT NULL
    GROUP BY c.id
    ORDER BY actual DESC, expected DESC LIMIT 10
  `).all(divId, year);

  // 합계 / 파생값 계산 (매출/매입은 과제 제외, 연구과제비는 진행단계 기준 별도)
  const commercial = salesRow.total || 0;            // 상용 매출(과제 제외)
  const research = researchRow.total || 0;           // 연구과제비(협약체결 이후)
  const sales = commercial;
  const purchase = purcRow.total || 0;
  const sga = exp.sga || 0, common = exp.common_cost || 0;
  const gp = commercial + research - purchase;       // 매출이익 = 상용매출 + 연구과제비 - 매입
  const gpTarget = (target.target_profit || 0) + sga + common;
  const op = gp - sga - common;

  res.json({
    division, year,
    summary: {
      target_revenue: target.target_revenue || 0,
      target_profit: target.target_profit || 0,
      actual_revenue: commercial,        // 매출 표시 = 상용(연구과제비 제외)
      research_revenue: research,         // 연구과제비(별도)
      purchase,
      gross_profit: gp,
      gross_profit_target: gpTarget,
      gross_profit_rate: gpTarget ? (gp / gpTarget * 100) : 0,
      sga, common_cost: common,
      operating_profit: op,
      profit_rate: target.target_profit ? (op / target.target_profit * 100) : 0,
      achievement_rate: target.target_revenue ? (commercial / target.target_revenue * 100) : 0
    },
    projects, monthly, statusDist, topCust
  });
});

// 다가오는 활동/마감
router.get('/upcoming', (req, res) => {
  const proposals = db.prepare(`
    SELECT p.id, p.project_code, p.project_name, p.proposal_deadline, d.name AS division_name
    FROM projects p LEFT JOIN divisions d ON p.division_id = d.id
    WHERE p.proposal_deadline IS NOT NULL AND p.status IN ('기획단계','영업단계','제안단계')
    ORDER BY p.proposal_deadline LIMIT 8
  `).all();
  const unpaid = db.prepare(`
    SELECT s.id, s.payment_due_date, s.unpaid_balance, p.project_code, p.project_name
    FROM project_sales s LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.paid='N' AND s.unpaid_balance > 0
    ORDER BY s.payment_due_date LIMIT 8
  `).all();
  res.json({ proposals, unpaid });
});

module.exports = router;
