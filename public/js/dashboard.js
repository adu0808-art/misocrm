renderLayout('대시보드');

// 본부별 표 컬럼 정의 (기본 표시) - 다른 변수보다 먼저 선언되어야 함
const DEFAULT_DIV_COLS = [
  { key: 'division_name',       label: '본부',          align: 'left',  visible: true },
  { key: 'target_revenue',      label: '매출목표',      align: 'right', visible: true },
  { key: 'actual_revenue',      label: '매출',          align: 'right', visible: true },
  { key: 'achievement_rate',    label: '매출달성률',    align: 'right', visible: true },
  { key: 'purchase',            label: '매입',          align: 'right', visible: true },
  { key: 'gross_profit',        label: '매출이익',      align: 'right', visible: true },
  { key: 'gross_profit_target', label: '매출이익목표',  align: 'right', visible: true },
  { key: 'gross_profit_rate',   label: '매출이익달성률', align: 'right', visible: true },
  { key: 'sga',                 label: '판관비',        align: 'right', visible: true },
  { key: 'common_cost',         label: '공통비',        align: 'right', visible: true },
  { key: 'operating_profit',    label: '영업이익',      align: 'right', visible: true },
  { key: 'target_profit',       label: '이익목표',      align: 'right', visible: true },
  { key: 'profit_rate',         label: '영업이익달성률', align: 'right', visible: true }
];

let year = new Date().getFullYear();
let unit = localStorage.getItem('miso_dashboard_unit') || '억원';
let charts = {};
let divCols = loadDivCols();
let lastDivData = null;

function loadDivCols() {
  try {
    const saved = JSON.parse(localStorage.getItem('miso_dashboard_div_cols') || 'null');
    if (!saved) return DEFAULT_DIV_COLS.map(c => ({ ...c }));
    // 누락된 컬럼은 뒤에 추가
    const map = new Map(saved.map(c => [c.key, c]));
    const ordered = saved.map(s => {
      const def = DEFAULT_DIV_COLS.find(d => d.key === s.key);
      return def ? { ...def, visible: s.visible !== false } : null;
    }).filter(Boolean);
    const missing = DEFAULT_DIV_COLS.filter(d => !map.has(d.key)).map(c => ({ ...c }));
    return [...ordered, ...missing];
  } catch { return DEFAULT_DIV_COLS.map(c => ({ ...c })); }
}
function saveDivCols() {
  localStorage.setItem('miso_dashboard_div_cols', JSON.stringify(
    divCols.map(c => ({ key: c.key, visible: c.visible !== false }))
  ));
}

function f(n) { return fmtUnit(n, unit); }

async function init() {
  const yearSel = document.getElementById('yearSel');
  for (let y = year + 1; y >= year - 3; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`;
  }
  yearSel.onchange = () => { year = Number(yearSel.value); load(); };

  const unitSel = document.getElementById('unitSel');
  unitSel.value = unit;
  unitSel.onchange = () => {
    unit = unitSel.value;
    localStorage.setItem('miso_dashboard_unit', unit);
    if (lastDivData) {
      renderKPI(lastDivData.total);
      renderDivTable(lastDivData.divisions, lastDivData.total);
      load(); // 차트도 새 단위로 다시
    }
  };

  document.getElementById('divColsBtn').onclick = () => {
    openColumnPicker(divCols, (updated) => {
      divCols = updated;
      saveDivCols();
      if (lastDivData) renderDivTable(lastDivData.divisions, lastDivData.total);
    });
  };

  // 본부명 클릭 이벤트 위임 (테이블이 매번 다시 그려져도 동작)
  document.getElementById('divTbody').addEventListener('click', (e) => {
    const link = e.target.closest('.div-detail-link');
    if (!link) return;
    const did = link.dataset.did;
    if (did) openDivisionDetail(did);
  });

  load();
}

async function load() {
  const [data, monthly, upcoming] = await Promise.all([
    api.get('/api/dashboard/division-summary?year=' + year),
    api.get('/api/dashboard/monthly-revenue?year=' + year),
    api.get('/api/dashboard/upcoming')
  ]);
  lastDivData = data;
  renderKPI(data.total);
  renderDivTable(data.divisions, data.total);
  renderCharts(monthly);
  renderUpcoming(upcoming);
}

function renderKPI(t) {
  document.getElementById('kpiCards').innerHTML = `
    <div class="stat-card primary">
      <div class="label">매출 (${year}년 계산서 발행)</div>
      <div class="value">${f(t.actual_revenue)}</div>
      <div class="sub">매출목표 ${f(t.target_revenue)} · 달성률 ${fmtPct(t.achievement_rate)}</div>
    </div>
    <div class="stat-card warning">
      <div class="label">매입 (${year}년 계산서 발행)</div>
      <div class="value">${f(t.purchase)}</div>
      <div class="sub">발행일자 기준</div>
    </div>
    <div class="stat-card ${t.gross_profit < 0 ? 'danger' : 'success'}">
      <div class="label">매출이익 (매출 − 매입)</div>
      <div class="value">${f(t.gross_profit)}</div>
      <div class="sub">매출이익목표 ${f(t.gross_profit_target)}</div>
    </div>
    <div class="stat-card ${pctClass(t.gross_profit_rate)==='danger'?'danger':(pctClass(t.gross_profit_rate)==='success'?'success':'warning')}">
      <div class="label">매출이익달성률</div>
      <div class="value">${fmtPct(t.gross_profit_rate)}</div>
      <div class="sub">매출이익 / (이익목표 + 판관비 + 공통비) × 100</div>
    </div>
    <div class="stat-card ${t.operating_profit < 0 ? 'danger' : 'success'}">
      <div class="label">영업이익 (매출이익 − 판관비 − 공통비)</div>
      <div class="value">${f(t.operating_profit)}</div>
      <div class="sub">이익목표 ${f(t.target_profit)} · 달성률 ${fmtPct(t.profit_rate)}</div>
    </div>`;
}

function pctClass(p) { return p >= 100 ? 'success' : p >= 70 ? '' : p >= 30 ? 'warning' : 'danger'; }
function progressBar(p) {
  const clamped = Math.max(0, Math.min(150, p));
  return `<div class="progress"><div class="progress-bar ${pctClass(p)}" style="width:${Math.min(100, clamped)}%"></div></div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${fmtPct(p)}</div>`;
}

// 본부별 표 - 컬럼 표시/순서 동적
function renderDivTable(divs, total) {
  const cellRenderers = {
    division_name: d => `<td><strong class="div-detail-link" data-did="${d.division_id}" style="cursor:pointer;color:#2563eb;text-decoration:underline;" title="클릭하여 상세 보기">${d.division_name}</strong></td>`,
    target_revenue: d => `<td class="num">${f(d.target_revenue)}</td>`,
    actual_revenue: d => `<td class="num">${f(d.actual_revenue)}</td>`,
    achievement_rate: d => `<td class="num" style="min-width:120px;">${progressBar(d.achievement_rate)}</td>`,
    purchase: d => `<td class="num">${f(d.purchase)}</td>`,
    gross_profit: d => `<td class="num ${d.gross_profit < 0 ? 'text-danger' : ''} fw-bold">${f(d.gross_profit)}</td>`,
    gross_profit_target: d => `<td class="num">${f(d.gross_profit_target)}</td>`,
    gross_profit_rate: d => `<td class="num" style="min-width:120px;">${progressBar(d.gross_profit_rate)}</td>`,
    sga: d => `<td class="num">${f(d.sga)}</td>`,
    common_cost: d => `<td class="num">${f(d.common_cost)}</td>`,
    operating_profit: d => `<td class="num ${d.operating_profit < 0 ? 'text-danger' : 'text-success'} fw-bold">${f(d.operating_profit)}</td>`,
    target_profit: d => `<td class="num">${f(d.target_profit)}</td>`,
    profit_rate: d => `<td class="num" style="min-width:120px;">${progressBar(d.profit_rate)}</td>`,
  };
  const totalRenderers = {
    division_name: () => `<td>합계</td>`,
    target_revenue: t => `<td class="num">${f(t.target_revenue)}</td>`,
    actual_revenue: t => `<td class="num">${f(t.actual_revenue)}</td>`,
    achievement_rate: t => `<td class="num">${fmtPct(t.achievement_rate)}</td>`,
    purchase: t => `<td class="num">${f(t.purchase)}</td>`,
    gross_profit: t => `<td class="num ${t.gross_profit < 0 ? 'text-danger' : ''}">${f(t.gross_profit)}</td>`,
    gross_profit_target: t => `<td class="num">${f(t.gross_profit_target)}</td>`,
    gross_profit_rate: t => `<td class="num">${fmtPct(t.gross_profit_rate)}</td>`,
    sga: t => `<td class="num">${f(t.sga)}</td>`,
    common_cost: t => `<td class="num">${f(t.common_cost)}</td>`,
    operating_profit: t => `<td class="num ${t.operating_profit < 0 ? 'text-danger' : 'text-success'}">${f(t.operating_profit)}</td>`,
    target_profit: t => `<td class="num">${f(t.target_profit)}</td>`,
    profit_rate: t => `<td class="num">${fmtPct(t.profit_rate)}</td>`,
  };

  const visCols = divCols.filter(c => c.visible !== false);
  // thead
  document.getElementById('divThead').innerHTML = `<tr>${visCols.map(c =>
    `<th class="${c.align==='right'?'num':''}">${c.label}</th>`).join('')}</tr>`;
  // tbody
  document.getElementById('divTbody').innerHTML = divs.map(d =>
    `<tr>${visCols.map(c => (cellRenderers[c.key] || (()=>'<td></td>'))(d)).join('')}</tr>`
  ).join('') || `<tr><td colspan="${visCols.length}" class="empty">데이터가 없습니다.</td></tr>`;
  // tfoot
  document.getElementById('divTfoot').innerHTML = `<tr style="background:#f1f5f9;font-weight:600;">${visCols.map(c =>
    (totalRenderers[c.key] || (()=>'<td></td>'))(total)
  ).join('')}</tr>`;
}

function renderCharts(monthly) {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};
  Chart.defaults.font.family = '-apple-system, "Malgun Gothic", "맑은 고딕", sans-serif';

  const factor = UNIT_FACTORS[unit];
  const axisLabel = '금액 (' + unit + ')';

  charts.monthly = new Chart(document.getElementById('chartMonthly'), {
    type: 'line',
    data: {
      labels: monthly.map(m => m.month + '월'),
      datasets: [{
        label: '월 매출', data: monthly.map(m => m.sales / factor),
        borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)', fill: true, tension: 0.3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.parsed.y.toLocaleString('ko-KR') + unit } }
      },
      scales: { y: { title: { display: true, text: axisLabel } } }
    }
  });
}

function renderUpcoming({ proposals, unpaid }) {
  const today = new Date().toISOString().slice(0, 10);
  const linkStyle = 'color:#2563eb;cursor:pointer;text-decoration:underline;';

  document.getElementById('upcomingProposals').innerHTML = proposals.length ? `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>마감일</th><th>본부</th><th>프로젝트</th></tr></thead>
      <tbody>${proposals.map(p => {
        const overdue = p.proposal_deadline < today;
        return `<tr>
          <td class="${overdue ? 'text-danger fw-bold' : ''}">${p.proposal_deadline}${overdue ? ' (지남)' : ''}</td>
          <td>${p.division_name||''}</td>
          <td><span class="proj-link" data-pid="${p.id}" style="${linkStyle}">[${p.project_code}] ${p.project_name}</span></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">예정된 마감이 없습니다.</div>';

  document.getElementById('upcomingUnpaid').innerHTML = unpaid.length ? `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>입금예정일</th><th>프로젝트</th><th class="num">미수금</th></tr></thead>
      <tbody>${unpaid.map(p => {
        const overdue = p.payment_due_date && p.payment_due_date < today;
        return `<tr>
          <td class="${overdue ? 'text-danger fw-bold' : ''}">${p.payment_due_date || '-'}${overdue ? ' (연체)' : ''}</td>
          <td><span class="proj-link" data-pid="${p.project_id || ''}" style="${linkStyle}">[${p.project_code||''}] ${p.project_name||''}</span></td>
          <td class="num">${f(p.unpaid_balance)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">미수금이 없습니다.</div>';

  // 프로젝트 클릭 → 상세 팝업
  document.querySelectorAll('.proj-link').forEach(el => {
    el.onclick = () => {
      const pid = el.dataset.pid;
      if (pid) openDetailPopup(pid, () => load());
    };
  });
}

// ============================================================
// 본부 상세 팝업
// ============================================================
function esc(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function openDivisionDetail(divId) {
  let data;
  try {
    data = await api.get(`/api/dashboard/division-detail?division_id=${divId}&year=${year}`);
  } catch (e) { toast('조회 실패: ' + e.message, 'error'); return; }

  const { division, summary: s, projects, monthly, statusDist, topCust } = data;
  let ddUnit = '원';                        // 본부 상세 팝업 기본 단위: 원 (원/억원 토글)
  const ff = (n) => fmtUnit(n, ddUnit);     // 팝업 전용 포맷터
  let chart = null;

  const back = document.createElement('div');
  back.className = 'modal-backdrop open';
  back.innerHTML = `
    <div class="modal" style="max-width:1100px;width:96vw;height:90vh;max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="background:#2563eb;color:#fff;border-bottom:none;">
        <h3 style="color:#fff;">🏢 ${esc(division.name)} <small style="opacity:.85;font-weight:400;font-size:12px;margin-left:8px;">${year}년 상세 실적</small></h3>
        <div style="display:flex;align-items:center;gap:10px;">
          <select id="dd_unit" title="화폐 단위" style="width:auto;height:32px;padding:2px 10px;border-radius:6px;border:none;">
            <option value="원" selected>원</option>
            <option value="억원">억원</option>
          </select>
          <button class="close-x" style="color:#fff;">&times;</button>
        </div>
      </div>
      <div class="modal-body" style="overflow:auto;flex:1;" id="dd_body"></div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-act="close">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  function renderBody() {
    back.querySelector('#dd_body').innerHTML = `
        <!-- KPI -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));margin-bottom:18px;">
          <div class="stat-card primary">
            <div class="label">매출</div>
            <div class="value">${ff(s.actual_revenue)}</div>
            <div class="sub">목표 ${ff(s.target_revenue)} · ${fmtPct(s.achievement_rate)}</div>
          </div>
          <div class="stat-card warning">
            <div class="label">매입</div>
            <div class="value">${ff(s.purchase)}</div>
            <div class="sub">계산서 발행일 기준</div>
          </div>
          <div class="stat-card ${s.gross_profit < 0 ? 'danger' : 'success'}">
            <div class="label">매출이익</div>
            <div class="value">${ff(s.gross_profit)}</div>
            <div class="sub">목표 ${ff(s.gross_profit_target)} · ${fmtPct(s.gross_profit_rate)}</div>
          </div>
          <div class="stat-card ${s.operating_profit < 0 ? 'danger' : 'success'}">
            <div class="label">영업이익</div>
            <div class="value">${ff(s.operating_profit)}</div>
            <div class="sub">목표 ${ff(s.target_profit)} · ${fmtPct(s.profit_rate)}</div>
          </div>
          <div class="stat-card">
            <div class="label">판관비 / 공통비</div>
            <div class="value" style="font-size:16px;">${ff(s.sga)}<br><small style="font-size:11px;color:var(--text-muted);">공통 ${ff(s.common_cost)}</small></div>
          </div>
        </div>

        <!-- 상태 분포 chip -->
        ${statusDist.length ? `
        <div style="margin-bottom:16px;">
          <h4 style="margin:0 0 6px;font-size:13px;color:var(--text-muted);">상태 분포 (${year}년 사업)</h4>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${statusDist.map(st => `<span class="badge badge-${st.status}" style="padding:5px 10px;font-size:12px;">${st.status} <strong>${st.count}</strong></span>`).join('')}
          </div>
        </div>` : ''}

        <!-- 월별 매출/매입 차트 -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="font-size:13px;">월별 매출 / 매입 (수주완료)</h3></div>
          <div class="card-body"><div style="position:relative;height:240px;"><canvas id="dd_chart"></canvas></div></div>
        </div>

        <!-- 주요 고객사 + 프로젝트 목록 -->
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:14px;">
          <div>
            <h4 style="margin:0 0 8px;font-size:13px;">주요 고객사 TOP ${topCust.length}</h4>
            ${topCust.length ? `<table class="data" style="margin:0;font-size:12px;">
              <thead><tr><th>고객사</th><th class="num">건수</th><th class="num">실매출</th></tr></thead>
              <tbody>${topCust.map(c => `
                <tr>
                  <td><span class="dd-cust-link" data-cid="${c.customer_id}" style="cursor:pointer;color:#2563eb;text-decoration:underline;">${esc(c.customer_name)}</span></td>
                  <td class="num">${c.cnt}</td>
                  <td class="num">${ff(c.actual)}</td>
                </tr>`).join('')}</tbody>
            </table>` : '<div class="empty" style="padding:20px;font-size:12px;">데이터 없음</div>'}
          </div>
          <div>
            <h4 style="margin:0 0 8px;font-size:13px;">프로젝트 (${projects.length}건)</h4>
            <div style="max-height:380px;overflow:auto;border:1px solid var(--border);border-radius:6px;">
              <table class="data" style="margin:0;font-size:12px;">
                <thead><tr style="position:sticky;top:0;background:#f8fafc;">
                  <th>코드</th><th>상태</th><th style="min-width:200px;">프로젝트명</th><th>고객사</th>
                  <th class="num">당해매출</th><th class="num">예상매출</th>
                </tr></thead>
                <tbody>${projects.length ? projects.map(p => `
                  <tr>
                    <td>${p.is_favorite?'★ ':''}<span class="dd-proj-link" data-pid="${p.id}" style="cursor:pointer;color:#2563eb;text-decoration:underline;font-variant-numeric:tabular-nums;">${esc(p.project_code)}</span></td>
                    <td><span class="badge badge-${p.status}">${p.status}</span></td>
                    <td>${esc(p.project_name)}</td>
                    <td>${esc(p.customer_name||'-')}</td>
                    <td class="num">${ff(p.year_sales)}</td>
                    <td class="num">${ff(p.expected_revenue)}</td>
                  </tr>`).join('') : '<tr><td colspan="6" class="empty">프로젝트가 없습니다.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;

    // 프로젝트 클릭 → 상세 팝업
    back.querySelectorAll('.dd-proj-link').forEach(el => el.onclick = () => {
      if (typeof openDetailPopup === 'function') openDetailPopup(el.dataset.pid, () => load());
    });
    // 고객사 클릭 → 고객사 정보 팝업
    back.querySelectorAll('.dd-cust-link').forEach(el => el.onclick = () => {
      const cid = el.dataset.cid;
      if (typeof openCustomerInfoPopup === 'function') openCustomerInfoPopup(cid);
      else toast('고객사 정보는 프로젝트 관리 페이지에서 확인 가능합니다.', 'success');
    });

    // 월별 차트 (선택 단위 반영)
    if (chart) { chart.destroy(); chart = null; }
    const factor = UNIT_FACTORS[ddUnit];
    const ctx = back.querySelector('#dd_chart');
    if (window.Chart && ctx) {
      chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthly.map(m => m.month + '월'),
          datasets: [
            { label: '매출', data: monthly.map(m => m.sales / factor), backgroundColor: '#2563eb' },
            { label: '매입', data: monthly.map(m => m.purchase / factor), backgroundColor: '#f97316' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y.toLocaleString('ko-KR') + ddUnit } }
          },
          scales: { y: { title: { display: true, text: '금액 (' + ddUnit + ')' } } }
        }
      });
    }
  }
  renderBody();

  const close = () => { if (chart) chart.destroy(); back.remove(); };
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="close"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  const onEsc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
  back.querySelector('#dd_unit').onchange = (e) => { ddUnit = e.target.value; renderBody(); };
}

init();
