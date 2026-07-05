renderLayout('자금현황');

let unit = localStorage.getItem('miso_cashflow_unit') || '억원';
let selectedYear = String(new Date().getFullYear());   // 기본: 현재 연도
let yearsLoaded = false;
let granularity = 'month';   // 'month' | 'day'  (상세 표 단위)
let chart = null;
let curDetail = 'recv';
let summaryCache = null;
let cfDivisions = [];   // 전체 본부 (연도 필터용)

function f(n) { return fmtUnit(n, unit); }

async function init() {
  const unitSel = document.getElementById('unitSel');
  unitSel.value = unit;
  unitSel.onchange = () => { unit = unitSel.value; localStorage.setItem('miso_cashflow_unit', unit); render(); loadDetail(); };
  document.getElementById('yearSel').onchange = (e) => { selectedYear = e.target.value; load(); };
  document.getElementById('refreshBtn').onclick = load;

  document.querySelectorAll('#detailTabs .tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('#detailTabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    curDetail = t.dataset.d;
    loadDetail();
  });
  document.getElementById('fltDiv').onchange = loadDetail;
  document.getElementById('fltOverdue').onchange = loadDetail;

  // 월별/일별 토글
  document.querySelectorAll('#periodToggle .ptog').forEach(b => b.onclick = () => {
    granularity = b.dataset.g;
    renderPeriodTable();
  });

  // 본부 필터 채우기 (선택 연도 기준으로 갱신)
  try { cfDivisions = await api.get('/api/masters/divisions'); } catch { cfDivisions = []; }
  populateDivFilter();

  load();
}

// 선택 연도에 유효한 본부만 본부 필터에 표시
function populateDivFilter() {
  const sel = document.getElementById('fltDiv');
  if (!sel) return;
  const prev = sel.value;
  const list = divisionsForYear(cfDivisions, selectedYear);
  sel.innerHTML = '<option value="">전체 본부</option>' +
    list.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  if (prev && list.some(d => String(d.id) === String(prev))) sel.value = prev;
}

async function load() {
  const q = selectedYear ? ('?year=' + selectedYear) : '';
  summaryCache = await api.get('/api/cashflow/summary' + q);
  document.getElementById('todayLabel').textContent = '기준일 ' + summaryCache.today +
    (selectedYear ? ' · ' + selectedYear + '년' : ' · 전체 기간');
  // 연도 셀렉트 채우기 (최초 1회) — 현재연도가 데이터에 없으면 가장 최근 연도로
  if (!yearsLoaded && Array.isArray(summaryCache.years)) {
    const years = summaryCache.years;
    if (selectedYear && years.length && !years.includes(Number(selectedYear))) {
      selectedYear = String(years[0]); // 최신 연도
      yearsLoaded = true;
      return load(); // 폴백 연도로 재조회
    }
    const sel = document.getElementById('yearSel');
    sel.innerHTML = '<option value="">전체</option>' +
      years.map(y => `<option value="${y}">${y}년</option>`).join('');
    sel.value = selectedYear;
    yearsLoaded = true;
  }
  populateDivFilter();   // 선택 연도 유효 본부로 필터 갱신
  render();
  loadDetail();
}

function render() {
  if (!summaryCache) return;
  renderKPI(summaryCache.kpi);
  renderPeriodTable();
  renderDivisions(summaryCache.byDivision);
  renderChart(summaryCache.monthly);
}

function renderKPI(k) {
  const netClass = k.net >= 0 ? 'success' : 'danger';
  document.getElementById('kpiCards').innerHTML = `
    <div class="stat-card success">
      <div class="label">받을 돈 (미수금)</div>
      <div class="value">${f(k.receivable)}</div>
      <div class="sub">${k.receivable_cnt}건 · 연체 <span class="text-danger">${f(k.receivable_overdue)}</span></div>
    </div>
    <div class="stat-card danger">
      <div class="label">나갈 돈 (미지급 + 운영비)</div>
      <div class="value">${f(k.outflow)}</div>
      <div class="sub">미지급 ${f(k.payable)} · 판관/공통 ${f(k.opex)}</div>
    </div>
    <div class="stat-card ${netClass}">
      <div class="label">순 현금흐름 (받을 − 나갈)</div>
      <div class="value">${f(k.net)}</div>
      <div class="sub">${k.net >= 0 ? '순유입 예상' : '순유출 주의'}</div>
    </div>
    <div class="stat-card primary">
      <div class="label">누적 실적 (이미 정산)</div>
      <div class="value" style="font-size:16px;line-height:1.5;">입금 ${f(k.received_done)}<br>지급 ${f(k.paid_done)}</div>
      <div class="sub">수주완료 paid 처리 합계</div>
    </div>`;
}

// 월별/일별 상세 표 (운영비 컬럼 포함)
function renderPeriodTable() {
  const isDay = granularity === 'day';
  const rows = isDay ? (summaryCache.daily || []) : (summaryCache.monthly || []);
  // 토글 버튼 상태
  document.querySelectorAll('#periodToggle .ptog').forEach(b =>
    b.classList.toggle('active', b.dataset.g === granularity));
  const periodLabel = isDay ? '일자' : '월';
  const head = document.getElementById('periodHead');
  if (head) head.innerHTML = `<tr>
    <th>${periodLabel}</th>
    <th class="num">들어올 돈</th>
    <th class="num">나갈 돈(매입)</th>
    <th class="num">운영비(판관/공통)</th>
    <th class="num">순액</th>
    <th class="num">누적</th></tr>`;
  const tbody = document.getElementById('periodBody');
  tbody.innerHTML = rows.map(m => {
    const key = isDay ? m.d : m.ym;
    const cls = m.is_current ? 'style="background:#fef9c3;font-weight:600;"' : (m.is_past ? 'style="color:#94a3b8;"' : '');
    const tag = m.is_current ? (isDay ? ' ◀ 오늘' : ' ◀ 이번달') : '';
    return `<tr ${cls}>
      <td class="nowrap">${key}${tag}</td>
      <td class="num text-success">${m.inflow ? f(m.inflow) : '-'}</td>
      <td class="num text-danger">${m.purchase ? f(m.purchase) : '-'}</td>
      <td class="num" style="color:#b45309;">${m.opex ? f(m.opex) : '-'}</td>
      <td class="num ${m.net<0?'text-danger':''} fw-bold">${f(m.net)}</td>
      <td class="num">${f(m.cumulative)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="empty">예정 현금흐름이 없습니다.</td></tr>`;
}

function renderDivisions(divs) {
  const tbody = document.getElementById('divBody');
  let tr=0, tp=0, to=0;
  tbody.innerHTML = divs.map(d => {
    tr += d.recv; tp += d.pay; to += (d.opex||0);
    return `<tr>
      <td><strong>${esc(d.division_name||'(미지정)')}</strong></td>
      <td class="num text-success">${f(d.recv)}</td>
      <td class="num text-danger">${f(d.outflow)}<br><small class="text-muted">매입 ${f(d.pay)} · 운영 ${f(d.opex||0)}</small></td>
      <td class="num ${d.net<0?'text-danger':''} fw-bold">${f(d.net)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="4" class="empty">데이터 없음</td></tr>`;
  // 합계
  if (divs.length) {
    tbody.innerHTML += `<tr style="background:#f1f5f9;font-weight:700;">
      <td>합계</td><td class="num text-success">${f(tr)}</td>
      <td class="num text-danger">${f(tp+to)}</td>
      <td class="num ${tr-tp-to<0?'text-danger':''}">${f(tr-tp-to)}</td></tr>`;
  }
}

function renderChart(monthly) {
  if (chart) chart.destroy();
  const factor = UNIT_FACTORS[unit];
  const ctx = document.getElementById('cfChart');
  Chart.defaults.font.family = '-apple-system, "Malgun Gothic", "맑은 고딕", sans-serif';
  chart = new Chart(ctx, {
    data: {
      labels: monthly.map(m => m.ym),
      datasets: [
        { type:'bar', label:'들어올 돈', data: monthly.map(m=>m.inflow/factor), backgroundColor:'#22c55e', stack:'in', order:3 },
        { type:'bar', label:'나갈 돈(매입)', data: monthly.map(m=>-(m.purchase||0)/factor), backgroundColor:'#ef4444', stack:'out', order:3 },
        { type:'bar', label:'운영비(판관/공통)', data: monthly.map(m=>-(m.opex||0)/factor), backgroundColor:'#f59e0b', stack:'out', order:3 },
        { type:'line', label:'누적 순현금', data: monthly.map(m=>m.cumulative/factor), borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,.1)', fill:false, tension:0.3, order:1 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{position:'bottom'},
        tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+Math.abs(ctx.parsed.y).toLocaleString('ko-KR')+unit}}
      },
      scales:{ x:{ stacked:true }, y:{ title:{display:true,text:'금액 ('+unit+')'}, stacked:true } }
    }
  });
}

// ===== 상세 목록 (받을/줄 돈) =====
async function loadDetail() {
  const divId = document.getElementById('fltDiv').value;
  const overdue = document.getElementById('fltOverdue').checked ? '1' : '';
  const p = new URLSearchParams();
  if (divId) p.set('division_id', divId);
  if (overdue) p.set('overdue', '1');
  if (selectedYear) p.set('year', selectedYear);
  const endpoint = curDetail === 'recv' ? 'receivables' : 'payables';
  const data = await api.get('/api/cashflow/' + endpoint + '?' + p);
  if (curDetail === 'recv') renderReceivables(data);
  else renderPayables(data);
}

function dueBadge(due, today, paidLabelN) {
  if (!due) return '<span class="badge badge-사업보류">예정일 미정</span>';
  if (due < today) return `<span class="badge badge-수주실패">연체</span>`;
  return `<span class="badge badge-기획단계">예정</span>`;
}

function renderReceivables({ today, rows }) {
  document.getElementById('detailHead').innerHTML = `<tr>
    <th>입금예정일</th><th>상태</th><th>본부</th><th>고객사</th><th>프로젝트</th>
    <th>수금유형</th><th class="num">받을 금액</th><th>처리</th></tr>`;
  let total = 0;
  document.getElementById('detailBody').innerHTML = rows.map(r => {
    total += r.sales_amount || 0;
    const overdue = r.payment_due_date && r.payment_due_date < today;
    return `<tr>
      <td class="nowrap ${overdue?'text-danger fw-bold':''}">${r.payment_due_date||'-'}</td>
      <td>${dueBadge(r.payment_due_date, today)}</td>
      <td>${esc(r.division_name||'')}</td>
      <td>${esc(r.customer_name||'')}</td>
      <td><span class="proj-link" data-pid="${r.project_id}" style="color:#2563eb;cursor:pointer;text-decoration:underline;">[${r.project_code}] ${esc(r.project_name)}</span></td>
      <td>${esc(r.collection_type||'')}</td>
      <td class="num fw-bold">${f(r.sales_amount)}</td>
      <td><button class="btn btn-sm btn-success" data-recv="${r.id}">입금 처리</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty">받을 돈이 없습니다.</td></tr>`;
  document.getElementById('detailFoot').innerHTML = rows.length ?
    `<tr style="background:#f1f5f9;font-weight:700;"><td colspan="6" class="text-right">합계 ${rows.length}건</td><td class="num text-success">${f(total)}</td><td></td></tr>` : '';

  bindDetailEvents();
  document.querySelectorAll('[data-recv]').forEach(b => b.onclick = async () => {
    if (!confirm('이 매출을 입금 완료 처리하시겠습니까?')) return;
    await api.patch('/api/sales/' + b.dataset.recv + '/paid', { paid: 'Y' });
    toast('입금 처리되었습니다.', 'success');
    await load();
  });
}

function renderPayables({ today, rows }) {
  document.getElementById('detailHead').innerHTML = `<tr>
    <th>지급예정일</th><th>상태</th><th>본부</th><th>매입업체</th><th>프로젝트</th>
    <th>구분</th><th class="num">줄 금액</th><th>처리</th></tr>`;
  let total = 0;
  document.getElementById('detailBody').innerHTML = rows.map(r => {
    total += r.purchase_amount || 0;
    const overdue = r.payment_due_date && r.payment_due_date < today;
    return `<tr>
      <td class="nowrap ${overdue?'text-danger fw-bold':''}">${r.payment_due_date||'-'}</td>
      <td>${dueBadge(r.payment_due_date, today)}</td>
      <td>${esc(r.division_name||'')}</td>
      <td>${esc(r.vendor||'')}</td>
      <td><span class="proj-link" data-pid="${r.project_id}" style="color:#2563eb;cursor:pointer;text-decoration:underline;">[${r.project_code}] ${esc(r.project_name)}</span></td>
      <td>${esc(r.purchase_code||'')}</td>
      <td class="num fw-bold">${f(r.purchase_amount)}</td>
      <td><button class="btn btn-sm btn-danger" data-pay="${r.id}">지급 처리</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty">줄 돈이 없습니다.</td></tr>`;
  document.getElementById('detailFoot').innerHTML = rows.length ?
    `<tr style="background:#f1f5f9;font-weight:700;"><td colspan="6" class="text-right">합계 ${rows.length}건</td><td class="num text-danger">${f(total)}</td><td></td></tr>` : '';

  bindDetailEvents();
  document.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => {
    if (!confirm('이 매입을 지급 완료 처리하시겠습니까?')) return;
    await api.patch('/api/purchases/' + b.dataset.pay + '/paid', { paid: 'Y' });
    toast('지급 처리되었습니다.', 'success');
    await load();
  });
}

function bindDetailEvents() {
  document.querySelectorAll('#detailBody .proj-link').forEach(el => el.onclick = () => {
    openDetailPopup(el.dataset.pid, () => load());
  });
}

init();
