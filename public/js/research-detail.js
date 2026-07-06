renderLayout('과제 상세');

const RID = qs('id');
const RESEARCH_STAGES = ['기획', '신청', '선정', '협약체결', '수행중', '최종평가', '종료'];
const COST_CATEGORIES = ['인건비', '학생인건비', '연구장비·재료비', '연구활동비', '연구수당', '위탁연구개발비', '간접비', '기타'];
const MEMBER_ROLES = ['연구책임자', '공동연구원', '연구원', '연구보조원', '외부참여연구원'];

let research = null, divisions = [], employees = [];

function esca(s) { return s == null ? '' : String(s).replace(/"/g, '&quot;'); }

async function init() {
  if (qs('popup') === '1') { const b = document.getElementById('listBtn'); if (b) b.style.display = 'none'; }
  [divisions, employees] = await Promise.all([
    api.get('/api/masters/divisions'),
    api.get('/api/masters/users')
  ]);
  document.querySelectorAll('#detailTabs .tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('#detailTabs .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      loadTab(tab.dataset.tab);
    };
  });
  document.getElementById('saveBtn').onclick = saveBasic;
  document.getElementById('deleteBtn').onclick = async () => {
    if (!confirm('이 과제를 삭제하시겠습니까?')) return;
    await api.del('/api/research/' + RID);
    toast('삭제되었습니다.', 'success');
    if (qs('popup') === '1') parent.postMessage('close-popup', '*'); else location.href = 'research.html';
  };
  await loadResearch();
  loadTab('basic');
}

async function loadResearch() {
  research = await api.get('/api/research/' + RID);
  document.getElementById('resTitle').textContent = `[${research.project_code}] ${research.project_name}`;
  renderStageFlow();
}

function renderStageFlow() {
  const cur = RESEARCH_STAGES.indexOf(research.research_stage);
  document.getElementById('stageFlow').innerHTML = RESEARCH_STAGES.map((s, i) => {
    const done = cur >= 0 && i <= cur;
    return `<div class="status-step ${done ? 'done' : ''} ${s === research.research_stage ? 'current' : ''}" data-stage="${s}"
      style="cursor:pointer;${s === research.research_stage ? 'font-weight:700;color:#2563eb;' : 'color:#94a3b8;'}">
      <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;margin-right:4px;background:${s === research.research_stage ? '#2563eb' : (done ? '#93c5fd' : '#e2e8f0')};color:#fff;font-size:11px;">${i + 1}</span>${s}</div>`;
  }).join('<span style="color:#cbd5e1;margin:0 4px;">›</span>');
  document.querySelectorAll('#stageFlow [data-stage]').forEach(el => el.onclick = async () => {
    research.research_stage = el.dataset.stage;
    await api.put('/api/research/' + RID, researchBody());
    toast('진행단계: ' + el.dataset.stage, 'success');
    renderStageFlow();
  });
}

function researchBody() {
  return {
    project_name: research.project_name, division_id: research.division_id, manager_id: research.manager_id,
    pm_id: research.pm_id, customer_id: research.customer_id, prime_contractor: research.prime_contractor,
    specialized_agency: research.specialized_agency, business_year: research.business_year,
    start_date: research.start_date, end_date: research.end_date, total_budget: research.total_budget,
    gov_fund: research.gov_fund, private_cash: research.private_cash, private_inkind: research.private_inkind,
    research_stage: research.research_stage, research_year_no: research.research_year_no,
    research_total_years: research.research_total_years, overview: research.overview
  };
}

function loadTab(name) {
  if (name === 'basic') return renderBasic();
  if (name === 'members') return loadMembers();
  if (name === 'costs') return loadCosts();
  if (name === 'funds') return loadFunds();
  if (name === 'summary') return renderSummary();
}

// ===== 기본정보 =====
function renderBasic() {
  const r = research;
  const opt = (arr, val, idKey, labelKey) => arr.map(x => `<option value="${x[idKey]}" ${x[idKey] == val ? 'selected' : ''}>${x[labelKey]}</option>`).join('');
  document.getElementById('tab-basic').innerHTML = `
    <div class="card"><div class="card-body"><div class="grid-form" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px 24px;">
      <div class="form-row"><label>과제명</label><input id="b_name" value="${esca(r.project_name)}"></div>
      <div class="form-row"><label>주관본부</label><select id="b_div"><option value="">선택</option>${opt(divisions, r.division_id, 'id', 'name')}</select></div>
      <div class="form-row"><label>연구책임자</label><select id="b_lead"><option value="">선택</option>${opt(employees.filter(e=>!e.is_login), r.pm_id, 'id', 'name')}</select></div>
      <div class="form-row"><label>전문기관</label><input id="b_agency" value="${esca(r.specialized_agency)}" placeholder="예: IITP, NIPA, NRF"></div>
      <div class="form-row"><label>주관/수행기관</label><input id="b_prime" value="${esca(r.prime_contractor)}"></div>
      <div class="form-row"><label>협약연도</label><input id="b_year" type="number" value="${r.business_year || ''}"></div>
      <div class="form-row"><label>연구기간</label><div class="flex gap-8"><input id="b_sd" type="date" value="${r.start_date || ''}" style="flex:1;"><input id="b_ed" type="date" value="${r.end_date || ''}" style="flex:1;"></div></div>
      <div class="form-row"><label>연차 (현재 / 총)</label><div class="flex gap-8"><input id="b_yno" type="number" value="${r.research_year_no || ''}" style="width:80px;"> / <input id="b_tyears" type="number" value="${r.research_total_years || ''}" style="width:80px;"></div></div>
      <div class="form-row"><label>총연구비</label>${currencyHtml('b_budget', r.total_budget)}</div>
      <div class="form-row"><label>정부출연금</label>${currencyHtml('b_gov', r.gov_fund)}</div>
      <div class="form-row"><label>민간부담금(현금)</label>${currencyHtml('b_pcash', r.private_cash)}</div>
      <div class="form-row"><label>민간부담금(현물)</label>${currencyHtml('b_pinkind', r.private_inkind)}</div>
      <div class="form-row" style="grid-column:1/-1;"><label>과제 개요</label><textarea id="b_overview" rows="3">${esca(r.overview)}</textarea></div>
    </div></div></div>`;
  bindCurrencyInputs(document.getElementById('tab-basic'));
}

function collectBasic() {
  const g = id => document.getElementById(id);
  if (!g('b_name')) return;
  research.project_name = g('b_name').value.trim();
  research.division_id = Number(g('b_div').value) || null;
  research.pm_id = Number(g('b_lead').value) || null;
  research.specialized_agency = g('b_agency').value.trim() || null;
  research.prime_contractor = g('b_prime').value.trim() || null;
  research.business_year = Number(g('b_year').value) || null;
  research.start_date = g('b_sd').value || null;
  research.end_date = g('b_ed').value || null;
  research.research_year_no = Number(g('b_yno').value) || null;
  research.research_total_years = Number(g('b_tyears').value) || null;
  research.total_budget = currencyValue(g('b_budget'));
  research.gov_fund = currencyValue(g('b_gov'));
  research.private_cash = currencyValue(g('b_pcash'));
  research.private_inkind = currencyValue(g('b_pinkind'));
  research.overview = g('b_overview').value.trim() || null;
}

async function saveBasic() {
  collectBasic();
  await api.put('/api/research/' + RID, researchBody());
  toast('저장되었습니다.', 'success');
  await loadResearch();
}

// ===== 참여연구원 =====
async function loadMembers() {
  const rows = await api.get('/api/research-members?project_id=' + RID);
  const monthTh = Array.from({ length: 12 }, (_, i) => `<th style="width:48px;">${i + 1}월</th>`).join('');
  document.getElementById('tab-members').innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>참여연구원 <small class="text-muted" style="font-size:12px;">${rows.length}명 · 월별 참여율(%)</small></h3>
        <div class="flex gap-8" style="align-items:center;">
          <div id="mPick" style="min-width:240px;"></div>
          <button class="btn btn-primary btn-sm" id="addM">+ 추가</button>
        </div>
      </div>
      <div class="card-body"><div class="table-wrap"><table class="inline-edit">
        <thead><tr><th style="width:110px;">역할</th><th style="width:96px;">성명</th><th style="width:120px;">소속</th><th style="width:70px;">직급</th>
          ${monthTh}
          <th style="width:130px;">연 인건비</th><th style="width:130px;">배분 인건비</th><th class="act-cell"></th></tr></thead>
        <tbody id="mBody"></tbody>
      </table></div>
      <div class="text-muted" style="font-size:12px;margin-top:8px;">※ 성명을 클릭하면 해당 직원의 월별 잔여 참여율(같은 사업연도 모든 과제 합산)을 확인할 수 있습니다. · 배분 인건비 = 연 인건비 × (12개월 평균 참여율).</div>
      </div>
    </div>`;
  renderMemberRows(rows);
  // 직원 선택 콤보
  const opts = employees.filter(e => !e.is_login && e.active)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    .map(e => ({ value: String(e.id), label: `${e.name}${e.hq ? ' · ' + e.hq : ''}${e.position ? ' ' + e.position : ''}` }));
  let pickedId = '';
  new SearchableSelect(document.getElementById('mPick'), { options: opts, placeholder: '직원 검색하여 선택...', onChange: v => { pickedId = v; } });
  document.getElementById('addM').onclick = async () => {
    if (!pickedId) { toast('추가할 직원을 선택하세요.', 'error'); return; }
    const emp = employees.find(e => String(e.id) === String(pickedId));
    if (!emp) { toast('직원 정보를 찾을 수 없습니다.', 'error'); return; }
    if (rows.some(r => (emp.employee_number && r.employee_number === emp.employee_number) || r.name === emp.name)) {
      toast('이미 추가된 직원입니다.', 'error'); return;
    }
    await api.post('/api/research-members', {
      project_id: Number(RID), role: '연구원', name: emp.name,
      org: emp.hq || null, position: emp.position || null, employee_number: emp.employee_number || null
    });
    loadMembers();
  };
}
function renderMemberRows(rows) {
  const body = document.getElementById('mBody');
  const monthCells = (r) => Array.from({ length: 12 }, (_, i) => {
    const v = r['m' + (i + 1)];
    return `<td style="padding:2px;"><input type="number" class="m-mo" data-mo="${i + 1}" value="${v ?? ''}" min="0" max="100" step="0.1" style="width:44px;text-align:right;padding:4px 3px;"></td>`;
  }).join('');
  body.innerHTML = rows.map(r => `
    <tr data-id="${r.id}" data-empno="${esca(r.employee_number)}" data-name="${esca(r.name)}">
      <td><select class="m-role">${MEMBER_ROLES.map(x => `<option ${r.role === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td><a class="m-name-link" style="color:#2563eb;cursor:pointer;text-decoration:underline;font-weight:600;white-space:nowrap;" title="월별 잔여 참여율 보기">${esc(r.name || '(미지정)')}</a></td>
      <td><input class="m-org" value="${esca(r.org)}" placeholder="소속" style="width:112px;"></td>
      <td><input class="m-pos" value="${esca(r.position)}" placeholder="직급" style="width:64px;"></td>
      ${monthCells(r)}
      <td>${currencyHtml('m-ac-' + r.id, r.annual_cost, { cls: 'm-ac' })}</td>
      <td><span class="m-lc ie-readonly" style="display:inline-block;padding:5px 7px;text-align:right;width:100%;font-variant-numeric:tabular-nums;">${fmtWon(r.labor_cost || 0)}</span></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save="${r.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del="${r.id}" title="삭제">🗑</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="19" class="empty">상단에서 직원을 선택해 참여연구원을 추가해주세요.</td></tr>`;
  bindCurrencyInputs(body);
  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const months = () => [...tr.querySelectorAll('.m-mo')].map(el => el.value === '' ? null : Number(el.value));
    const avg12 = () => months().reduce((s, v) => s + (v || 0), 0) / 12;
    const recalc = () => {
      const ac = currencyValue(tr.querySelector('.m-ac'));
      tr.querySelector('.m-lc').textContent = fmtWon(Math.round(ac * avg12() / 100));
    };
    tr.querySelectorAll('input,select').forEach(el => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
    tr.querySelector('.m-name-link').onclick = () => showAllocation(tr.dataset.name, tr.dataset.empno || '', tr.dataset.id);
    tr.querySelector('[data-save]').onclick = async () => {
      const ac = currencyValue(tr.querySelector('.m-ac'));
      const mo = months();
      const b = {
        project_id: Number(RID), role: tr.querySelector('.m-role').value, name: tr.dataset.name,
        employee_number: tr.dataset.empno || null,
        org: tr.querySelector('.m-org').value.trim(), position: tr.querySelector('.m-pos').value.trim(),
        participation_rate: Math.round(avg12() * 10) / 10, annual_cost: ac, labor_cost: Math.round(ac * avg12() / 100)
      };
      mo.forEach((v, i) => { b['m' + (i + 1)] = v; });
      await api.put('/api/research-members/' + tr.dataset.id, b);
      toast('저장되었습니다.', 'success');
    };
    tr.querySelector('[data-del]').onclick = async () => { if (!confirm('삭제하시겠습니까?')) return; await api.del('/api/research-members/' + tr.dataset.id); loadMembers(); };
  });
}

// 직원 월별 잔여 참여율 팝업 (같은 사업연도 모든 과제 합산)
async function showAllocation(name, empno, memberId) {
  const year = (research && research.business_year) || new Date().getFullYear();
  const q = empno ? ('employee_number=' + encodeURIComponent(empno)) : ('name=' + encodeURIComponent(name || ''));
  let data;
  try { data = await api.get('/api/research-members/allocation?' + q + '&year=' + year); }
  catch (e) { toast('조회 실패: ' + e.message, 'error'); return; }
  const months = data.months || [];
  const monthTh = months.map(m => `<th style="text-align:center;">${m.month}월</th>`).join('');
  const allocTd = months.map(m => `<td style="text-align:right;">${m.allocated ? m.allocated + '%' : '-'}</td>`).join('');
  const remainTd = months.map(m => {
    const c = m.remaining < 0 ? '#dc2626' : (m.remaining < 100 ? '#2563eb' : '#16a34a');
    return `<td style="text-align:right;font-weight:700;color:${c};">${m.remaining}%</td>`;
  }).join('');
  const projRows = (data.projects || []).map(p =>
    `<tr><td style="white-space:nowrap;">[${esc(p.project_code)}] ${esc(p.project_name)}</td>${p.m.map(v => `<td style="text-align:right;">${v ? v + '%' : '-'}</td>`).join('')}</tr>`
  ).join('') || `<tr><td colspan="13" class="empty">배정된 과제가 없습니다.</td></tr>`;
  const back = openModal(`${esc(name)} · ${year}년 월별 참여율 현황`, `
    <div class="table-wrap"><table class="data">
      <thead><tr><th style="width:90px;">구분</th>${monthTh}</tr></thead>
      <tbody>
        <tr><td style="font-weight:600;">배정 합계</td>${allocTd}</tr>
        <tr><td style="font-weight:600;">잔여</td>${remainTd}</tr>
      </tbody>
    </table></div>
    <div style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:600;color:#475569;">과제별 배정 (${(data.projects || []).length}건)</div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th style="min-width:220px;">과제</th>${months.map(m => `<th style="text-align:center;">${m.month}</th>`).join('')}</tr></thead>
      <tbody>${projRows}</tbody>
    </table></div>
    <div class="text-muted" style="font-size:12px;margin-top:8px;">※ 잔여 = 100% − (같은 사업연도 전체 과제 배정 합계). 빨강은 100% 초과(과배정)입니다.</div>
  `, () => true, { saveText: '확인' });
  const modalEl = back.querySelector('.modal');
  if (modalEl) { modalEl.style.maxWidth = '920px'; modalEl.style.width = '94vw'; }
}

// ===== 연구비 집행 =====
async function loadCosts() {
  const rows = await api.get('/api/research-costs?project_id=' + RID);
  document.getElementById('tab-costs').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>연구비 집행 <small class="text-muted" style="font-size:12px;">인건비 외 직접비/간접비 포함</small></h3><button class="btn btn-primary btn-sm" id="addC">+ 추가</button></div>
      <div class="card-body"><div class="table-wrap"><table class="inline-edit">
        <thead><tr><th style="width:150px;">비목</th><th>세부항목</th><th style="width:70px;">연차</th>
          <th style="width:140px;">계획액</th><th style="width:140px;">집행액</th><th style="width:130px;">집행일</th><th>거래처</th><th class="act-cell"></th></tr></thead>
        <tbody id="cBody"></tbody>
        <tfoot id="cFoot"></tfoot>
      </table></div></div>
    </div>`;
  renderCostRows(rows);
  document.getElementById('addC').onclick = async () => {
    await api.post('/api/research-costs', { project_id: Number(RID), category: '인건비' });
    loadCosts();
  };
}
function renderCostRows(rows) {
  const body = document.getElementById('cBody');
  body.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><select class="c-cat">${COST_CATEGORIES.map(x => `<option ${r.category === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td><input class="c-item" value="${esca(r.item_name)}" placeholder="세부항목"></td>
      <td><input type="number" class="c-yr" value="${r.year_no || ''}" style="width:56px;text-align:right;"></td>
      <td>${currencyHtml('c-pl-' + r.id, r.planned_amount, { cls: 'c-pl' })}</td>
      <td>${currencyHtml('c-ex-' + r.id, r.executed_amount, { cls: 'c-ex' })}</td>
      <td><input type="date" class="c-date" value="${r.exec_date || ''}"></td>
      <td><input class="c-vendor" value="${esca(r.vendor)}" placeholder="거래처"></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save="${r.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del="${r.id}" title="삭제">🗑</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="8" class="empty">연구비 집행 내역을 추가해주세요.</td></tr>`;
  bindCurrencyInputs(body);
  const foot = () => {
    const byCat = {};
    let plan = 0, exec = 0;
    body.querySelectorAll('tr[data-id]').forEach(tr => {
      const cat = tr.querySelector('.c-cat').value;
      const ex = currencyValue(tr.querySelector('.c-ex'));
      const pl = currencyValue(tr.querySelector('.c-pl'));
      byCat[cat] = (byCat[cat] || 0) + ex; exec += ex; plan += pl;
    });
    document.getElementById('cFoot').innerHTML = body.querySelector('tr[data-id]') ?
      `<tr style="background:#f1f5f9;font-weight:700;"><td colspan="3" style="text-align:right;">합계</td>
        <td class="num">${fmtWon(plan)}</td><td class="num">${fmtWon(exec)}</td><td colspan="3" style="font-size:11px;font-weight:400;color:var(--text-muted);text-align:left;">${Object.entries(byCat).map(([k, v]) => `${k} ${fmtWon(v)}`).join(' · ')}</td></tr>` : '';
  };
  foot();
  body.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.querySelectorAll('input,select').forEach(el => { el.addEventListener('input', foot); el.addEventListener('change', foot); });
    tr.querySelector('[data-save]').onclick = async () => {
      await api.put('/api/research-costs/' + tr.dataset.id, {
        project_id: Number(RID), category: tr.querySelector('.c-cat').value, item_name: tr.querySelector('.c-item').value.trim(),
        year_no: Number(tr.querySelector('.c-yr').value) || null, planned_amount: currencyValue(tr.querySelector('.c-pl')),
        executed_amount: currencyValue(tr.querySelector('.c-ex')), exec_date: tr.querySelector('.c-date').value || null,
        vendor: tr.querySelector('.c-vendor').value.trim() || null
      });
      toast('저장되었습니다.', 'success');
    };
    tr.querySelector('[data-del]').onclick = async () => { if (!confirm('삭제하시겠습니까?')) return; await api.del('/api/research-costs/' + tr.dataset.id); loadCosts(); };
  });
}

// ===== 연구비 수급 (project_sales 재사용) =====
async function loadFunds() {
  const rows = await api.get('/api/sales?project_id=' + RID);
  const total = rows.reduce((s, r) => s + (r.sales_amount || 0), 0);
  document.getElementById('tab-funds').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>연구비 수급 <small class="text-muted" style="font-size:12px;">정부출연금 등 입금</small></h3><button class="btn btn-primary btn-sm" id="addF">+ 추가</button></div>
      <div class="card-body"><div class="table-wrap"><table class="inline-edit">
        <thead><tr><th style="width:140px;">발행/입금일</th><th style="width:160px;">금액</th><th style="width:140px;">입금예정일</th><th style="width:90px;">입금여부</th><th class="act-cell"></th></tr></thead>
        <tbody id="fBody"></tbody>
        <tfoot><tr style="background:#f1f5f9;font-weight:700;"><td style="text-align:right;">합계</td><td class="num">${fmtWon(total)}</td><td colspan="3"></td></tr></tfoot>
      </table></div></div>
    </div>`;
  const body = document.getElementById('fBody');
  body.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input type="date" class="f-date" value="${r.invoice_date || ''}"></td>
      <td>${currencyHtml('f-amt-' + r.id, r.sales_amount, { cls: 'f-amt' })}</td>
      <td><input type="date" class="f-due" value="${r.payment_due_date || ''}"></td>
      <td><select class="f-paid"><option value="N" ${r.paid !== 'Y' ? 'selected' : ''}>N</option><option value="Y" ${r.paid === 'Y' ? 'selected' : ''}>Y</option></select></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save="${r.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del="${r.id}" title="삭제">🗑</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" class="empty">수급 내역을 추가해주세요.</td></tr>`;
  bindCurrencyInputs(body);
  document.getElementById('addF').onclick = async () => {
    await api.post('/api/sales', { project_id: Number(RID), invoice_date: new Date().toISOString().slice(0, 10), sales_amount: 0, vat: 0, total_amount: 0, paid: 'N', collection_type: '연구비', cash_or_note: '현금' });
    loadFunds();
  };
  body.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.querySelector('[data-save]').onclick = async () => {
      const amt = currencyValue(tr.querySelector('.f-amt'));
      await api.put('/api/sales/' + tr.dataset.id, {
        project_id: Number(RID), invoice_date: tr.querySelector('.f-date').value || null, sales_amount: amt, vat: 0, total_amount: amt,
        payment_due_date: tr.querySelector('.f-due').value || null, paid: tr.querySelector('.f-paid').value, collection_type: '연구비', cash_or_note: '현금'
      });
      toast('저장되었습니다.', 'success'); loadFunds();
    };
    tr.querySelector('[data-del]').onclick = async () => { if (!confirm('삭제하시겠습니까?')) return; await api.del('/api/sales/' + tr.dataset.id); loadFunds(); };
  });
}

// ===== 요약 =====
async function renderSummary() {
  const [members, costs, funds] = await Promise.all([
    api.get('/api/research-members?project_id=' + RID),
    api.get('/api/research-costs?project_id=' + RID),
    api.get('/api/sales?project_id=' + RID)
  ]);
  const labor = members.reduce((s, m) => s + (m.labor_cost || 0), 0);
  const exec = costs.reduce((s, c) => s + (c.executed_amount || 0), 0);
  const plan = costs.reduce((s, c) => s + (c.planned_amount || 0), 0);
  const received = funds.reduce((s, f) => s + (f.sales_amount || 0), 0);
  const budget = research.total_budget || 0;
  const card = (label, val, cls, sub) => `<div class="stat-card ${cls || ''}"><div class="label">${label}</div><div class="value">${fmtWon(val)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  document.getElementById('tab-summary').innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));">
      ${card('총연구비', budget, 'primary', `정부출연금 ${fmtWon(research.gov_fund)}`)}
      ${card('연구비 수급', received, 'success', '정부출연금 등 입금')}
      ${card('집행액', exec, 'warning', `계획 ${fmtWon(plan)}`)}
      ${card('집행잔액', budget - exec, (budget - exec) < 0 ? 'danger' : '', `집행률 ${budget ? Math.round(exec / budget * 100) : 0}%`)}
      ${card('참여 인건비(배분)', labor, '', `참여연구원 ${members.length}명`)}
    </div>`;
}

init();
