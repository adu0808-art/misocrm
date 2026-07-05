renderLayout('프로젝트 관리');

let divisions = [], customers = [], types = [], users = [], solutions = [];
let activeStatuses = new Set();
const sels = {};        // SearchableSelect 인스턴스
let table;              // SmartTable
let lastListCount = 0;

async function init() {
  [divisions, customers, types, users, solutions] = await Promise.all([
    api.get('/api/masters/divisions'),
    api.get('/api/masters/customers'),
    api.get('/api/masters/project-types'),
    api.get('/api/masters/users'),
    api.get('/api/masters/solutions')
  ]);

  setupFilters();
  setupTable();
  setupHandlers();
  load();
}

function setupFilters() {
  const cur = new Date().getFullYear();
  const years = [];
  for (let y = cur + 1; y >= cur - 3; y--) years.push({ value: y, label: y + '년' });
  sels.year = new SearchableSelect(document.getElementById('ss_year'),
    { options: years, value: cur, placeholder: '전체 연도', allowClear: false,
      onChange: () => { refreshDivOptions(); setupTable(); load(); } });

  sels.sales = new SearchableSelect(document.getElementById('ss_sales'),
    { options: users.map(u => ({ value: u.id, label: u.name })), placeholder: '선택안함' });
  sels.div = new SearchableSelect(document.getElementById('ss_div'),
    { options: divisionsForYear(divisions, cur).map(d => ({ value: d.id, label: d.name })), placeholder: '선택안함' });
  sels.mgr = new SearchableSelect(document.getElementById('ss_mgr'),
    { options: users.map(u => ({ value: u.id, label: u.name })), placeholder: '선택안함' });
  sels.pm = new SearchableSelect(document.getElementById('ss_pm'),
    { options: users.map(u => ({ value: u.id, label: u.name })), placeholder: '선택안함' });
  sels.sol = new SearchableSelect(document.getElementById('ss_sol'),
    { options: solutions.map(s => ({ value: s.id, label: s.name })), placeholder: '선택안함' });

  document.getElementById('ptype_radios').innerHTML = `
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:normal;"><input type="radio" name="ptype" value="" checked style="width:auto;"> 전체</label>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:normal;"><input type="radio" name="ptype" value="주관" style="width:auto;"> 주관</label>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:normal;"><input type="radio" name="ptype" value="참여" style="width:auto;"> 참여</label>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:normal;"><input type="radio" name="ptype" value="하도" style="width:auto;"> 하도</label>`;

  document.getElementById('f_types_wrap').innerHTML =
    `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:normal;"><input type="radio" name="f_type" value="" checked style="width:auto;"> 전체</label>` +
    types.map(t => `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:normal;"><input type="radio" name="f_type" value="${t.id}" style="width:auto;"> ${t.name}${t.is_internal?' <small style="color:#999">(내부)</small>':''}</label>`).join('');
}

// 선택 연도에 유효한 본부만 주관본부 드롭다운에 표시
function refreshDivOptions() {
  if (!sels.div) return;
  const year = Number(sels.year ? sels.year.getValue() : new Date().getFullYear());
  const opts = divisionsForYear(divisions, year);
  const cur = sels.div.getValue();
  sels.div.setOptions(opts.map(d => ({ value: d.id, label: d.name })));
  // 현재 선택 본부가 해당 연도에 유효하지 않으면 초기화
  if (cur && !opts.some(d => String(d.id) === String(cur))) sels.div.setValue('');
}

function setupTable() {
  const year = Number(sels.year ? sels.year.getValue() : new Date().getFullYear());

  const columns = [
    { key: 'is_favorite', label: '★', width: 50, sortable: false,
      render: row => `<span class="star ${row.is_favorite?'on':''}" data-fav="${row.id}" style="cursor:pointer;">★</span>` },
    { key: 'division_name', label: '주관본부', width: 130 },
    { key: 'project_code', label: '프로젝트코드', width: 110 },
    { key: 'status', label: '진행상태', width: 90,
      render: row => `<span class="badge badge-${row.status}">${row.status}</span>` },
    { key: 'customer_name', label: '고객사', width: 160,
      render: row => row.customer_id
        ? `<span class="cust-info-link no-row-click" data-cid="${row.customer_id}" style="color:#2563eb;text-decoration:underline;cursor:pointer;">${escHtml(row.customer_name||'')}</span>`
        : escHtml(row.customer_name||'') },
    { key: 'project_name', label: '프로젝트명', width: 260,
      render: row => `<span class="proj-name-link no-row-click" data-pid="${row.id}" style="color:#2563eb;text-decoration:underline;cursor:pointer;">${escHtml(row.project_name)}</span>` },
    { key: 'start_date', label: '사업시기', width: 100,
      render: row => (row.start_date || '').replace(/-/g,'.').slice(0,10) },
    { key: 'intro_channel', label: '소개경로', width: 110 },
    { key: 'prime_contractor', label: '원도급사', width: 150,
      render: row => row.prime_contractor
        ? `<span class="prime-info-link no-row-click" data-name="${escAttr(row.prime_contractor)}" style="color:#0891b2;text-decoration:underline;cursor:pointer;">${escHtml(row.prime_contractor)}</span>`
        : '' },
    { key: 'total_budget', label: '사업예산', width: 130, align: 'right',
      render: row => fmtWon(row.total_budget) },
    { key: 'participation_type', label: '참여형태', width: 80 },
    { key: 'participation_amount', label: '참여금액', width: 130, align: 'right',
      render: row => fmtWon(row.participation_amount) },
    // 당해 매출: project_sales.invoice_date 기준 해당 연도 매출 합계
    { key: 'year_sales', label: `당해 매출 (${year})`, width: 140, align: 'right',
      render: row => fmtWon(row.year_sales || 0) },
    // 당해 매입: project_purchases.invoice_date 기준 해당 연도 매입 합계
    { key: 'year_purchase', label: `당해 매입 (${year})`, width: 140, align: 'right',
      render: row => fmtWon(row.year_purchase || 0) },
    { key: 'win_probability', label: '예상수주확률', width: 100, align: 'right',
      render: row => fmtPct(row.win_probability) },
    { key: 'expected_revenue', label: '예상매출금액', width: 130, align: 'right',
      render: row => fmtWon(row.expected_revenue) }
  ];

  table = new SmartTable(document.getElementById('projTable'), {
    storageKey: 'miso_projects_table_v3',
    idKey: 'id',
    columns,
    footer: (totals) => {
      if (!totals) return null;
      const map = {
        is_favorite: `<span style="font-weight:600;font-size:12px;">합계</span>`,
        division_name: `<span style="font-size:12px;color:#64748b;">${fmtNum(lastListCount)}건 / 전체 ${fmtNum(totals.cnt)}건</span>`,
        total_budget: fmtWon(totals.total_budget),
        participation_amount: fmtWon(totals.participation_amount),
        year_sales: fmtWon(totals.year_sales || 0),
        year_purchase: fmtWon(totals.year_purchase || 0),
        expected_revenue: fmtWon(totals.expected_revenue)
      };
      return map;
    }
    // 인라인 펼침 제거 (renderExpanded 없음) - 고객사/원도급사/프로젝트명 클릭은 모달로 처리
  });

  // 이벤트 위임: 즐겨찾기 별 + 프로젝트명/고객사/원도급사 클릭
  document.getElementById('projTable').addEventListener('click', async (e) => {
    // 프로젝트명 → 상세 팝업
    const nameLink = e.target.closest('.proj-name-link');
    if (nameLink) {
      e.stopPropagation();
      const pid = nameLink.dataset.pid;
      if (pid) openDetailPopup(pid, () => load());
      return;
    }
    // 고객사 → 고객사 정보 모달
    const custLink = e.target.closest('.cust-info-link');
    if (custLink) {
      e.stopPropagation();
      const cid = custLink.dataset.cid;
      if (cid) openCustomerInfoPopup(cid);
      return;
    }
    // 원도급사 → 원도급사 정보 모달
    const primeLink = e.target.closest('.prime-info-link');
    if (primeLink) {
      e.stopPropagation();
      const name = primeLink.dataset.name;
      if (name) openPrimeContractorPopup(name);
      return;
    }
    // 즐겨찾기 별
    const star = e.target.closest('[data-fav]');
    if (!star) return;
    e.stopPropagation();
    const id = star.dataset.fav;
    const cur = star.classList.contains('on');
    star.classList.toggle('on');
    try { await api.patch('/api/projects/' + id + '/favorite', { is_favorite: !cur }); }
    catch (err) { star.classList.toggle('on'); toast(err.message, 'error'); }
  });
}

function setupHandlers() {
  document.getElementById('searchBtn').onclick = load;
  document.getElementById('resetBtn').onclick = resetFilters;
  document.getElementById('addBtn').onclick = openNew;
  document.getElementById('favBtn').onclick = () => {
    document.getElementById('favBtn').classList.toggle('btn-primary');
    load();
  };
  document.getElementById('dlBtn').onclick = downloadCsv;
  document.getElementById('periodBtn').onclick = openPeriodView;
  document.getElementById('colSettingsBtn').onclick = () => {
    if (table && typeof table.openColumnPicker === 'function') table.openColumnPicker();
  };
  document.getElementById('resetColsBtn').onclick = () => {
    if (!confirm('컬럼 폭/순서/정렬/높이 설정을 초기화할까요?')) return;
    localStorage.removeItem('miso_projects_table_v3');
    localStorage.removeItem('miso_projects_table_v2'); // 이전 키도 정리
    setupTable();
    load();
  };
  ['f_code','f_intro','f_cust','f_name'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
  });
}

function resetFilters() {
  sels.year.setValue(new Date().getFullYear());
  Object.entries(sels).forEach(([k, s]) => { if (k !== 'year') s.setValue(''); });
  ['f_code','f_intro','f_cust','f_name'].forEach(id => document.getElementById(id).value = '');
  document.querySelector('input[name="ptype"][value=""]').checked = true;
  document.querySelector('input[name="f_type"][value=""]').checked = true;
  document.getElementById('f_has_tx').checked = false;
  document.getElementById('f_sw_only').checked = false;
  document.getElementById('f_excl_internal').checked = true;
  document.getElementById('favBtn').classList.remove('btn-primary');
  activeStatuses.clear();
  setupTable();
  load();
}

function buildParams() {
  const p = new URLSearchParams();
  const get = id => document.getElementById(id).value;
  if (sels.year.getValue())  p.set('year', sels.year.getValue());
  if (sels.sales.getValue()) p.set('sales_rep_id', sels.sales.getValue());
  if (sels.div.getValue())   p.set('division_id', sels.div.getValue());
  if (sels.mgr.getValue())   p.set('manager_id', sels.mgr.getValue());
  if (sels.pm.getValue())    p.set('pm_id', sels.pm.getValue());
  if (sels.sol.getValue())   p.set('solution_id', sels.sol.getValue());
  if (get('f_code'))  p.set('project_code', get('f_code'));
  if (get('f_name'))  p.set('project_name', get('f_name'));
  if (get('f_cust'))  p.set('customer_keyword', get('f_cust'));
  if (get('f_intro')) p.set('intro_channel', get('f_intro'));
  const pt = document.querySelector('input[name="ptype"]:checked');
  if (pt && pt.value) p.set('participation_type', pt.value);
  const t = document.querySelector('input[name="f_type"]:checked');
  if (t && t.value) p.set('project_type_id', t.value);
  if (document.getElementById('f_has_tx').checked) p.set('has_transactions', '1');
  if (document.getElementById('f_sw_only').checked) p.set('sw_only', '1');
  if (document.getElementById('f_excl_internal').checked) p.set('exclude_internal', '1');
  if (document.getElementById('favBtn').classList.contains('btn-primary')) p.set('favorite_only', '1');
  if (activeStatuses.size > 0) p.set('statuses', Array.from(activeStatuses).join(','));
  return p;
}

function paramsWithoutStatus() {
  const p = buildParams(); p.delete('statuses'); return p.toString();
}

async function load() {
  const params = buildParams();
  const [list, agg, aggBase] = await Promise.all([
    api.get('/api/projects?' + params),
    api.get('/api/projects/aggregate?' + params),
    api.get('/api/projects/aggregate?' + paramsWithoutStatus())
  ]);
  renderStatusChips(aggBase.statuses);
  lastListCount = list.length;
  table.setData(list);
  table.setFooterData(agg.totals);   // ← 컬럼 이동 시에도 합계 유지됨
}

function renderStatusChips(statusCounts) {
  const map = Object.fromEntries(statusCounts.map(s => [s.status, s.cnt]));
  const total = statusCounts.reduce((a,b) => a + b.cnt, 0);
  const order = ['기획단계','영업단계','제안단계','수주완료','수행종료','수주실패','사업보류'];
  const chips = [{ key: '', label: '진행상태 전체', cnt: total, allBtn: true }]
    .concat(order.map(s => ({ key: s, label: s, cnt: map[s] || 0 })));
  const wrap = document.getElementById('statusChips');
  wrap.innerHTML = `<span class="text-muted" style="font-size:12px;font-weight:600;margin-right:4px;">조회결과</span>` +
    chips.map(c => {
      const isActive = c.key === '' ? activeStatuses.size === 0 : activeStatuses.has(c.key);
      return `<span class="status-chip ${c.allBtn?'all':''} ${isActive?'active':''}" data-st="${c.key}">
        <span>${c.label}</span><span class="cnt">${c.cnt}</span></span>`;
    }).join('');
  wrap.querySelectorAll('.status-chip').forEach(el => el.onclick = () => {
    const st = el.dataset.st;
    if (!st) activeStatuses.clear();
    else if (activeStatuses.has(st)) activeStatuses.delete(st);
    else activeStatuses.add(st);
    load();
  });
}

// ============ 인라인 확장(프로젝트 미리보기) ============
function renderProjectPreview(row) {
  const year = Number(sels.year.getValue());
  const fmt = v => v ? fmtWon(v) : '<span class="text-muted">-</span>';
  return `
    <div class="ex-head">
      <h4><span class="badge badge-${row.status}">${row.status}</span> [${row.project_code}] ${escHtml(row.project_name)}</h4>
      <div class="flex gap-8">
        <button class="btn btn-sm no-row-click" onclick="event.stopPropagation();(window.table||table).collapseExpanded();">닫기</button>
        <button class="btn btn-sm btn-primary no-row-click" onclick="event.stopPropagation();openDetailPopup(${row.id}, () => load());">상세 보기 (팝업) →</button>
      </div>
    </div>
    <div class="preview-grid">
      <div class="lbl">주관본부</div><div class="val">${row.division_name || '-'}</div>
      <div class="lbl">고객사</div><div class="val">${row.customer_name || '-'}</div>
      <div class="lbl">프로젝트유형</div><div class="val">${row.project_type_name || '-'}</div>

      <div class="lbl">영업담당</div><div class="val">${row.sales_rep_name || '-'}</div>
      <div class="lbl">사업담당</div><div class="val">${row.manager_name || '-'}</div>
      <div class="lbl">PM</div><div class="val">${row.pm_name || '-'}</div>

      <div class="lbl">사업시기</div><div class="val">${row.start_date || '-'} ~ ${row.end_date || '-'}</div>
      <div class="lbl">제안마감</div><div class="val">${row.proposal_deadline || '-'}</div>
      <div class="lbl">참여형태</div><div class="val">${row.participation_type || '-'} (${row.participation_rate||0}%)</div>

      <div class="lbl">사업예산</div><div class="val">${fmt(row.total_budget)}</div>
      <div class="lbl">참여금액</div><div class="val">${fmt(row.participation_amount)}</div>
      <div class="lbl">${year} 당해 매출</div><div class="val">${fmt(row.year_sales)}</div>

      <div class="lbl">${year} 당해 매입</div><div class="val">${fmt(row.year_purchase)}</div>
      <div class="lbl">수주확률</div><div class="val">${fmtPct(row.win_probability)}</div>
      <div class="lbl">예상매출</div><div class="val">${fmt(row.expected_revenue)}</div>

      <div class="lbl">원도급사</div><div class="val">${row.prime_contractor || '-'}</div>
      <div class="lbl">예상경쟁사</div><div class="val">${row.competitor || '-'}</div>
      <div class="lbl">소개경로</div><div class="val">${row.intro_channel || '-'}</div>

      <div class="lbl">사업개요</div><div class="val full" style="white-space:pre-wrap;max-height:200px;overflow-y:auto;background:#fff;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;">${escHtml(row.overview || '내용 없음')}</div>
    </div>`;
}

// 전역 노출(인라인 onclick에서 사용)
window.table = null;
const _origSetupTable = setupTable;
setupTable = function() { _origSetupTable(); window.table = table; };

function openNew() {
  const cur = new Date().getFullYear();
  let custSelect = null;
  openModal('신규 프로젝트', `
    <div class="grid-form">
      <div class="form-row"><label>프로젝트 코드</label><input id="m_code" placeholder="자동 부여 (유형+연도+번호)" disabled style="background:#f1f5f9;color:var(--text-muted);"></div>
      <div class="form-row"><label class="required">프로젝트명</label><input id="m_name"></div>
      <div class="form-row"><label>유형</label><select id="m_type">${types.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>상태</label><select id="m_status">${STATUSES.map(s=>`<option ${s==='기획단계'?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-row"><label>주관본부</label><select id="m_div"><option value="">선택</option>${divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>고객사</label>
        <div style="display:flex;gap:6px;align-items:stretch;">
          <div id="m_cust_wrap" style="flex:1;min-width:0;"></div>
          <button type="button" class="btn btn-sm btn-outline" id="m_cust_add" style="white-space:nowrap;flex-shrink:0;">+ 고객등록</button>
        </div>
      </div>
      <div class="form-row"><label>사업년도</label><input id="m_year" type="number" value="${cur}"></div>
      <div class="form-row"><label>총사업비</label>${currencyHtml('m_budget', 0)}</div>
    </div>`, async (m) => {
    const body = {
      project_name: m.querySelector('#m_name').value.trim(),
      project_type_id: Number(m.querySelector('#m_type').value),
      status: m.querySelector('#m_status').value,
      division_id: Number(m.querySelector('#m_div').value) || null,
      customer_id: custSelect ? (Number(custSelect.getValue()) || null) : null,
      business_year: Number(m.querySelector('#m_year').value),
      total_budget: currencyValue(m.querySelector('#m_budget')),
      participation_type: '참여',
      has_solution: 'N'
    };
    if (!body.project_name) { toast('프로젝트명은 필수입니다.', 'error'); return false; }
    const r = await api.post('/api/projects', body);   // 코드는 서버에서 자동 부여
    toast('등록되었습니다. 코드: ' + (r.project_code || '자동부여'), 'success');
    setTimeout(() => openDetailPopup(r.id, () => load()), 400);
  });

  // 모달 본문 삽입 후 — 고객사 검색 콤보박스 + 등록 버튼 연결
  custSelect = new SearchableSelect(document.getElementById('m_cust_wrap'), {
    options: customers.map(c => ({ value: c.id, label: c.name })),
    placeholder: '선택 또는 검색'
  });

  document.getElementById('m_cust_add').onclick = () => {
    openCustomerQuickAdd(async (created) => {
      // 고객사 마스터 목록 재조회 후 신규 고객 자동 선택
      try {
        customers = await api.get('/api/masters/customers');
        custSelect.setOptions(customers.map(c => ({ value: c.id, label: c.name })));
        if (created && created.id) custSelect.setValue(created.id);
      } catch (e) { toast('고객사 목록 갱신 실패: ' + e.message, 'error'); }
    });
  };
}

async function downloadCsv() {
  const params = buildParams();
  const list = await api.get('/api/projects?' + params);
  const year = Number(sels.year.getValue());
  const cols = table.cfg.columns.filter(c => c.key !== 'is_favorite');
  const rows = [cols.map(c => c.label)].concat(list.map(p =>
    cols.map(c => {
      if (c.key === 'start_date') return (p.start_date||'').slice(0,10);
      const v = p[c.key];
      if (typeof v === 'number') return v;
      return v ?? '';
    })
  ));
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `영업현황_${year}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escHtml(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escAttr(s) { return escHtml(s).replace(/`/g, '&#96;'); }

// ============================================================
// 사업시기 보기 - 간트 차트 + 리스트 (현재 필터된 프로젝트들)
// ============================================================
async function openPeriodView() {
  const params = buildParams();
  const list = await api.get('/api/projects?' + params);
  const havingDate = list.filter(p => p.start_date || p.end_date);

  let viewMode = 'list';
  const back = document.createElement('div');
  back.className = 'modal-backdrop open';
  back.innerHTML = `
    <div class="modal" style="max-width: 96vw; width: 96vw; height: 92vh; max-height: 92vh; display:flex;flex-direction:column;">
      <div class="modal-header">
        <h3>📅 사업시기 일정 (${havingDate.length}건 / 전체 ${list.length}건)</h3>
        <button class="close-x">&times;</button>
      </div>
      <div class="modal-body" style="overflow:hidden;flex:1;display:flex;flex-direction:column;padding:14px 18px;">
        <div class="schedule-view-toggle" style="margin-bottom:12px;align-self:flex-start;">
          <button class="btn btn-sm active" data-pv="list">📋 리스트</button>
          <button class="btn btn-sm" data-pv="gantt">📅 간트 차트</button>
        </div>
        <div id="period-view" style="flex:1;overflow:auto;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-act="close">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="close"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });

  const switchView = (v) => {
    viewMode = v;
    back.querySelectorAll('.schedule-view-toggle button').forEach(b => b.classList.toggle('active', b.dataset.pv === v));
    if (v === 'list') renderPeriodList(havingDate);
    else renderPeriodGantt(havingDate);
  };
  back.querySelectorAll('.schedule-view-toggle button').forEach(b => b.onclick = () => switchView(b.dataset.pv));
  switchView('list');
}

function calcMonths(s, e) {
  if (!s || !e) return '-';
  const sd = new Date(s), ed = new Date(e);
  if (isNaN(sd) || isNaN(ed)) return '-';
  const months = (ed.getFullYear() - sd.getFullYear()) * 12 + (ed.getMonth() - sd.getMonth()) + 1;
  return months;
}

function renderPeriodList(projects) {
  if (!projects.length) {
    document.getElementById('period-view').innerHTML = '<div class="empty">사업기간이 입력된 프로젝트가 없습니다.</div>';
    return;
  }
  // 시작일 오름차순
  const sorted = [...projects].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  document.getElementById('period-view').innerHTML = `
    <table class="data">
      <thead><tr>
        <th>본부</th>
        <th>코드</th>
        <th>상태</th>
        <th style="min-width:260px;">프로젝트명</th>
        <th>고객사</th>
        <th>원도급사</th>
        <th>시작일</th>
        <th>종료일</th>
        <th class="num">기간(개월)</th>
      </tr></thead>
      <tbody>${sorted.map(p => `
        <tr>
          <td>${escHtml(p.division_name||'')}</td>
          <td><span class="proj-name-link" data-pid="${p.id}" style="color:#2563eb;text-decoration:underline;cursor:pointer;font-variant-numeric:tabular-nums;">${escHtml(p.project_code)}</span></td>
          <td><span class="badge badge-${p.status}">${p.status}</span></td>
          <td>${escHtml(p.project_name)}</td>
          <td>${p.customer_id ? `<span class="cust-info-link" data-cid="${p.customer_id}" style="color:#2563eb;cursor:pointer;text-decoration:underline;">${escHtml(p.customer_name||'')}</span>` : ''}</td>
          <td>${p.prime_contractor ? `<span class="prime-info-link" data-name="${escAttr(p.prime_contractor)}" style="color:#0891b2;cursor:pointer;text-decoration:underline;">${escHtml(p.prime_contractor)}</span>` : '<span class="text-muted">-</span>'}</td>
          <td>${p.start_date || '-'}</td>
          <td>${p.end_date || '-'}</td>
          <td class="num">${calcMonths(p.start_date, p.end_date)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  bindPeriodLinks();
}

function renderPeriodGantt(projects) {
  if (!projects.length) {
    document.getElementById('period-view').innerHTML = '<div class="empty">사업기간이 입력된 프로젝트가 없습니다.</div>';
    return;
  }
  const valid = projects.filter(p => p.start_date && p.end_date);
  if (!valid.length) {
    document.getElementById('period-view').innerHTML = '<div class="empty">시작일과 종료일이 모두 입력된 프로젝트가 없습니다.</div>';
    return;
  }

  // 최소/최대 월
  let minDate = null, maxDate = null;
  valid.forEach(p => {
    const sd = new Date(p.start_date), ed = new Date(p.end_date);
    if (!minDate || sd < minDate) minDate = sd;
    if (!maxDate || ed > maxDate) maxDate = ed;
  });
  // 표시 범위: 시작일 ~ 종료일 사이의 모든 월
  const months = [];
  let m = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const endM = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  while (m <= endM) {
    months.push(new Date(m));
    m.setMonth(m.getMonth() + 1);
  }
  // 시작 시간 기준 정렬
  const sorted = [...valid].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

  const monthInRange = (m, sd, ed) => {
    const ms = new Date(m.getFullYear(), m.getMonth(), 1);
    const me = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    return sd <= me && ed >= ms;
  };
  const isStartMonth = (m, sd) => m.getFullYear() === sd.getFullYear() && m.getMonth() === sd.getMonth();
  const isEndMonth   = (m, ed) => m.getFullYear() === ed.getFullYear() && m.getMonth() === ed.getMonth();
  const today = new Date();

  const headerCells = months.map((m, i) => {
    const sep = i > 0 && months[i].getFullYear() !== months[i-1].getFullYear();
    return `<th class="gantt-month ${sep?'month-sep':''}">${String(m.getFullYear()).slice(2)}.${String(m.getMonth()+1).padStart(2,'0')}</th>`;
  }).join('');

  const bodyRows = sorted.map(p => {
    const sd = new Date(p.start_date), ed = new Date(p.end_date);
    const cells = months.map(m => {
      const active = monthInRange(m, sd, ed);
      let cls = 'gantt-cell';
      if (active) {
        cls += ' active';
        if (isStartMonth(m, sd)) cls += ' active-start';
        if (isEndMonth(m, ed))   cls += ' active-end';
      }
      const isCurrentMonth = m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth();
      const titleParts = [`${p.project_code} ${p.project_name}`, `${p.start_date} ~ ${p.end_date}`];
      return `<td class="${cls}" title="${escAttr(titleParts.join(' | '))}">${isCurrentMonth ? '<div class="now-marker" style="left:50%;"></div>' : ''}</td>`;
    }).join('');
    return `<tr>
      <td class="gantt-label">
        <span class="proj-name-link" data-pid="${p.id}" style="color:#2563eb;cursor:pointer;text-decoration:underline;">${escHtml(p.project_code)}</span>
        ${escHtml(p.project_name)}
        <small style="color:var(--text-muted);">${p.customer_name||''}</small>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  document.getElementById('period-view').innerHTML = `
    <div class="gantt-wrap">
      <table class="gantt-table">
        <thead><tr><th class="gantt-label">프로젝트 (${sorted.length}건)</th>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="text-muted" style="font-size:11px;margin-top:8px;">
      ※ 빨간 세로선: 오늘 (현재 월). 막대 시작/끝에 진한 테두리로 시작/종료 월 표시.
    </div>`;
  bindPeriodLinks();
}

function bindPeriodLinks() {
  // 프로젝트명 → 상세 팝업
  document.querySelectorAll('#period-view .proj-name-link').forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    openDetailPopup(el.dataset.pid, () => load());
  });
  // 고객사 → 고객정보 팝업
  document.querySelectorAll('#period-view .cust-info-link').forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    openCustomerInfoPopup(el.dataset.cid);
  });
  // 원도급사 → 원도급사 정보 팝업
  document.querySelectorAll('#period-view .prime-info-link').forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    openPrimeContractorPopup(el.dataset.name);
  });
}

// ============================================================
// 고객사 정보 + 관련 프로젝트 팝업
// ============================================================
async function openCustomerInfoPopup(customerId) {
  // 이미 정보 팝업이 떠 있으면 무시 (연속 클릭 중복 방지)
  if (document.querySelector('.modal-backdrop.over')) return;
  let customer = null, projList = [], contacts = [];
  try {
    [customer, projList, contacts] = await Promise.all([
      api.get('/api/masters/customers/' + customerId),
      api.get('/api/projects?customer_id=' + customerId),
      api.get('/api/customer-contacts?customer_id=' + customerId).catch(() => [])
    ]);
  } catch (e) { toast('고객사 정보 조회 실패: ' + e.message, 'error'); return; }

  const totalRev = projList.reduce((s, p) => s + (p.actual_revenue || 0), 0);
  const totalExp = projList.reduce((s, p) => s + (p.expected_revenue || 0), 0);
  const byStatus = {};
  projList.forEach(p => { byStatus[p.status] = (byStatus[p.status]||0) + 1; });

  const back = document.createElement('div');
  back.className = 'modal-backdrop over open';
  back.innerHTML = `
    <div class="modal" style="max-width: 980px;width:96vw;max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="background:#2563eb;color:#fff;border-bottom:none;">
        <h3 style="color:#fff;">🏢 ${escHtml(customer.name)}</h3>
        <button class="close-x" style="color:#fff;">&times;</button>
      </div>
      <div class="modal-body" style="overflow:auto;flex:1;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:16px;font-size:13px;">
          <div><span style="color:#64748b;width:90px;display:inline-block;">법인구분</span> ${escHtml(customer.legal_type||'-')}</div>
          <div><span style="color:#64748b;width:90px;display:inline-block;">기관유형</span> ${escHtml(customer.industry||'-')}</div>
          <div><span style="color:#64748b;width:90px;display:inline-block;">사업자번호</span> ${escHtml(customer.business_no||'-')}</div>
          <div><span style="color:#64748b;width:90px;display:inline-block;">법인번호</span> ${escHtml(customer.corp_no||'-')}</div>
          <div><span style="color:#64748b;width:90px;display:inline-block;">대표자명</span> ${escHtml(customer.ceo_name||'-')}</div>
          <div><span style="color:#64748b;width:90px;display:inline-block;">대표전화</span> ${escHtml(customer.ceo_phone||customer.phone||'-')}</div>
          <div><span style="color:#64748b;width:90px;display:inline-block;">상위도메인</span> ${escHtml(customer.top_domain||'-')}</div>
          <div><span style="color:#64748b;width:90px;display:inline-block;">하위도메인</span> ${escHtml(customer.sub_domain||'-')}</div>
          <div style="grid-column:1/-1;"><span style="color:#64748b;width:90px;display:inline-block;">주소</span> ${escHtml((customer.address||'') + (customer.detail_address ? ' ' + customer.detail_address : '') || '-')}</div>
        </div>

        ${contacts.length ? `
        <h4 style="margin:0 0 8px;font-size:13px;color:var(--text-muted);">담당자 (${contacts.length}명)</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
          ${contacts.map(c => `<div style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12px;background:#f8fafc;">
            ${c.is_primary?'★ ':''}<strong>${escHtml(c.name||'')}</strong>
            ${c.position?` <span class="text-muted">${escHtml(c.position)}</span>`:''}
            ${c.mobile||c.phone?` · ${escHtml(c.mobile||c.phone)}`:''}
          </div>`).join('')}
        </div>` : ''}

        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;">
          <h4 style="margin:0;font-size:14px;">관련 사업 <small style="font-weight:400;color:var(--text-muted);">${projList.length}건</small></h4>
          <div style="font-size:12px;color:var(--text-muted);">
            예상매출 합계 <strong style="color:var(--primary);">${fmtWon(totalExp)}</strong>
            · 실매출 합계 <strong style="color:var(--success);">${fmtWon(totalRev)}</strong>
          </div>
        </div>

        ${Object.keys(byStatus).length ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;">
          ${Object.entries(byStatus).map(([s, c]) => `<span class="badge badge-${s}">${s} ${c}</span>`).join('')}
        </div>` : ''}

        <div class="table-wrap"><table class="data" style="margin:0;">
          <thead><tr>
            <th>코드</th><th>프로젝트명</th><th>본부</th><th>상태</th>
            <th>사업시기</th><th class="num">예상매출</th><th class="num">실매출</th>
          </tr></thead>
          <tbody>${projList.length ? projList.map(p => `
            <tr>
              <td><span class="ci-proj-link" data-pid="${p.id}" style="cursor:pointer;color:#2563eb;text-decoration:underline;font-variant-numeric:tabular-nums;">${escHtml(p.project_code)}</span></td>
              <td>${escHtml(p.project_name)}</td>
              <td>${escHtml(p.division_name||'')}</td>
              <td><span class="badge badge-${p.status}">${p.status}</span></td>
              <td style="font-size:12px;">${p.start_date||'-'} ~ ${p.end_date||'-'}</td>
              <td class="num">${fmtWon(p.expected_revenue)}</td>
              <td class="num">${fmtWon(p.actual_revenue)}</td>
            </tr>`).join('') : '<tr><td colspan="7" class="empty">관련 프로젝트가 없습니다.</td></tr>'}
          </tbody>
        </table></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-act="close">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="close"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelectorAll('.ci-proj-link').forEach(el => el.onclick = () => {
    const pid = el.dataset.pid;
    close();
    openDetailPopup(pid, () => {});
  });
}

// ============================================================
// 원도급사 정보 + 관련 프로젝트 팝업
// ============================================================
async function openPrimeContractorPopup(name) {
  // 이미 정보 팝업이 떠 있으면 무시 (연속 클릭 중복 방지)
  if (document.querySelector('.modal-backdrop.over')) return;
  let projList = [];
  try {
    projList = await api.get('/api/projects?prime_contractor=' + encodeURIComponent(name));
  } catch (e) { toast('조회 실패: ' + e.message, 'error'); return; }

  const totalRev = projList.reduce((s, p) => s + (p.actual_revenue || 0), 0);
  const totalExp = projList.reduce((s, p) => s + (p.expected_revenue || 0), 0);
  const byStatus = {};
  projList.forEach(p => { byStatus[p.status] = (byStatus[p.status]||0) + 1; });

  const back = document.createElement('div');
  back.className = 'modal-backdrop over open';
  back.innerHTML = `
    <div class="modal" style="max-width: 900px;width:95vw;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="background:#0891b2;color:#fff;border-bottom:none;">
        <h3 style="color:#fff;">🏗 원도급사: ${escHtml(name)}</h3>
        <button class="close-x" style="color:#fff;">&times;</button>
      </div>
      <div class="modal-body" style="overflow:auto;flex:1;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
          <h4 style="margin:0;font-size:14px;">관련 사업 <small style="font-weight:400;color:var(--text-muted);">${projList.length}건</small></h4>
          <div style="font-size:12px;color:var(--text-muted);">
            예상매출 합계 <strong style="color:var(--primary);">${fmtWon(totalExp)}</strong>
            · 실매출 합계 <strong style="color:var(--success);">${fmtWon(totalRev)}</strong>
          </div>
        </div>
        ${Object.keys(byStatus).length ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;">
          ${Object.entries(byStatus).map(([s, c]) => `<span class="badge badge-${s}">${s} ${c}</span>`).join('')}
        </div>` : ''}
        <div class="table-wrap"><table class="data" style="margin:0;">
          <thead><tr>
            <th>코드</th><th>프로젝트명</th><th>본부</th><th>고객사</th><th>상태</th>
            <th>사업시기</th><th class="num">예상매출</th>
          </tr></thead>
          <tbody>${projList.length ? projList.map(p => `
            <tr>
              <td><span class="ci-proj-link" data-pid="${p.id}" style="cursor:pointer;color:#2563eb;text-decoration:underline;font-variant-numeric:tabular-nums;">${escHtml(p.project_code)}</span></td>
              <td>${escHtml(p.project_name)}</td>
              <td>${escHtml(p.division_name||'')}</td>
              <td>${escHtml(p.customer_name||'-')}</td>
              <td><span class="badge badge-${p.status}">${p.status}</span></td>
              <td style="font-size:12px;">${p.start_date||'-'} ~ ${p.end_date||'-'}</td>
              <td class="num">${fmtWon(p.expected_revenue)}</td>
            </tr>`).join('') : '<tr><td colspan="7" class="empty">관련 프로젝트가 없습니다.</td></tr>'}
          </tbody>
        </table></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-act="close">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="close"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelectorAll('.ci-proj-link').forEach(el => el.onclick = () => {
    const pid = el.dataset.pid;
    close();
    openDetailPopup(pid, () => {});
  });
}

init();
