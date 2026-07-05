// 공통 유틸 및 레이아웃

const NAV = [
  { section: '현황', items: [
    { href: 'index.html', label: '대시보드' },
    { href: 'cashflow.html', label: '자금현황' }
  ]},
  { section: '영업/프로젝트', items: [
    { href: 'projects.html', label: '프로젝트 관리' },
    { href: 'activities.html', label: '활동 이력' }
  ]},
  { section: '연구/과제', items: [
    { href: 'research.html', label: '과제 관리' }
  ]},
  { section: '계획/실적', items: [
    { href: 'targets.html', label: '영업목표 / 판관비' }
  ]},
  { section: '기준정보', items: [
    { href: 'masters.html?tab=divisions', label: '사업본부' },
    { href: 'masters.html?tab=users',     label: '사용자' },
    { href: 'masters.html?tab=employees', label: '직원' },
    { href: 'masters.html?tab=customers', label: '고객사' },
    { href: 'masters.html?tab=types',     label: '프로젝트 유형' },
    { href: 'masters.html?tab=solutions', label: '솔루션' }
  ]}
];

// 비밀번호 복잡도 검증 (대/소/숫자/특수 모두 포함, 8자 이상)
function passwordComplexityCheck(p) {
  if (!p) return '비밀번호를 입력하세요.';
  if (p.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (!/[a-z]/.test(p)) return '소문자를 포함해야 합니다.';
  if (!/[A-Z]/.test(p)) return '대문자를 포함해야 합니다.';
  if (!/\d/.test(p))    return '숫자를 포함해야 합니다.';
  if (!/[^a-zA-Z0-9]/.test(p)) return '특수문자(!@#$ 등)를 포함해야 합니다.';
  return null;
}
window.passwordComplexityCheck = passwordComplexityCheck;

function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function esc(s) { return _esc(s); }

// 본인 비밀번호 변경 모달 (사이드바 자물쇠 버튼)
function openChangePwModal() {
  const back = document.createElement('div');
  back.className = 'modal-backdrop open';
  back.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h3>🔒 비밀번호 변경</h3>
        <button class="close-x">&times;</button>
      </div>
      <div class="modal-body">
        <div class="pw-form">
          <div class="pw-field">
            <label for="cp_cur">현재 비밀번호</label>
            <input id="cp_cur" type="password" autocomplete="current-password" placeholder="현재 사용 중인 비밀번호">
          </div>
          <div class="pw-field">
            <label for="cp_new">새 비밀번호</label>
            <input id="cp_new" type="password" autocomplete="new-password" placeholder="영문 대/소문자 + 숫자 + 특수문자, 8자 이상">
          </div>
          <div class="pw-field">
            <label for="cp_new2">새 비밀번호 확인</label>
            <input id="cp_new2" type="password" autocomplete="new-password" placeholder="새 비밀번호 다시 입력">
            <div id="cp_match" class="pw-match"></div>
          </div>
          <div class="pw-checklist" id="cp_hint"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-act="cancel">취소</button>
        <button class="btn btn-primary" data-act="save">변경</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="cancel"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  const onEsc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);

  const hint  = back.querySelector('#cp_hint');
  const newEl = back.querySelector('#cp_new');
  const new2El = back.querySelector('#cp_new2');
  const matchEl = back.querySelector('#cp_match');

  const renderChecks = () => {
    const v = newEl.value;
    const checks = [
      { ok: v.length >= 8,           t: '8자 이상' },
      { ok: /[a-z]/.test(v),         t: '소문자' },
      { ok: /[A-Z]/.test(v),         t: '대문자' },
      { ok: /\d/.test(v),            t: '숫자' },
      { ok: /[^a-zA-Z0-9]/.test(v),  t: '특수문자' },
    ];
    hint.innerHTML = checks.map(c =>
      `<span class="pw-chk ${c.ok ? 'ok' : ''}">${c.ok ? '✓' : '○'} ${c.t}</span>`
    ).join('');
  };
  const renderMatch = () => {
    if (!new2El.value) { matchEl.textContent = ''; matchEl.className = 'pw-match'; return; }
    if (newEl.value === new2El.value) { matchEl.textContent = '✓ 일치합니다'; matchEl.className = 'pw-match ok'; }
    else { matchEl.textContent = '✗ 일치하지 않습니다'; matchEl.className = 'pw-match err'; }
  };
  newEl.addEventListener('input', () => { renderChecks(); renderMatch(); });
  new2El.addEventListener('input', renderMatch);
  renderChecks();

  setTimeout(() => back.querySelector('#cp_cur').focus(), 50);

  back.querySelector('[data-act="save"]').onclick = async () => {
    const cur = back.querySelector('#cp_cur').value;
    const n1  = newEl.value;
    const n2  = new2El.value;
    if (!cur) { toast('현재 비밀번호를 입력하세요.', 'error'); return; }
    const err = passwordComplexityCheck(n1);
    if (err) { toast(err, 'error'); return; }
    if (n1 !== n2) { toast('새 비밀번호 확인이 일치하지 않습니다.', 'error'); return; }
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: cur, next: n1 })
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); toast(e.error || '변경 실패', 'error'); return; }
      toast('비밀번호가 변경되었습니다. 다른 기기에서 자동 로그아웃됩니다.', 'success');
      close();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}
window.openChangePwModal = openChangePwModal;

function renderLayout(title) {
  const isPopup = new URL(location.href).searchParams.get('popup') === '1';
  if (isPopup) {
    document.body.classList.add('popup-mode');
  }

  // 팝업 모드가 아닐 때만 사이드바 렌더링
  if (!isPopup) {
    const here = location.pathname.split('/').pop() || 'index.html';
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    sidebar.innerHTML = `
      <div class="logo">MISO CRM <small>프로젝트 / 영업 관리</small></div>
      <nav>
        ${NAV.map(g => `
          <div class="nav-section">${g.section}</div>
          ${g.items.map(it => {
            const base = it.href.split('?')[0];
            const active = base === here ? 'active' : '';
            return `<a class="${active}" href="${it.href}">${it.label}</a>`;
          }).join('')}
        `).join('')}
      </nav>
      <div class="sidebar-user" id="sidebarUser">
        <div class="sb-user-info" id="sbUserInfo">로딩 중...</div>
        <div class="sb-user-actions">
          <button class="sb-action" id="sbChangePw" title="비밀번호 변경">🔒 비밀번호</button>
          <button class="sb-action" id="sbLogout" title="로그아웃">🚪 로그아웃</button>
        </div>
      </div>`;
    document.body.prepend(sidebar);

    // 현재 사용자 정보 표시 + 로그아웃 연결
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      const el = document.getElementById('sbUserInfo');
      if (!el) return;
      if (!d || !d.user) {
        el.innerHTML = '<a href="/login.html" style="color:#93c5fd;">로그인</a>';
        return;
      }
      const u = d.user;
      el.innerHTML = `
        <div style="font-weight:600;color:#fff;font-size:13px;">${esc(u.name)}</div>
        <div style="font-size:11px;color:#94a3b8;">@${esc(u.username)}${u.division_name?' · '+esc(u.division_name):''}</div>`;
    }).catch(()=>{});

    document.getElementById('sbLogout').onclick = async () => {
      if (!confirm('로그아웃 하시겠습니까?')) return;
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      location.href = '/login.html';
    };
    document.getElementById('sbChangePw').onclick = openChangePwModal;
  }

  const main = document.querySelector('.main');
  if (main && !isPopup) {
    const header = document.createElement('header');
    header.className = 'header';
    header.innerHTML = `
      <button class="menu-toggle" id="menuToggle" aria-label="메뉴">☰</button>
      <h1>${title || ''}</h1>`;
    main.prepend(header);
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  const toast = document.createElement('div');
  toast.id = 'toast-area';
  document.body.appendChild(toast);
}

function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.getElementById('toast-area').appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// API helper
const api = {
  async req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    if (!r.ok) {
      let payload = {};
      try { payload = await r.json(); } catch {}
      const err = new Error(payload.error || 'API 오류');
      err.data = payload;      // 서버가 함께 보낸 상세(예: 관련 사업 목록) 접근용
      err.status = r.status;
      throw err;
    }
    if (r.status === 204) return null;
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') ? r.json() : r.text();
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b); },
  put(p, b) { return this.req('PUT', p, b); },
  patch(p, b) { return this.req('PATCH', p, b); },
  del(p) { return this.req('DELETE', p); }
};

// Formatters
function fmtNum(n) {
  if (n == null || n === '') return '0';
  return Number(n).toLocaleString('ko-KR');
}
function fmtWon(n) { return fmtNum(n) + '원'; }
function fmtEok(n) {
  if (!n) return '0';
  const eok = n / 100000000;
  if (Math.abs(eok) >= 1) return eok.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억';
  const man = n / 10000;
  return man.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '만';
}
function fmtDate(d) { return d || ''; }
function fmtPct(n) {
  if (n == null) return '0%';
  return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '%';
}

// 화폐 단위 변환 (원/천원/만원/백만원/억원)
const UNIT_FACTORS = { '원': 1, '천원': 1000, '만원': 10000, '백만원': 1000000, '억원': 100000000 };
function fmtUnit(n, unit) {
  unit = unit || '억원';
  const factor = UNIT_FACTORS[unit] || 1;
  const value = (Number(n) || 0) / factor;
  const digits = (unit === '원' || unit === '천원') ? 0 : 1;
  return value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) + unit;
}

function qs(name, def) {
  const u = new URL(location.href);
  return u.searchParams.get(name) ?? def ?? '';
}

// ===== 사업본부 연도별 유효성 =====
// valid_from/valid_to (연도, NULL=제한없음) 기준으로 해당 연도에 유효한 본부인지 판단
function isDivisionValidForYear(d, year) {
  if (!d || !year) return true;
  const y = Number(year);
  const from = d.valid_from != null && d.valid_from !== '' ? Number(d.valid_from) : null;
  const to   = d.valid_to   != null && d.valid_to   !== '' ? Number(d.valid_to)   : null;
  return (from == null || from <= y) && (to == null || to >= y);
}
function divisionsForYear(list, year) {
  return (list || []).filter(d => isDivisionValidForYear(d, year));
}
// 유효기간 표기: null~null="전체", 2024~null="2024~", null~2025="~2025", 같으면 "2024"
function divisionValidLabel(d) {
  const f = d.valid_from != null && d.valid_from !== '' ? d.valid_from : null;
  const t = d.valid_to   != null && d.valid_to   !== '' ? d.valid_to   : null;
  if (f == null && t == null) return '전체';
  if (f != null && t != null) return f === t ? String(f) : `${f}~${t}`;
  if (f != null) return `${f}~`;
  return `~${t}`;
}

// Modal helper
function openModal(title, bodyHtml, onSave, options = {}) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop open';
  back.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="close-x">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-act="cancel">취소</button>
        <button class="btn btn-primary" data-act="save">${options.saveText || '저장'}</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  // Auto-bind currency inputs inside modal
  if (typeof bindCurrencyInputs === 'function') bindCurrencyInputs(back);
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="cancel"]').onclick = close;
  back.querySelector('[data-act="save"]').onclick = async () => {
    try {
      const ok = await onSave(back.querySelector('.modal-body'));
      if (ok !== false) close();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  return back;
}

function confirmDelete(msg, fn) {
  if (confirm(msg || '삭제하시겠습니까?')) fn();
}

// Statuses
const STATUSES = ['기획단계', '영업단계', '제안단계', '수주완료', '수행종료', '수주실패', '사업보류'];
const ACTIVE_STATUSES = ['기획단계', '영업단계', '제안단계', '수주완료', '수행종료'];

// Currency input helpers - format numbers with thousand separators while typing
// 정책: 값이 0이면 빈칸 + placeholder "0" 으로 표시하고,
//      포커스 시 0이면 자동으로 비워서 바로 입력 가능. blur 시 0이면 다시 빈칸.
function bindCurrencyInputs(scope) {
  (scope || document).querySelectorAll('input.currency').forEach(input => {
    if (input.dataset.cyBound) return;
    input.dataset.cyBound = '1';
    input.type = 'text';
    input.inputMode = 'numeric';
    if (!input.placeholder) input.placeholder = '0';

    const reformat = (clearZero) => {
      const raw = (input.value || '').replace(/[^\d\-]/g, '');
      if (!raw || raw === '-') { input.value = raw; return; }
      const neg = raw.startsWith('-');
      const digits = raw.replace(/-/g, '').replace(/^0+(?=\d)/, ''); // 05 → 5
      const num = Number(digits || 0);
      if (clearZero && num === 0) { input.value = ''; return; }
      input.value = (neg ? '-' : '') + num.toLocaleString('ko-KR');
    };

    // 입력 중에는 0도 그대로 표시 (콤마/leading-zero만 정리)
    input.addEventListener('input', () => reformat(false));
    // 포커스 진입 시 값이 0이면 비워서 바로 입력 가능
    input.addEventListener('focus', () => {
      const raw = (input.value || '').replace(/[^\d\-]/g, '');
      if (!raw || Number(raw) === 0) input.value = '';
    });
    // blur 시 0이면 빈칸으로 (placeholder가 "0" 힌트 역할)
    input.addEventListener('blur', () => reformat(true));

    // 초기 렌더 시에도 0이면 비움
    reformat(true);
  });
}
function currencyValue(input) {
  if (!input) return 0;
  const raw = (input.value || '').replace(/[^\d\-]/g, '');
  if (!raw || raw === '-') return 0;
  return Number(raw);
}
function currencyHtml(id, value, opts = {}) {
  const cls = (opts.cls || '');
  const num = Number(value || 0);
  const shown = num === 0 ? '' : num.toLocaleString('ko-KR');
  const placeholder = ` placeholder="${opts.placeholder || '0'}"`;
  return `<div class="currency-input"><input class="currency ${cls}" id="${id}" value="${shown}"${placeholder}></div>`;
}

window.api = api;
window.toast = toast;
window.fmtNum = fmtNum;
window.fmtWon = fmtWon;
window.fmtEok = fmtEok;
window.fmtPct = fmtPct;
window.fmtDate = fmtDate;
window.qs = qs;
window.openModal = openModal;
window.confirmDelete = confirmDelete;
window.renderLayout = renderLayout;
window.STATUSES = STATUSES;
window.ACTIVE_STATUSES = ACTIVE_STATUSES;
window.fmtUnit = fmtUnit;
window.UNIT_FACTORS = UNIT_FACTORS;
window.bindCurrencyInputs = bindCurrencyInputs;
window.currencyValue = currencyValue;
window.currencyHtml = currencyHtml;
window.isDivisionValidForYear = isDivisionValidForYear;
window.divisionsForYear = divisionsForYear;
window.divisionValidLabel = divisionValidLabel;

// 컬럼 표시/순서 관리 모달
// columns: [{key, label, visible}]  → onApply(updatedColumns)
function openColumnPicker(columns, onApply) {
  const items = columns.map(c => ({ ...c }));
  const back = document.createElement('div');
  back.className = 'modal-backdrop open';
  back.innerHTML = `
    <div class="modal" style="max-width: 460px;">
      <div class="modal-header">
        <h3>컬럼 표시 / 순서 설정</h3>
        <button class="close-x">&times;</button>
      </div>
      <div class="modal-body">
        <div class="text-muted mb-8" style="font-size:12px;">
          • 체크박스로 표시/숨김 토글<br>
          • 항목을 드래그하여 순서 변경<br>
          • 항목을 더블클릭하면 표시/숨김 토글
        </div>
        <div id="colPickerList" style="border:1px solid var(--border);border-radius:6px;overflow:hidden;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" data-act="all">전체 선택</button>
        <button class="btn" data-act="none">전체 해제</button>
        <button class="btn btn-outline" data-act="cancel">취소</button>
        <button class="btn btn-primary" data-act="apply">적용</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const listEl = back.querySelector('#colPickerList');
  const render = () => {
    listEl.innerHTML = items.map((c, i) => `
      <div class="col-picker-item" draggable="true" data-idx="${i}"
           style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:grab;border-bottom:1px solid var(--border);background:#fff;">
        <span style="color:#cbd5e1;font-size:14px;">⠿</span>
        <input type="checkbox" ${c.visible !== false ? 'checked' : ''} data-i="${i}" style="width:auto;">
        <span style="flex:1;font-size:13px;">${c.label}</span>
        <small class="text-muted" style="font-size:11px;">${c.key}</small>
      </div>`).join('');
    // 체크박스
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.onchange = () => { items[Number(cb.dataset.i)].visible = cb.checked; };
    });
    // 더블클릭 토글
    listEl.querySelectorAll('.col-picker-item').forEach(it => {
      it.ondblclick = (e) => {
        if (e.target.tagName === 'INPUT') return;
        const idx = Number(it.dataset.idx);
        items[idx].visible = !(items[idx].visible !== false);
        render();
      };
    });
    // 드래그 reorder
    let dragIdx = null;
    listEl.querySelectorAll('.col-picker-item').forEach(it => {
      it.ondragstart = (e) => { dragIdx = Number(it.dataset.idx); it.style.opacity = '0.4'; };
      it.ondragend = () => { it.style.opacity = '1'; dragIdx = null; };
      it.ondragover = (e) => { e.preventDefault(); it.style.boxShadow = 'inset 0 -2px 0 var(--primary)'; };
      it.ondragleave = () => { it.style.boxShadow = ''; };
      it.ondrop = (e) => {
        e.preventDefault();
        it.style.boxShadow = '';
        const toIdx = Number(it.dataset.idx);
        if (dragIdx == null || dragIdx === toIdx) return;
        const [moved] = items.splice(dragIdx, 1);
        items.splice(toIdx, 0, moved);
        render();
      };
    });
  };
  render();
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="cancel"]').onclick = close;
  back.querySelector('[data-act="all"]').onclick = () => { items.forEach(c => c.visible = true); render(); };
  back.querySelector('[data-act="none"]').onclick = () => { items.forEach(c => c.visible = false); render(); };
  back.querySelector('[data-act="apply"]').onclick = () => { onApply(items); close(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });
}
window.openColumnPicker = openColumnPicker;

// 사업자조회 (Bizno.net API) 모달
// onSelect(picked) - 결과 선택 시 콜백. picked = { company, bno, cno, bstt, taxtype, ... }
function openBiznoSearch(onSelect) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop over open';
  back.innerHTML = `
    <div class="modal" style="max-width: 760px;">
      <div class="modal-header">
        <h3>사업자 조회 <small class="text-muted" style="font-weight:400;font-size:11px;margin-left:6px;">국세청 등록 사업자 정보 (Bizno.net)</small></h3>
        <button class="close-x">&times;</button>
      </div>
      <div class="modal-body" style="padding: 12px 18px;">
        <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center;flex-wrap:wrap;">
          <div style="display:flex;gap:6px;flex:1;flex-wrap:wrap;min-width:0;align-items:center;">
            <select id="bz_gb" style="width:auto;flex-shrink:0;">
              <option value="">전체 검색</option>
              <option value="3">상호명</option>
              <option value="1">사업자등록번호</option>
              <option value="2">법인등록번호</option>
            </select>
            <input id="bz_q" placeholder="검색어 (상호명, 사업자/법인등록번호)" style="flex:1;min-width:200px;">
            <input id="bz_area" placeholder="지역(선택)" style="width:110px;flex-shrink:0;">
            <input id="bz_ceo" placeholder="대표자(선택)" style="width:110px;flex-shrink:0;">
          </div>
          <button class="btn btn-primary" id="bz_search" style="flex-shrink:0;white-space:nowrap;">🔍 조회</button>
        </div>
        <div id="bz_results" style="border:1px solid var(--border);border-radius:6px;min-height:200px;max-height:50vh;overflow:auto;">
          <div class="empty" style="padding:30px;">검색어를 입력하고 조회하세요.</div>
        </div>
        <div class="text-muted mt-8" style="font-size:11px;line-height:1.6;">
          * 행 클릭 시 자동 입력: 상호명 · 사업자번호 · 법인번호 · 법인구분<br>
          ※ <strong>대표자명 / 주소 / 업태 / 업종</strong>은 Bizno 무료 API 응답에 포함되지 않아 자동 채울 수 없습니다. 행 선택 후 직접 입력해주세요.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-act="close">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="close"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });

  const onEsc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);

  const doSearch = async () => {
    const q = back.querySelector('#bz_q').value.trim();
    if (!q) { toast('검색어를 입력하세요.', 'error'); return; }
    const params = new URLSearchParams();
    params.set('q', q);
    params.set('pagecnt', '20');
    const gb = back.querySelector('#bz_gb').value;
    const area = back.querySelector('#bz_area').value.trim();
    const ceo = back.querySelector('#bz_ceo').value.trim();
    if (gb) params.set('gb', gb);
    if (area) params.set('area', area);
    if (ceo) params.set('ceo', ceo);

    const resWrap = back.querySelector('#bz_results');
    resWrap.innerHTML = `<div class="empty" style="padding:30px;">조회 중...</div>`;
    try {
      const data = await api.get('/api/bizno/search?' + params.toString());
      // null/undefined 및 빈 객체 제거 (방어적)
      const items = (data.items || []).filter(it => it && (it.company || it.bno || it.cno));
      if (!items.length) {
        resWrap.innerHTML = `<div class="empty" style="padding:30px;">검색 결과가 없습니다. (전체 결과 ${data.total || 0}건)</div>`;
        return;
      }
      const statusColor = (s) => {
        if (!s) return 'var(--text-muted)';
        if (s.includes('계속')) return 'var(--success)';
        if (s.includes('휴업')) return 'var(--warning)';
        if (s.includes('폐업')) return 'var(--danger)';
        return 'var(--text-muted)';
      };
      resWrap.innerHTML = `
        <table class="data" style="margin:0;width:100%;">
          <thead><tr style="position:sticky;top:0;background:#f8fafc;">
            <th style="width:240px;">상호명</th>
            <th style="width:130px;">사업자번호</th>
            <th style="width:140px;">법인번호</th>
            <th style="width:100px;">상태</th>
            <th>과세유형</th>
          </tr></thead>
          <tbody>${items.map((it, i) => {
            const s = it.bstt || '';
            return `
            <tr data-i="${i}" style="cursor:pointer;">
              <td><strong>${escAttr(it.company || '')}</strong></td>
              <td style="font-variant-numeric:tabular-nums;">${escAttr(it.bno || '')}</td>
              <td style="font-variant-numeric:tabular-nums;">${escAttr(it.cno || '-')}</td>
              <td style="color:${statusColor(s)};font-weight:600;">${escAttr(s || '-')}</td>
              <td style="color:var(--text-muted);font-size:12px;">${escAttr(it.taxtype || '-')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
      resWrap.querySelectorAll('tr[data-i]').forEach(tr => {
        tr.onclick = () => {
          const idx = Number(tr.dataset.i);
          const picked = items[idx];
          if (!picked) return;
          if (typeof onSelect === 'function') onSelect(picked);
          close();
        };
        tr.onmouseenter = () => tr.style.background = '#dbeafe';
        tr.onmouseleave = () => tr.style.background = '';
      });
    } catch (e) {
      resWrap.innerHTML = `<div class="empty" style="padding:30px;color:var(--danger);">조회 실패: ${e.message || '알 수 없는 오류'}</div>`;
    }
  };

  back.querySelector('#bz_search').onclick = doSearch;
  back.querySelector('#bz_q').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  setTimeout(() => back.querySelector('#bz_q').focus(), 50);
}
function escAttr(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
window.openBiznoSearch = openBiznoSearch;

// 국세청 사업자등록 진위확인 (상태조회) — 공통 헬퍼
// btnEl: 클릭한 버튼 (로딩표시), bnoInputEl: 사업자번호 input, resultEl: 결과 표시 div(선택)
async function verifyBnoStatus(bnoInputEl, btnEl, resultEl) {
  const raw = String(bnoInputEl?.value || '').replace(/[^\d]/g, '');
  if (raw.length !== 10) {
    toast('사업자등록번호 10자리(숫자)를 입력하세요.', 'error');
    bnoInputEl?.focus();
    return null;
  }
  const orig = btnEl ? btnEl.textContent : null;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '확인 중...'; }
  try {
    const res = await api.post('/api/nts/status', { b_no: raw });
    const info = (res && res.data) ? res.data[0] : null;
    if (!info) { toast('조회 결과가 없습니다.', 'error'); return null; }

    const status = info.b_stt || '';
    const tax = info.tax_type || '';
    let kind = 'success';
    let label, color;
    if (!status) {                       // 등록되지 않은 번호
      kind = 'error'; label = '❌ 등록되지 않은 사업자등록번호';
      color = 'var(--danger)';
      toast('❌ ' + (tax || '등록되지 않은 사업자번호'), 'error');
    } else if (status === '계속사업자') {
      label = `✓ ${status} · ${tax}`; color = 'var(--success)';
      toast('✓ ' + status + (tax ? ' · ' + tax : ''), 'success');
    } else if (status === '폐업자') {
      kind = 'error'; label = `❌ ${status}${info.end_dt ? ' (' + info.end_dt + ')' : ''}`;
      color = 'var(--danger)';
      toast('⚠ ' + status, 'error');
    } else { // 휴업자 등
      kind = 'error'; label = `⚠ ${status}`; color = 'var(--warning)';
      toast('⚠ ' + status, 'error');
    }
    if (resultEl) {
      resultEl.innerHTML = `<span style="color:${color};font-weight:600;">${label}</span>` +
        `<span style="color:var(--text-muted);margin-left:8px;font-size:11px;">국세청 확인: ${new Date().toLocaleString('ko-KR')}</span>`;
    }
    return info;
  } catch (e) {
    toast('진위확인 실패: ' + e.message, 'error');
    if (resultEl) resultEl.innerHTML = `<span style="color:var(--danger);font-size:12px;">조회 실패: ${e.message}</span>`;
    return null;
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = orig || '✓ 확인'; }
  }
}
window.verifyBnoStatus = verifyBnoStatus;

// 고객사 빠른 등록 모달 (사업자조회 연계 포함)
// onCreated(newCustomer) - 등록 성공 시 호출
function openCustomerQuickAdd(onCreated) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop over open';
  back.innerHTML = `
    <div class="modal" style="max-width: 640px;">
      <div class="modal-header">
        <h3>고객사 빠른 등록</h3>
        <button class="close-x">&times;</button>
      </div>
      <div class="modal-body">
        <div class="text-muted mb-8" style="font-size:12px;">
          ※ 사업자조회 버튼으로 상호명/사업자번호/법인번호/법인구분이 자동 입력됩니다. 대표자명 등 나머지는 직접 입력하세요.
        </div>
        <div class="grid-form">
          <div class="form-row"><label class="required">고객사명</label><input id="cq_name"></div>
          <div class="form-row"><label>&nbsp;</label><button type="button" class="btn btn-sm btn-outline" id="cq_lookup" style="width:fit-content;">🔍 사업자조회</button></div>
          <div class="form-row"><label>개인법인구분</label><select id="cq_legal"><option>법인</option><option>개인</option><option>공공</option></select></div>
          <div class="form-row"><label>기관유형</label><select id="cq_industry"><option>민간</option><option>공공</option></select></div>
          <div class="form-row"><label>사업자등록번호</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <input id="cq_bizno" style="flex:1;min-width:0;" placeholder="000-00-00000">
              <button type="button" class="btn btn-sm" id="cq_verify" style="white-space:nowrap;flex-shrink:0;background:#16a34a;color:white;border-color:#16a34a;" title="국세청 사업자등록 상태 확인">✓ 확인</button>
            </div>
          </div>
          <div class="form-row"><label>&nbsp;</label><div id="cq_verify_result" style="font-size:12px;"></div></div>
          <div class="form-row"><label>법인등록번호</label><input id="cq_corpno" placeholder="000000-0000000"></div>
          <div class="form-row"><label>대표자명</label><input id="cq_ceo"></div>
          <div class="form-row"><label>대표전화</label><input id="cq_ceop"></div>
          <div class="form-row"><label>상위도메인</label><input id="cq_top" placeholder="예: 의료, 공공, 금융"></div>
          <div class="form-row"><label>하위도메인</label><input id="cq_sub"></div>
          <div class="form-row full"><label>대표주소</label><input id="cq_addr"></div>
          <div class="form-row full"><label>비고</label><input id="cq_notes"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-act="cancel">취소</button>
        <button class="btn btn-primary" data-act="save">등록</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="cancel"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  const onEsc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);

  // 진위확인 (국세청)
  back.querySelector('#cq_verify').onclick = (e) => {
    verifyBnoStatus(
      back.querySelector('#cq_bizno'),
      e.currentTarget,
      back.querySelector('#cq_verify_result')
    );
  };

  // 사업자조회 → 자동 채움
  back.querySelector('#cq_lookup').onclick = () => openBiznoSearch((picked) => {
    if (!picked) return;
    back.querySelector('#cq_name').value   = picked.company || '';
    back.querySelector('#cq_bizno').value  = picked.bno || '';
    back.querySelector('#cq_corpno').value = picked.cno || '';
    back.querySelector('#cq_legal').value  = picked.cno ? '법인' : '개인';
    if (picked.bstt && (picked.bstt.includes('폐업') || picked.bstt.includes('휴업'))) {
      toast(`주의: 사업상태 "${picked.bstt}"`, 'error');
    } else {
      toast(`${picked.company} 자동 입력 완료. 대표자명을 입력하세요.`, 'success');
    }
    const ceoEl = back.querySelector('#cq_ceo');
    if (ceoEl) {
      ceoEl.focus();
      ceoEl.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.4)';
      setTimeout(() => { ceoEl.style.boxShadow = ''; }, 2000);
    }
  });

  back.querySelector('[data-act="save"]').onclick = async () => {
    const body = {
      name:         back.querySelector('#cq_name').value.trim(),
      legal_type:   back.querySelector('#cq_legal').value,
      industry:     back.querySelector('#cq_industry').value,
      business_no:  back.querySelector('#cq_bizno').value.trim(),
      corp_no:      back.querySelector('#cq_corpno').value.trim(),
      ceo_name:     back.querySelector('#cq_ceo').value.trim(),
      ceo_phone:    back.querySelector('#cq_ceop').value.trim(),
      top_domain:   back.querySelector('#cq_top').value.trim(),
      sub_domain:   back.querySelector('#cq_sub').value.trim(),
      address:      back.querySelector('#cq_addr').value.trim(),
      notes:        back.querySelector('#cq_notes').value.trim()
    };
    if (!body.name) { toast('고객사명은 필수입니다.', 'error'); return; }
    try {
      const r = await api.post('/api/masters/customers', body);
      let created = null;
      try { created = await api.get('/api/masters/customers/' + r.id); } catch {}
      toast('고객사가 등록되었습니다.', 'success');
      close();
      if (typeof onCreated === 'function') onCreated(created || { id: r.id, name: body.name });
    } catch (e) {
      toast(e.message || '등록 실패', 'error');
    }
  };

  setTimeout(() => back.querySelector('#cq_name').focus(), 50);
}
window.openCustomerQuickAdd = openCustomerQuickAdd;

// 프로젝트 상세 팝업 (iframe 모달)
function openDetailPopup(projectId, onClose) {
  // 이미 상세 팝업이 떠 있으면 무시 (중복/연속 클릭 방어)
  if (document.querySelector('.detail-popup-back')) return;

  const back = document.createElement('div');
  back.className = 'detail-popup-back';
  back.innerHTML = `
    <div class="detail-popup">
      <div class="dp-head">
        <h3>프로젝트 상세</h3>
        <button class="dp-close" title="닫기">&times;</button>
      </div>
      <iframe src="project-detail.html?id=${encodeURIComponent(projectId)}&popup=1"></iframe>
    </div>`;
  document.body.appendChild(back);

  let closed = false;
  const onEsc = (ev) => { if (ev.key === 'Escape') close(); };
  const close = () => {
    if (closed) return;                               // 멱등 처리
    closed = true;
    document.removeEventListener('keydown', onEsc);   // ESC 리스너 항상 정리
    back.remove();
    if (typeof onClose === 'function') onClose();
  };
  back.querySelector('.dp-close').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onEsc);
}
window.openDetailPopup = openDetailPopup;
