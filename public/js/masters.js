renderLayout('기준정보 관리');

const TABS = [
  { key: 'divisions', label: '사업본부' },
  { key: 'users',     label: '사용자' },
  { key: 'employees', label: '직원' },
  { key: 'customers', label: '고객사' },
  { key: 'types',     label: '프로젝트 유형' },
  { key: 'solutions', label: '솔루션' },
  { key: 'backup',    label: 'DB 백업' }
];

const currentTab = qs('tab', 'divisions');

const tabsEl = document.getElementById('masterTabs');
TABS.forEach(t => {
  const b = document.createElement('button');
  b.className = 'tab' + (t.key === currentTab ? ' active' : '');
  b.textContent = t.label;
  b.onclick = () => { location.search = '?tab=' + t.key; };
  tabsEl.appendChild(b);
});

const body = document.getElementById('masterBody');
let divisionsCache = null;
async function getDivisions() { return divisionsCache || (divisionsCache = await api.get('/api/masters/divisions')); }

// ===== 사업본부 =====
let divCheckYear = '';   // 유효성 확인 연도 ('' = 확인 안함)
async function loadDivisions() {
  const list = await api.get('/api/masters/divisions');
  const cur = new Date().getFullYear();
  const yearOpts = ['<option value="">전체 (확인 안함)</option>'];
  for (let y = cur + 2; y >= cur - 5; y--) yearOpts.push(`<option value="${y}" ${String(y) === String(divCheckYear) ? 'selected' : ''}>${y}년</option>`);
  const validCnt = divCheckYear ? list.filter(d => isDivisionValidForYear(d, divCheckYear)).length : list.length;

  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}개 본부 ${divCheckYear ? `· <strong style="color:var(--primary);">${divCheckYear}년 유효 ${validCnt}개</strong>` : ''} <span style="font-size:12px;">· 행을 드래그하여 순서를 변경하면 정렬값이 자동 저장됩니다.</span></div>
      <div class="flex gap-8" style="align-items:center;">
        <label class="text-muted" style="font-size:12px;">유효성 확인 연도</label>
        <select id="divCheckYear" style="width:auto;">${yearOpts.join('')}</select>
        <button class="btn btn-primary" id="addBtn">+ 본부 추가</button>
      </div>
    </div>
    <div class="table-wrap"><table class="data" id="divTable">
      <thead><tr><th style="width:36px;"></th><th>코드</th><th>본부명</th><th>유효기간</th><th>정렬</th><th>활성</th><th></th></tr></thead>
      <tbody id="divDragBody">${list.map(d => {
        const valid = !divCheckYear || isDivisionValidForYear(d, divCheckYear);
        const dim = divCheckYear && !valid ? ' style="opacity:.4;"' : '';
        const yearBadge = divCheckYear
          ? (valid ? '<span class="badge badge-수주완료">유효</span>' : '<span class="badge badge-수주실패">미유효</span>')
          : '';
        return `
        <tr data-id="${d.id}" draggable="true" class="drag-row"${dim}>
          <td class="drag-handle" title="드래그하여 이동">⠿</td>
          <td>${d.code}</td>
          <td>${d.name} ${yearBadge}</td>
          <td>${divisionValidLabel(d)}</td>
          <td class="sort-val">${d.sort_order ?? 0}</td>
          <td>${d.active ? '<span class="badge badge-수주완료">활성</span>' : '<span class="badge badge-수주실패">비활성</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${d.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${d.id}">삭제</button>
          </td>
        </tr>`; }).join('') || `<tr><td colspan="7" class="empty">등록된 본부가 없습니다.</td></tr>`}
      </tbody></table></div>`;
  body.querySelector('#addBtn').onclick = () => editDivision(null);
  body.querySelector('#divCheckYear').onchange = (e) => { divCheckYear = e.target.value; loadDivisions(); };
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editDivision(b.dataset.edit));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delItem('/api/masters/divisions/' + b.dataset.del, loadDivisions));
  bindDivisionDrag();
}

function bindDivisionDrag() {
  const tbody = document.getElementById('divDragBody');
  if (!tbody) return;
  let dragEl = null;

  tbody.querySelectorAll('tr.drag-row').forEach(tr => {
    tr.addEventListener('dragstart', () => { dragEl = tr; tr.classList.add('dragging'); });
    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      dragEl = null;
    });
    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragEl || dragEl === tr) return;
      const rect = tr.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      tr.classList.add('drag-over');
      if (after) tr.after(dragEl); else tr.before(dragEl);
    });
    tr.addEventListener('drop', (e) => e.preventDefault());
  });

  tbody.addEventListener('drop', async () => {
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
    const ids = Array.from(tbody.querySelectorAll('tr.drag-row')).map(r => Number(r.dataset.id));
    // 화면상 정렬값 즉시 갱신
    tbody.querySelectorAll('tr.drag-row').forEach((r, i) => {
      const cell = r.querySelector('.sort-val');
      if (cell) cell.textContent = i + 1;
    });
    try {
      await api.post('/api/masters/divisions/reorder', { ids });
      divisionsCache = null;
      toast('본부 순서가 저장되었습니다.', 'success');
    } catch (e) {
      toast('순서 저장 실패: ' + e.message, 'error');
      loadDivisions();
    }
  });
}
async function editDivision(id) {
  const item = id ? await api.get('/api/masters/divisions/' + id) : { code: '', name: '', sort_order: 0, active: 1, valid_from: '', valid_to: '' };
  openModal(id ? '본부 수정' : '본부 추가', `
    <div class="grid-form">
      <div class="form-row"><label class="required">코드</label><input id="m_code" value="${item.code || ''}"></div>
      <div class="form-row"><label class="required">본부명</label><input id="m_name" value="${item.name || ''}"></div>
      <div class="form-row"><label>정렬</label><input id="m_sort" type="number" value="${item.sort_order ?? 0}"></div>
      <div class="form-row"><label>활성</label><select id="m_active"><option value="1" ${item.active ? 'selected' : ''}>활성</option><option value="0" ${!item.active ? 'selected' : ''}>비활성</option></select></div>
      <div class="form-row"><label>유효 시작연도</label><input id="m_vfrom" type="number" placeholder="제한 없음" value="${item.valid_from ?? ''}"></div>
      <div class="form-row"><label>유효 종료연도</label><input id="m_vto" type="number" placeholder="제한 없음" value="${item.valid_to ?? ''}"></div>
    </div>
    <p class="text-muted" style="font-size:12px;margin-top:8px;">· 연도를 비워두면 제한 없음(전 기간 유효)입니다. 예) 2024년 신설·2026년 폐지 → 시작 2024 / 종료 2025</p>`, async (m) => {
    const vf = m.querySelector('#m_vfrom').value.trim();
    const vt = m.querySelector('#m_vto').value.trim();
    const body = {
      code: m.querySelector('#m_code').value.trim(),
      name: m.querySelector('#m_name').value.trim(),
      sort_order: Number(m.querySelector('#m_sort').value || 0),
      active: Number(m.querySelector('#m_active').value),
      valid_from: vf === '' ? null : Number(vf),
      valid_to: vt === '' ? null : Number(vt)
    };
    if (!body.code || !body.name) { toast('코드와 이름은 필수입니다.', 'error'); return false; }
    if (body.valid_from != null && body.valid_to != null && body.valid_from > body.valid_to) {
      toast('유효 시작연도가 종료연도보다 클 수 없습니다.', 'error'); return false;
    }
    if (id) await api.put('/api/masters/divisions/' + id, body);
    else await api.post('/api/masters/divisions', body);
    divisionsCache = null;
    toast('저장되었습니다.', 'success');
    loadDivisions();
  });
}

// ===== 사용자 =====
let showInactiveUsers = false;   // 비활성 사용자 포함 여부
async function loadUsers() {
  const [all, divs, reqs] = await Promise.all([
    api.get('/api/masters/accounts'), getDivisions(),
    api.get('/api/masters/account-requests').catch(() => [])
  ]);
  const divMap = Object.fromEntries(divs.map(d => [d.id, d.name]));
  const base = all;   // accounts 테이블 = 로그인 계정 전용
  const inactiveCnt = base.filter(u => !u.active).length;
  const list = showInactiveUsers ? base : base.filter(u => u.active);
  const pendingCard = (reqs && reqs.length) ? `
    <div class="card" style="border:1px solid #f59e0b;background:#fffbeb;margin-bottom:16px;">
      <div class="card-header" style="background:transparent;"><h3 style="color:#b45309;font-size:14px;">🔔 사용자 신청 대기 ${reqs.length}건</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap"><table class="data" style="margin:0;">
          <thead><tr><th>ID</th><th>이름</th><th>이메일</th><th>전화</th><th>신청일</th><th style="width:150px;"></th></tr></thead>
          <tbody>${reqs.map(q => `
            <tr>
              <td><strong>${esc(q.username)}</strong></td>
              <td>${esc(q.name || '')}</td>
              <td>${esc(q.email || '')}</td>
              <td>${esc(q.phone || '')}</td>
              <td style="font-size:12px;">${(q.created_at || '').slice(0,16)}</td>
              <td class="actions">
                <button class="btn btn-sm btn-primary" data-approve="${q.id}">수락</button>
                <button class="btn btn-sm btn-danger" data-reject="${q.id}">거절</button>
              </td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>` : '';
  body.innerHTML = pendingCard + `
    <div class="flex-between mb-16">
      <div class="text-muted">로그인 계정 ${list.length}개${showInactiveUsers ? '' : ` <span style="font-size:12px;">(활성만 · 비활성 ${inactiveCnt}개 숨김)</span>`} <span style="font-size:12px;">· 프로젝트 담당 직원은 '직원' 탭에서 관리</span></div>
      <div class="flex gap-8" style="align-items:center;">
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="chkInactive" style="width:auto;" ${showInactiveUsers ? 'checked' : ''}> 비활성 사용자 포함
        </label>
        <button class="btn btn-primary" id="addBtn">+ 사용자 추가</button>
      </div>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>ID</th><th>이름</th><th>소속</th><th>역할</th><th>이메일</th><th>전화</th><th>상태</th><th></th></tr></thead>
      <tbody>${list.map(u => `
        <tr${u.active ? '' : ' style="opacity:.55;"'}>
          <td>${u.username}</td><td>${u.name}</td>
          <td>${divMap[u.division_id] || ''}</td>
          <td>${u.role || ''}</td>
          <td>${u.email || ''}</td>
          <td>${u.phone || ''}</td>
          <td>${u.active ? '<span class="badge badge-수주완료">활성</span>' : '<span class="badge badge-수주실패">비활성</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${u.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${u.id}">삭제</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="8" class="empty">표시할 사용자가 없습니다.</td></tr>`}
      </tbody></table></div>`;
  body.querySelector('#chkInactive').onchange = (e) => { showInactiveUsers = e.target.checked; loadUsers(); };
  body.querySelector('#addBtn').onclick = () => editUser(null, divs);
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editUser(b.dataset.edit, divs));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delUser(b.dataset.del));
  body.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    try { await api.post('/api/masters/account-requests/' + b.dataset.approve + '/approve', {});
      toast('사용자로 승인되었습니다.', 'success'); loadUsers(); }
    catch (e) { toast(e.message || '승인 실패', 'error'); }
  });
  body.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
    if (!confirm('이 신청을 거절하시겠습니까?')) return;
    try { await api.post('/api/masters/account-requests/' + b.dataset.reject + '/reject', {});
      toast('신청을 거절했습니다.', 'success'); loadUsers(); }
    catch (e) { toast(e.message || '거절 실패', 'error'); }
  });
}

// 로그인 계정 삭제
async function delUser(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await api.del('/api/masters/accounts/' + id);
    toast('삭제되었습니다.', 'success');
    loadUsers();
  } catch (e) { toast(e.message, 'error'); }
}

function showRelatedProjectsModal(msg, projects) {
  const rows = projects.map(p => `
    <tr>
      <td>${esc(p.project_code || '')}</td>
      <td>${esc(p.project_name || '')}</td>
      <td style="text-align:center;">${esc(p.roles || '')}</td>
      <td style="text-align:center;"><span class="badge badge-${esc(p.status || '')}">${esc(p.status || '')}</span></td>
      <td style="text-align:center;">${p.business_year || ''}</td>
    </tr>`).join('');
  openModal(`삭제 불가 — 관련 사업 ${projects.length}건`, `
    <p style="color:var(--danger);font-size:13px;margin-bottom:10px;">${esc(msg)}</p>
    <p class="text-muted" style="font-size:12px;margin-bottom:10px;">이 사용자가 주관/PM/영업담당으로 지정된 사업입니다. 삭제하려면 아래 사업들에서 담당을 변경하거나, 사용자를 <strong>비활성</strong> 처리하세요.</p>
    <div class="table-wrap" style="max-height:360px;overflow:auto;">
      <table class="data">
        <thead><tr><th>사업코드</th><th>사업명</th><th>담당</th><th>진행상태</th><th>사업년도</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`, () => true, { saveText: '확인' });
}
async function editUser(id, divs) {
  const item = id ? await api.get('/api/masters/accounts/' + id) : { username:'', name:'', division_id:'', role:'admin', email:'', phone:'', active:1 };
  let divOpts = divisionsForYear(divs, new Date().getFullYear());
  if (item.division_id && !divOpts.some(d => d.id == item.division_id)) {
    const cur = divs.find(d => d.id == item.division_id);
    if (cur) divOpts = [cur, ...divOpts];
  }
  openModal(id ? '사용자 수정' : '사용자 추가', `
    <div class="grid-form">
      <div class="form-row"><label class="required">ID</label><input id="m_username" value="${item.username || ''}"></div>
      <div class="form-row"><label class="required">이름</label><input id="m_name" value="${item.name || ''}"></div>
      <div class="form-row"><label>소속본부</label><select id="m_div"><option value="">선택</option>${divOpts.map(d=>`<option value="${d.id}" ${d.id==item.division_id?'selected':''}>${d.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>역할</label><select id="m_role"><option value="admin" ${item.role==='admin'?'selected':''}>관리자</option><option value="head" ${item.role==='head'?'selected':''}>본부장</option><option value="pm" ${item.role==='pm'?'selected':''}>PM</option><option value="sales" ${item.role==='sales'?'selected':''}>영업</option><option value="user" ${item.role==='user'?'selected':''}>일반</option></select></div>
      <div class="form-row"><label>이메일</label><input id="m_email" value="${item.email || ''}"></div>
      <div class="form-row"><label>전화</label><input id="m_phone" value="${item.phone || ''}"></div>
      <div class="form-row"><label>활성</label><select id="m_active"><option value="1" ${item.active?'selected':''}>활성</option><option value="0" ${!item.active?'selected':''}>비활성</option></select></div>
      <div class="form-row full" style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">
        <label>비밀번호 ${id ? '(변경 시에만 입력)' : '<span style="color:#dc2626;">*</span>'}</label>
        <input id="m_password" type="password" autocomplete="new-password" placeholder="${id ? '비워두면 기존 비밀번호 유지' : '신규 비밀번호'}">
      </div>
      <div class="form-row full">
        <label>비밀번호 확인</label>
        <input id="m_password2" type="password" autocomplete="new-password" placeholder="다시 한 번 입력">
      </div>
      <div class="form-row full">
        <label></label>
        <div id="m_pw_hint" style="font-size:11px;color:var(--text-muted);line-height:1.6;">
          영문 대문자 + 소문자 + 숫자 + 특수기호 모두 포함, 8자 이상
        </div>
      </div>
    </div>`, async (m) => {
    const password = m.querySelector('#m_password').value;
    const password2 = m.querySelector('#m_password2').value;

    // 신규 등록 시 비밀번호 필수
    if (!id && !password) { toast('신규 사용자는 비밀번호가 필수입니다.', 'error'); return false; }

    if (password) {
      const err = passwordComplexityCheck(password);
      if (err) { toast(err, 'error'); return false; }
      if (password !== password2) { toast('비밀번호 확인이 일치하지 않습니다.', 'error'); return false; }
    }

    const body = {
      username: m.querySelector('#m_username').value.trim(),
      name: m.querySelector('#m_name').value.trim(),
      division_id: Number(m.querySelector('#m_div').value) || null,
      role: m.querySelector('#m_role').value,
      email: m.querySelector('#m_email').value.trim(),
      phone: m.querySelector('#m_phone').value.trim(),
      active: Number(m.querySelector('#m_active').value)
    };
    if (password) body.password = password;
    if (!body.username || !body.name) { toast('ID와 이름은 필수입니다.', 'error'); return false; }
    try {
      if (id) await api.put('/api/masters/accounts/' + id, body);
      else await api.post('/api/masters/accounts', body);
      toast('저장되었습니다.', 'success');
      loadUsers();
    } catch (e) {
      toast(e.message || '저장 실패', 'error'); return false;
    }
  });

  // 비밀번호 실시간 복잡도 표시
  const pwEl = document.getElementById('m_password');
  const hintEl = document.getElementById('m_pw_hint');
  const updateHint = () => {
    const v = pwEl.value;
    if (!v) {
      hintEl.innerHTML = '영문 대문자 + 소문자 + 숫자 + 특수기호 모두 포함, 8자 이상';
      hintEl.style.color = 'var(--text-muted)';
      return;
    }
    const checks = [
      { ok: v.length >= 8, t: '8자 이상' },
      { ok: /[a-z]/.test(v), t: '소문자' },
      { ok: /[A-Z]/.test(v), t: '대문자' },
      { ok: /\d/.test(v), t: '숫자' },
      { ok: /[^a-zA-Z0-9]/.test(v), t: '특수문자' },
    ];
    hintEl.innerHTML = checks.map(c =>
      `<span style="color:${c.ok?'var(--success)':'var(--danger)'};margin-right:10px;font-weight:600;">${c.ok?'✓':'✗'} ${c.t}</span>`
    ).join('');
  };
  pwEl.addEventListener('input', updateHint);
}

// ===== 직원 (프로젝트 담당 스태프, is_login=0) =====
let showInactiveEmp = false;
let _empKeyword = '';
async function loadEmployees() {
  const [all, divs] = await Promise.all([api.get('/api/masters/users'), getDivisions()]);
  const divMap = Object.fromEntries(divs.map(d => [d.id, d.name]));
  const base = all.filter(u => !u.is_login);   // 직원만
  const inactiveCnt = base.filter(u => !u.active).length;
  let list = showInactiveEmp ? base : base.filter(u => u.active);
  const kw = _empKeyword.trim().toLowerCase();
  if (kw) list = list.filter(u => [u.name, u.employee_number, u.hq, divMap[u.division_id], u.team, u.position, u.email, u.phone]
    .some(f => (f || '').toLowerCase().includes(kw)));

  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">직원 ${list.length}명${showInactiveEmp ? '' : ` <span style="font-size:12px;">(활성만 · 비활성 ${inactiveCnt}명 숨김)</span>`}</div>
      <div class="flex gap-8" style="align-items:center;">
        <input id="empSearch" placeholder="이름 / 사원번호 / 본부 / 팀 / 직급 / 이메일 (엔터로 검색)" value="${esc(_empKeyword)}" style="width:320px;">
        <button class="btn" id="empSearchBtn">검색</button>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="chkInactiveEmp" style="width:auto;" ${showInactiveEmp ? 'checked' : ''}> 비활성 포함
        </label>
        <button class="btn btn-primary" id="addEmpBtn">+ 직원 추가</button>
      </div>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>사원번호</th><th>이름</th><th>소속본부</th><th>팀</th><th>직급</th><th>입사일</th><th>퇴사일</th><th>상태</th><th></th></tr></thead>
      <tbody>${list.map(u => `
        <tr${u.active ? '' : ' style="opacity:.55;"'}>
          <td style="font-variant-numeric:tabular-nums;">${esc(u.employee_number || '')}</td>
          <td><span class="emp-name-link" data-eid="${u.id}" title="관련 사업 보기" style="cursor:pointer;color:#2563eb;text-decoration:underline;font-weight:600;">${esc(u.name)}</span></td>
          <td>${esc(u.hq || divMap[u.division_id] || '')}</td>
          <td>${esc(u.team || '')}</td>
          <td>${esc(u.position || '')}</td>
          <td style="font-size:12px;">${esc(u.hire_date || '')}</td>
          <td style="font-size:12px;">${esc(u.leave_date || '')}</td>
          <td>${u.active ? '<span class="badge badge-수주완료">활성</span>' : '<span class="badge badge-수주실패">비활성</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${u.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${u.id}">삭제</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="9" class="empty">표시할 직원이 없습니다.</td></tr>`}
      </tbody></table></div>`;

  const search = body.querySelector('#empSearch');
  const doEmpSearch = () => {
    _empKeyword = search.value;
    loadEmployees().then(() => {
      const s = body.querySelector('#empSearch');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    });
  };
  search.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doEmpSearch(); } };
  body.querySelector('#empSearchBtn').onclick = doEmpSearch;
  body.querySelector('#chkInactiveEmp').onchange = (e) => { showInactiveEmp = e.target.checked; loadEmployees(); };
  body.querySelector('#addEmpBtn').onclick = () => editEmployee(null, divs);
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editEmployee(b.dataset.edit, divs));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delEmployee(b.dataset.del));
  body.querySelectorAll('.emp-name-link').forEach(b => b.onclick = () => showEmployeeProjects(b.dataset.eid, b.textContent));
}

async function editEmployee(id, divs) {
  const item = id ? await api.get('/api/masters/users/' + id)
                  : { username:'', name:'', division_id:'', position:'', email:'', phone:'', active:1, employee_number:'', hq:'', team:'', hire_date:'', leave_date:'',
                      birth_date:'', sci_tech_no:'', address:'', annual_salary:'', monthly_pay:'', base_pay:'', meal_allowance:'', overtime_allowance:'', childcare_allowance:'',
                      ins_pension:'', ins_health:'', ins_employment:'', ins_accident:'', severance_monthly:'', severance_annual:'', severance_on_leave:'',
                      career_period:'', career_start:'', edu_final:'', grad_school:'', grad_major:'', grad_year:'', university:'', univ_major:'', univ_year:'',
                      cert1:'', cert1_date:'', cert2:'', cert2_date:'', cert3:'', cert3_date:'', cert4:'', cert4_date:'' };
  const won = v => (v === null || v === undefined || v === '') ? '' : v;
  openModal(id ? '직원 수정' : '직원 추가', `
    <div class="grid-form">
      <div class="form-row"><label class="required">사원번호</label><input id="e_empno" value="${esc(item.employee_number)}" placeholder="예: 060001"></div>
      <div class="form-row"><label class="required">이름</label><input id="e_name" value="${esc(item.name)}"></div>
      <div class="form-row"><label class="required">ID(로그인/식별)</label><input id="e_username" value="${esc(item.username)}" placeholder="중복 불가"></div>
      <div class="form-row"><label>소속본부</label><input id="e_hq" value="${esc(item.hq)}" placeholder="예: 기술융합본부"></div>
      <div class="form-row"><label>팀</label><input id="e_team" value="${esc(item.team)}" placeholder="예: 디자인개발팀"></div>
      <div class="form-row"><label>집계본부</label><select id="e_div"><option value="">선택 안함</option>${divs.map(d=>`<option value="${d.id}" ${d.id==item.division_id?'selected':''}>${d.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>직급</label><input id="e_pos" value="${esc(item.position)}" placeholder="예: 부장"></div>
      <div class="form-row"><label>이메일</label><input id="e_email" value="${esc(item.email)}"></div>
      <div class="form-row"><label>전화</label><input id="e_phone" value="${esc(item.phone)}"></div>
      <div class="form-row"><label>입사일</label><input id="e_hire" type="date" value="${esc(item.hire_date)}"></div>
      <div class="form-row"><label>퇴사일</label><input id="e_leave" value="${esc(item.leave_date)}" placeholder="YYYY-MM-DD 또는 육아휴직 등"></div>
      <div class="form-row"><label>활성</label><select id="e_active"><option value="1" ${item.active?'selected':''}>활성</option><option value="0" ${!item.active?'selected':''}>비활성</option></select></div>
      <div class="form-row"><label>생년월일</label><input id="e_birth" value="${esc(item.birth_date)}" placeholder="YYYY-MM-DD"></div>
      <div class="form-row"><label>과학기술인번호</label><input id="e_scitech" value="${esc(item.sci_tech_no)}"></div>
      <div class="form-row" style="grid-column:1/-1;"><label>주소</label><input id="e_addr" value="${esc(item.address)}"></div>
      <div style="grid-column:1/-1;margin:8px 0 2px;font-weight:600;color:#475569;border-top:1px solid #e2e8f0;padding-top:10px;">급여 · 4대보험(회사부담) · 퇴직금</div>
      <div class="form-row"><label>연봉 계</label><input id="e_annual" class="currency" value="${won(item.annual_salary)}"></div>
      <div class="form-row"><label>월급여</label><input id="e_monthly" class="currency" value="${won(item.monthly_pay)}"></div>
      <div class="form-row"><label>기본급</label><input id="e_base" class="currency" value="${won(item.base_pay)}"></div>
      <div class="form-row"><label>식대</label><input id="e_meal" class="currency" value="${won(item.meal_allowance)}"></div>
      <div class="form-row"><label>연장수당</label><input id="e_ot" class="currency" value="${won(item.overtime_allowance)}"></div>
      <div class="form-row"><label>보육수당</label><input id="e_child" class="currency" value="${won(item.childcare_allowance)}"></div>
      <div class="form-row"><label>국민연금</label><input id="e_nat" class="currency" value="${won(item.ins_pension)}"></div>
      <div class="form-row"><label>건강보험</label><input id="e_hea" class="currency" value="${won(item.ins_health)}"></div>
      <div class="form-row"><label>고용보험</label><input id="e_emp" class="currency" value="${won(item.ins_employment)}"></div>
      <div class="form-row"><label>산재보험</label><input id="e_acc" class="currency" value="${won(item.ins_accident)}"></div>
      <div class="form-row"><label>퇴직금(월)</label><input id="e_sevm" class="currency" value="${won(item.severance_monthly)}"></div>
      <div class="form-row"><label>퇴직금(연)</label><input id="e_sevy" class="currency" value="${won(item.severance_annual)}"></div>
      <div class="form-row"><label>퇴사월 퇴직급여</label><input id="e_sevl" class="currency" value="${won(item.severance_on_leave)}"></div>
      <div style="grid-column:1/-1;margin:8px 0 2px;font-weight:600;color:#475569;border-top:1px solid #e2e8f0;padding-top:10px;">경력 · 학력 · 자격증</div>
      <div class="form-row"><label>경력기간</label><input id="e_cperiod" value="${esc(item.career_period)}" placeholder="예: 10년2개월"></div>
      <div class="form-row"><label>경력시작월</label><input id="e_cstart" value="${esc(item.career_start)}" placeholder="YYYY-MM-DD"></div>
      <div class="form-row"><label>최종학력</label><input id="e_edufinal" value="${esc(item.edu_final)}" placeholder="예: 학사"></div>
      <div class="form-row"><label>대학원</label><input id="e_gschool" value="${esc(item.grad_school)}"></div>
      <div class="form-row"><label>대학원 전공</label><input id="e_gmajor" value="${esc(item.grad_major)}"></div>
      <div class="form-row"><label>대학원 졸업년월</label><input id="e_gyear" value="${esc(item.grad_year)}" placeholder="YYYY-MM-DD"></div>
      <div class="form-row"><label>대학교</label><input id="e_univ" value="${esc(item.university)}"></div>
      <div class="form-row"><label>대학교 전공</label><input id="e_umajor" value="${esc(item.univ_major)}"></div>
      <div class="form-row"><label>대학교 졸업년월</label><input id="e_uyear" value="${esc(item.univ_year)}" placeholder="YYYY-MM-DD"></div>
      <div class="form-row"><label>자격증1</label><input id="e_cert1" value="${esc(item.cert1)}"></div>
      <div class="form-row"><label>취득일1</label><input id="e_cert1d" value="${esc(item.cert1_date)}" placeholder="YYYY-MM-DD"></div>
      <div class="form-row"><label>자격증2</label><input id="e_cert2" value="${esc(item.cert2)}"></div>
      <div class="form-row"><label>취득일2</label><input id="e_cert2d" value="${esc(item.cert2_date)}" placeholder="YYYY-MM-DD"></div>
      <div class="form-row"><label>자격증3</label><input id="e_cert3" value="${esc(item.cert3)}"></div>
      <div class="form-row"><label>취득일3</label><input id="e_cert3d" value="${esc(item.cert3_date)}" placeholder="YYYY-MM-DD"></div>
      <div class="form-row"><label>자격증4</label><input id="e_cert4" value="${esc(item.cert4)}"></div>
      <div class="form-row"><label>취득일4</label><input id="e_cert4d" value="${esc(item.cert4_date)}" placeholder="YYYY-MM-DD"></div>
    </div>`, async (m) => {
    const num = sel => { const v = (m.querySelector(sel).value || '').replace(/[^\d-]/g, ''); return v === '' ? null : Number(v); };
    const bodyData = {
      username: m.querySelector('#e_username').value.trim(),
      name: m.querySelector('#e_name').value.trim(),
      division_id: Number(m.querySelector('#e_div').value) || null,
      position: m.querySelector('#e_pos').value.trim() || null,
      email: m.querySelector('#e_email').value.trim(),
      phone: m.querySelector('#e_phone').value.trim(),
      active: Number(m.querySelector('#e_active').value),
      employee_number: m.querySelector('#e_empno').value.trim() || null,
      hq: m.querySelector('#e_hq').value.trim() || null,
      team: m.querySelector('#e_team').value.trim() || null,
      hire_date: m.querySelector('#e_hire').value.trim() || null,
      leave_date: m.querySelector('#e_leave').value.trim() || null,
      birth_date: m.querySelector('#e_birth').value.trim() || null,
      sci_tech_no: m.querySelector('#e_scitech').value.trim() || null,
      address: m.querySelector('#e_addr').value.trim() || null,
      annual_salary: num('#e_annual'), monthly_pay: num('#e_monthly'), base_pay: num('#e_base'),
      meal_allowance: num('#e_meal'), overtime_allowance: num('#e_ot'), childcare_allowance: num('#e_child'),
      ins_pension: num('#e_nat'), ins_health: num('#e_hea'), ins_employment: num('#e_emp'), ins_accident: num('#e_acc'),
      severance_monthly: num('#e_sevm'), severance_annual: num('#e_sevy'), severance_on_leave: num('#e_sevl'),
      career_period: m.querySelector('#e_cperiod').value.trim() || null,
      career_start: m.querySelector('#e_cstart').value.trim() || null,
      edu_final: m.querySelector('#e_edufinal').value.trim() || null,
      grad_school: m.querySelector('#e_gschool').value.trim() || null,
      grad_major: m.querySelector('#e_gmajor').value.trim() || null,
      grad_year: m.querySelector('#e_gyear').value.trim() || null,
      university: m.querySelector('#e_univ').value.trim() || null,
      univ_major: m.querySelector('#e_umajor').value.trim() || null,
      univ_year: m.querySelector('#e_uyear').value.trim() || null,
      cert1: m.querySelector('#e_cert1').value.trim() || null, cert1_date: m.querySelector('#e_cert1d').value.trim() || null,
      cert2: m.querySelector('#e_cert2').value.trim() || null, cert2_date: m.querySelector('#e_cert2d').value.trim() || null,
      cert3: m.querySelector('#e_cert3').value.trim() || null, cert3_date: m.querySelector('#e_cert3d').value.trim() || null,
      cert4: m.querySelector('#e_cert4').value.trim() || null, cert4_date: m.querySelector('#e_cert4d').value.trim() || null,
      role: 'user',
      is_login: 0
    };
    if (!bodyData.username || !bodyData.name) { toast('ID와 이름은 필수입니다.', 'error'); return false; }
    try {
      if (id) await api.put('/api/masters/users/' + id, bodyData);
      else await api.post('/api/masters/users', bodyData);
      toast('저장되었습니다.', 'success');
      loadEmployees();
    } catch (e) {
      toast(e.message || '저장 실패', 'error'); return false;
    }
  });
}

async function delEmployee(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await api.del('/api/masters/users/' + id);
    toast('삭제되었습니다.', 'success');
    loadEmployees();
  } catch (e) {
    const projs = e.data && e.data.projects;
    if (Array.isArray(projs) && projs.length) showRelatedProjectsModal(e.message, projs);
    else toast(e.message, 'error');
  }
}

// 직원 클릭 → 관련 사업(주관/PM/영업) 서머리 팝업
async function showEmployeeProjects(empId, empName) {
  let projects = [];
  try {
    projects = await api.get('/api/projects?staff_id=' + empId);
  } catch (e) { toast('조회 실패: ' + e.message, 'error'); return; }

  const eid = Number(empId);
  const roleOf = (p) => [
    p.manager_id === eid ? '주관' : null,
    p.pm_id === eid ? 'PM' : null,
    p.sales_rep_id === eid ? '영업' : null
  ].filter(Boolean).join('/');
  const totalExp = projects.reduce((s, p) => s + (p.expected_revenue || 0), 0);
  const totalRev = projects.reduce((s, p) => s + (p.actual_revenue || 0), 0);
  const byStatus = {};
  projects.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });

  openModal(`👤 ${esc(empName)} — 관련 사업 ${projects.length}건`, `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;font-size:11px;">
        ${Object.entries(byStatus).map(([s, c]) => `<span class="badge badge-${s}">${s} ${c}</span>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-muted);">
        예상매출 합계 <strong style="color:var(--primary);">${fmtWon(totalExp)}</strong> · 실매출 합계 <strong style="color:var(--success);">${fmtWon(totalRev)}</strong>
      </div>
    </div>
    <div class="table-wrap" style="max-height:420px;overflow:auto;"><table class="data" style="margin:0;">
      <thead><tr>
        <th>코드</th><th style="min-width:200px;">사업명</th><th>담당</th><th>본부</th><th>상태</th>
        <th>사업시기</th><th class="num">예상매출</th><th class="num">실매출</th>
      </tr></thead>
      <tbody>${projects.length ? projects.map(p => `
        <tr>
          <td style="font-variant-numeric:tabular-nums;">${esc(p.project_code)}</td>
          <td>${esc(p.project_name)}</td>
          <td style="text-align:center;font-size:12px;font-weight:600;color:var(--primary);">${roleOf(p)}</td>
          <td>${esc(p.division_name || '')}</td>
          <td><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span></td>
          <td style="font-size:12px;">${p.start_date || '-'} ~ ${p.end_date || '-'}</td>
          <td class="num">${fmtWon(p.expected_revenue)}</td>
          <td class="num">${fmtWon(p.actual_revenue)}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="empty">관련 사업이 없습니다.</td></tr>'}
      </tbody>
    </table></div>
  `, () => true, { saveText: '확인' });
}

// ===== 고객사 =====
async function loadCustomers() {
  const list = await api.get('/api/masters/customers');
  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}개 고객사</div>
      <div class="flex gap-8">
        <input id="custSearch" placeholder="고객사명 / 사업자번호 / 대표자 / 도메인 / 주소 (엔터로 검색)" style="width:320px;">
        <button class="btn" id="custSearchBtn">검색</button>
        <button class="btn btn-primary" id="addBtn">+ 고객사 추가</button>
      </div>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr>
        <th>고객사명</th><th>기관유형</th><th>법인구분</th><th>사업자번호</th>
        <th>상위도메인</th><th>대표자</th><th>전화</th><th>주소</th><th></th>
      </tr></thead>
      <tbody id="custBody"></tbody>
    </table></div>`;

  const render = (filtered) => {
    document.getElementById('custBody').innerHTML = filtered.map(c => `
      <tr>
        <td><span class="cust-name-link" data-cid="${c.id}" title="관련 사업 보기" style="cursor:pointer;color:#2563eb;text-decoration:underline;font-weight:600;">${esc(c.name)}</span></td>
        <td>${c.industry || ''}</td>
        <td>${c.legal_type || ''}</td>
        <td>${c.business_no || ''}</td>
        <td>${c.top_domain || ''}</td>
        <td>${c.ceo_name || ''}</td>
        <td>${c.ceo_phone || c.phone || ''}</td>
        <td>${(c.address || '') + (c.detail_address ? ' ' + c.detail_address : '')}</td>
        <td class="actions">
          <button class="btn btn-sm" data-edit="${c.id}">수정</button>
          <button class="btn btn-sm btn-danger" data-del="${c.id}">삭제</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="9" class="empty">등록된 고객사가 없습니다.</td></tr>`;
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editCustomer(b.dataset.edit));
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delItem('/api/masters/customers/' + b.dataset.del, loadCustomers));
    document.querySelectorAll('.cust-name-link').forEach(b => b.onclick = () => showCustomerProjects(b.dataset.cid));
  };
  render(list);
  document.getElementById('addBtn').onclick = () => editCustomer(null);
  const custInput = document.getElementById('custSearch');
  const doCustSearch = () => {
    const kw = custInput.value.trim().toLowerCase();
    render(list.filter(c => !kw || [c.name, c.business_no, c.corp_no, c.ceo_name, c.ceo_phone, c.phone, c.top_domain, c.sub_domain, c.industry, c.legal_type, c.address, c.detail_address]
      .some(f => (f || '').toLowerCase().includes(kw))));
  };
  custInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doCustSearch(); } });
  document.getElementById('custSearchBtn').onclick = doCustSearch;
}

// 고객사명 클릭 → 관련 사업 서머리 팝업
async function showCustomerProjects(customerId) {
  let customer = null, projList = [], contacts = [];
  try {
    [customer, projList, contacts] = await Promise.all([
      api.get('/api/masters/customers/' + customerId),
      api.get('/api/projects?customer_id=' + customerId),
      api.get('/api/customer-contacts?customer_id=' + customerId).catch(() => [])
    ]);
  } catch (e) { toast('고객사 정보 조회 실패: ' + e.message, 'error'); return; }

  const totalExp = projList.reduce((s, p) => s + (p.expected_revenue || 0), 0);
  const totalRev = projList.reduce((s, p) => s + (p.actual_revenue || 0), 0);
  const byStatus = {};
  projList.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });

  const infoRow = (label, val) => `<div><span style="color:#64748b;width:80px;display:inline-block;">${label}</span> ${esc(val || '-')}</div>`;

  openModal(`🏢 ${esc(customer.name)} — 관련 사업 ${projList.length}건`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px;font-size:13px;">
      ${infoRow('법인구분', customer.legal_type)}
      ${infoRow('기관유형', customer.industry)}
      ${infoRow('사업자번호', customer.business_no)}
      ${infoRow('대표자', customer.ceo_name)}
      ${infoRow('상위도메인', customer.top_domain)}
      ${infoRow('하위도메인', customer.sub_domain)}
    </div>
    ${contacts.length ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      ${contacts.map(c => `<div style="border:1px solid var(--border);border-radius:6px;padding:5px 9px;font-size:12px;background:#f8fafc;">
        ${c.is_primary ? '★ ' : ''}<strong>${esc(c.name || '')}</strong>${c.position ? ` <span class="text-muted">${esc(c.position)}</span>` : ''}${(c.mobile || c.phone) ? ` · ${esc(c.mobile || c.phone)}` : ''}
      </div>`).join('')}
    </div>` : ''}

    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;font-size:11px;">
        ${Object.entries(byStatus).map(([s, c]) => `<span class="badge badge-${s}">${s} ${c}</span>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-muted);">
        예상매출 합계 <strong style="color:var(--primary);">${fmtWon(totalExp)}</strong> · 실매출 합계 <strong style="color:var(--success);">${fmtWon(totalRev)}</strong>
      </div>
    </div>

    <div class="table-wrap" style="max-height:400px;overflow:auto;"><table class="data" style="margin:0;">
      <thead><tr>
        <th>코드</th><th style="min-width:200px;">사업명</th><th>본부</th><th>상태</th>
        <th>사업시기</th><th class="num">예상매출</th><th class="num">실매출</th>
      </tr></thead>
      <tbody>${projList.length ? projList.map(p => `
        <tr>
          <td style="font-variant-numeric:tabular-nums;">${esc(p.project_code)}</td>
          <td>${esc(p.project_name)}</td>
          <td>${esc(p.division_name || '')}</td>
          <td><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span></td>
          <td style="font-size:12px;">${p.start_date || '-'} ~ ${p.end_date || '-'}</td>
          <td class="num">${fmtWon(p.expected_revenue)}</td>
          <td class="num">${fmtWon(p.actual_revenue)}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty">관련 사업이 없습니다.</td></tr>'}
      </tbody>
    </table></div>
  `, () => true, { saveText: '확인' });
}
async function editCustomer(id) {
  const item = id ? await api.get('/api/masters/customers/' + id) : { legal_type:'법인', industry:'민간' };
  // Tabs: 고객사 / 고객사담당자
  openModal(id ? '고객사 정보 수정' : '고객사 등록', `
    <div class="tabs" style="margin-top:-4px;margin-bottom:14px;">
      <button class="tab active" data-tab="ci">고객사</button>
      <button class="tab" data-tab="cm">고객사담당자</button>
    </div>
    <div data-pane="ci">
      <div class="grid-form">
        <div class="form-row"><label class="required">고객사명</label><input id="c_name" value="${esc(item.name)}"></div>
        <div class="form-row"><label>&nbsp;</label><button type="button" class="btn btn-sm btn-outline" id="c_lookup" style="width:fit-content;">사업자조회</button></div>
        <div class="form-row"><label class="required">개인법인구분</label><select id="c_legal"><option ${item.legal_type==='법인'?'selected':''}>법인</option><option ${item.legal_type==='개인'?'selected':''}>개인</option><option ${item.legal_type==='공공'?'selected':''}>공공</option></select></div>
        <div class="form-row"><label class="required">사업자등록번호</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <input id="c_bizno" style="flex:1;min-width:0;" value="${esc(item.business_no)}" placeholder="000-00-00000">
            <button type="button" class="btn btn-sm" id="c_verify" style="white-space:nowrap;flex-shrink:0;background:#16a34a;color:white;border-color:#16a34a;" title="국세청 사업자등록 상태 확인">✓ 확인</button>
          </div>
        </div>
        <div class="form-row"><label>&nbsp;</label><div id="c_verify_result" style="font-size:12px;"></div></div>
        <div class="form-row"><label>법인등록번호</label><input id="c_corpno" value="${esc(item.corp_no)}" placeholder="000000-0000000"></div>
        <div class="form-row"><label>기관유형</label><select id="c_industry"><option ${item.industry==='민간'?'selected':''}>민간</option><option ${item.industry==='공공'?'selected':''}>공공</option></select></div>
        <div class="form-row"><label>상위도메인</label><input id="c_top" value="${esc(item.top_domain)}"></div>
        <div class="form-row"><label>하위도메인</label><input id="c_sub" value="${esc(item.sub_domain)}"></div>
        <div class="form-row"><label>업태</label><input id="c_biztype" value="${esc(item.biz_type)}" placeholder="도매 및 소매업"></div>
        <div class="form-row"><label>업종</label><input id="c_bizcat" value="${esc(item.biz_category)}" placeholder="서비스"></div>
        <div class="form-row"><label class="required">대표자명</label><input id="c_ceo" value="${esc(item.ceo_name)}"></div>
        <div class="form-row"><label>대표전화번호</label><input id="c_ceop" value="${esc(item.ceo_phone)}"></div>
        <div class="form-row"><label>대표팩스번호</label><input id="c_fax" value="${esc(item.fax)}"></div>
        <div class="form-row"><label>대표주소</label><input id="c_addr" value="${esc(item.address)}"></div>
        <div class="form-row full"><label>상세주소</label><input id="c_daddr" value="${esc(item.detail_address)}"></div>
        <div class="form-row full"><label>비고</label><textarea id="c_notes">${esc(item.notes)}</textarea></div>
      </div>
    </div>
    <div data-pane="cm" style="display:none;">
      ${id ? `
        <div class="flex-between mb-8">
          <div class="text-muted" style="font-size:12px;">담당자를 여러 명 등록할 수 있습니다. 주담당자는 ★ 표시.</div>
          <button type="button" class="btn btn-sm btn-primary" id="addContactBtn">+ 담당자 추가</button>
        </div>
        <div class="table-wrap"><table class="inline-edit" id="contactsTable">
          <thead><tr>
            <th style="width:50px;">주</th>
            <th style="width:110px;">이름</th>
            <th style="width:100px;">직책</th>
            <th style="width:110px;">부서</th>
            <th style="width:120px;">전화</th>
            <th style="width:130px;">휴대전화</th>
            <th style="width:160px;">이메일</th>
            <th style="width:80px;" class="act-cell"></th>
          </tr></thead>
          <tbody id="contactsBody"></tbody>
        </table></div>
      ` : `<div class="empty">고객사를 먼저 저장한 후 담당자를 추가할 수 있습니다.</div>`}
    </div>
  `, async (m) => {
    const body = {
      name: m.querySelector('#c_name').value.trim(),
      legal_type: m.querySelector('#c_legal').value,
      business_no: m.querySelector('#c_bizno').value.trim(),
      corp_no: m.querySelector('#c_corpno').value.trim(),
      industry: m.querySelector('#c_industry').value,
      top_domain: m.querySelector('#c_top').value.trim(),
      sub_domain: m.querySelector('#c_sub').value.trim(),
      biz_type: m.querySelector('#c_biztype').value.trim(),
      biz_category: m.querySelector('#c_bizcat').value.trim(),
      ceo_name: m.querySelector('#c_ceo').value.trim(),
      ceo_phone: m.querySelector('#c_ceop').value.trim(),
      fax: m.querySelector('#c_fax').value.trim(),
      address: m.querySelector('#c_addr').value.trim(),
      detail_address: m.querySelector('#c_daddr').value.trim(),
      notes: m.querySelector('#c_notes').value.trim()
    };
    if (!body.name) { toast('고객사명은 필수입니다.', 'error'); return false; }
    if (id) await api.put('/api/masters/customers/' + id, body);
    else await api.post('/api/masters/customers', body);
    toast('저장되었습니다.', 'success');
    loadCustomers();
  }, { saveText: id ? '수정' : '등록' });

  // 탭 핸들러
  document.querySelectorAll('.modal [data-tab]').forEach(t => t.onclick = () => {
    document.querySelectorAll('.modal [data-tab]').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.modal [data-pane]').forEach(p => p.style.display = p.dataset.pane === t.dataset.tab ? '' : 'none');
    if (t.dataset.tab === 'cm' && id) loadContacts(id);
  });

  // 진위확인 (국세청)
  document.getElementById('c_verify').onclick = (e) => {
    verifyBnoStatus(
      document.getElementById('c_bizno'),
      e.currentTarget,
      document.getElementById('c_verify_result')
    );
  };

  document.getElementById('c_lookup').onclick = () => openBiznoSearch((picked) => {
    if (!picked) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('c_name',   picked.company || '');
    set('c_bizno',  picked.bno || '');
    set('c_corpno', picked.cno || '');
    // 법인등록번호가 있으면 법인, 아니면 개인
    const legalSel = document.getElementById('c_legal');
    if (legalSel) legalSel.value = picked.cno ? '법인' : '개인';
    // 사업상태가 폐업/휴업이면 경고
    if (picked.bstt && (picked.bstt.includes('폐업') || picked.bstt.includes('휴업'))) {
      toast(`주의: 사업상태 "${picked.bstt}"`, 'error');
    } else {
      toast(`${picked.company} 자동 입력 완료. 대표자명을 입력하세요.`, 'success');
    }
    // 대표자명 칸으로 포커스 이동 + 강조
    const ceoEl = document.getElementById('c_ceo');
    if (ceoEl) {
      ceoEl.focus();
      ceoEl.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.4)';
      setTimeout(() => { ceoEl.style.boxShadow = ''; }, 2000);
    }
  });

  // 담당자 추가 버튼
  if (id) {
    const addBtn = document.getElementById('addContactBtn');
    if (addBtn) addBtn.onclick = async () => {
      await api.post('/api/customer-contacts', {
        customer_id: Number(id),
        name: '', position: '', department: '', phone: '', mobile: '', email: '',
        is_primary: 0, notes: ''
      });
      loadContacts(id);
    };
  }
}

// 고객사 담당자 N명 로드 / 인라인 편집
async function loadContacts(customerId) {
  const body = document.getElementById('contactsBody');
  if (!body) return;
  const rows = await api.get('/api/customer-contacts?customer_id=' + customerId);
  body.innerHTML = rows.map(c => `
    <tr data-cid="${c.id}">
      <td class="act-cell"><input type="radio" name="primary_contact" ${c.is_primary?'checked':''} data-primary="${c.id}" title="주담당자"></td>
      <td><input class="ct-name" value="${esc(c.name)}" placeholder="이름"></td>
      <td><input class="ct-pos" value="${esc(c.position)}" placeholder="직책"></td>
      <td><input class="ct-dep" value="${esc(c.department)}" placeholder="부서"></td>
      <td><input class="ct-phone" value="${esc(c.phone)}" placeholder="02-000-0000"></td>
      <td><input class="ct-mobile" value="${esc(c.mobile)}" placeholder="010-0000-0000"></td>
      <td><input class="ct-email" value="${esc(c.email)}" placeholder="email@..."></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save-ct="${c.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del-ct="${c.id}" title="삭제">🗑</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="8" class="empty">담당자를 추가해주세요.</td></tr>`;

  body.querySelectorAll('[data-save-ct]').forEach(b => b.onclick = async () => {
    const cid = b.dataset.saveCt;
    const tr = body.querySelector(`tr[data-cid="${cid}"]`);
    const primary = body.querySelector(`input[data-primary="${cid}"]`).checked ? 1 : 0;
    await api.put('/api/customer-contacts/' + cid, {
      customer_id: Number(customerId),
      name: tr.querySelector('.ct-name').value.trim(),
      position: tr.querySelector('.ct-pos').value.trim(),
      department: tr.querySelector('.ct-dep').value.trim(),
      phone: tr.querySelector('.ct-phone').value.trim(),
      mobile: tr.querySelector('.ct-mobile').value.trim(),
      email: tr.querySelector('.ct-email').value.trim(),
      is_primary: primary,
      notes: null
    });
    // 주담당자 단일 보장: 다른 행들의 is_primary는 0으로
    if (primary) {
      for (const otherRow of body.querySelectorAll('tr[data-cid]')) {
        const otherId = otherRow.dataset.cid;
        if (otherId === cid) continue;
        const otherCheck = body.querySelector(`input[data-primary="${otherId}"]`);
        if (otherCheck && otherCheck.checked) {
          otherCheck.checked = false;
          await api.put('/api/customer-contacts/' + otherId, {
            customer_id: Number(customerId),
            name: otherRow.querySelector('.ct-name').value.trim(),
            position: otherRow.querySelector('.ct-pos').value.trim(),
            department: otherRow.querySelector('.ct-dep').value.trim(),
            phone: otherRow.querySelector('.ct-phone').value.trim(),
            mobile: otherRow.querySelector('.ct-mobile').value.trim(),
            email: otherRow.querySelector('.ct-email').value.trim(),
            is_primary: 0,
            notes: null
          });
        }
      }
    }
    toast('저장되었습니다.', 'success');
  });
  body.querySelectorAll('[data-del-ct]').forEach(b => b.onclick = async () => {
    if (!confirm('담당자를 삭제하시겠습니까?')) return;
    await api.del('/api/customer-contacts/' + b.dataset.delCt);
    loadContacts(customerId);
  });
}

// ===== 프로젝트 유형 =====
async function loadTypes() {
  const list = await api.get('/api/masters/project-types');
  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}개</div>
      <button class="btn btn-primary" id="addBtn">+ 유형 추가</button>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>코드</th><th>유형명</th><th>내부개발</th><th>정렬</th><th></th></tr></thead>
      <tbody>${list.map(t => `
        <tr>
          <td>(${t.code})</td><td>${t.name}</td>
          <td>${t.is_internal ? '<span class="badge badge-사업보류">내부</span>' : '-'}</td>
          <td>${t.sort_order ?? 0}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${t.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${t.id}">삭제</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="5" class="empty">등록된 유형이 없습니다.</td></tr>`}
      </tbody></table></div>`;
  body.querySelector('#addBtn').onclick = () => editType(null);
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editType(b.dataset.edit));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delItem('/api/masters/project-types/' + b.dataset.del, loadTypes));
}
async function editType(id) {
  const item = id ? await api.get('/api/masters/project-types/' + id) : { code:'', name:'', sort_order:0, is_internal:0 };
  openModal(id ? '유형 수정' : '유형 추가', `
    <div class="grid-form">
      <div class="form-row"><label class="required">코드</label><input id="m_code" value="${item.code||''}"></div>
      <div class="form-row"><label class="required">유형명</label><input id="m_name" value="${item.name||''}"></div>
      <div class="form-row"><label>내부개발</label><select id="m_internal"><option value="0" ${!item.is_internal?'selected':''}>아니오</option><option value="1" ${item.is_internal?'selected':''}>예</option></select></div>
      <div class="form-row"><label>정렬</label><input id="m_sort" type="number" value="${item.sort_order ?? 0}"></div>
    </div>`, async (m) => {
    const body = {
      code: m.querySelector('#m_code').value.trim(),
      name: m.querySelector('#m_name').value.trim(),
      is_internal: Number(m.querySelector('#m_internal').value),
      sort_order: Number(m.querySelector('#m_sort').value || 0)
    };
    if (!body.code || !body.name) { toast('코드와 이름은 필수입니다.', 'error'); return false; }
    if (id) await api.put('/api/masters/project-types/' + id, body);
    else await api.post('/api/masters/project-types', body);
    toast('저장되었습니다.', 'success');
    loadTypes();
  });
}

// ===== 솔루션 =====
let showInactiveSolutions = false;   // 비활성 솔루션 포함 여부
let _solAll = [];                    // 전체 솔루션(정렬순) — 드래그 재정렬 시 숨김 항목 보존용
async function loadSolutions() {
  const [all, divs] = await Promise.all([api.get('/api/masters/solutions'), getDivisions()]);
  _solAll = all;
  const inactiveCnt = all.filter(s => !s.active).length;
  const list = showInactiveSolutions ? all : all.filter(s => s.active);
  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}개${showInactiveSolutions ? '' : ` <span style="font-size:12px;">(활성만 · 비활성 ${inactiveCnt}개 숨김)</span>`} <span style="font-size:12px;">· 행을 드래그하여 순서를 변경하면 정렬값이 자동 저장됩니다.</span></div>
      <div class="flex gap-8" style="align-items:center;">
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="chkInactiveSol" style="width:auto;" ${showInactiveSolutions ? 'checked' : ''}> 비활성 솔루션 포함
        </label>
        <button class="btn btn-primary" id="addBtn">+ 솔루션 추가</button>
      </div>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr>
        <th style="width:36px;"></th>
        <th>코드</th><th>솔루션명</th><th class="num">표준판매단가</th><th class="num">내부원가</th>
        <th class="num">최대할인율</th><th>판매</th><th>자사</th><th>매출귀속</th><th>상태</th><th></th>
      </tr></thead>
      <tbody id="solDragBody">${list.map(s => `
        <tr data-id="${s.id}" draggable="true" class="drag-row"${s.active ? '' : ' style="opacity:.55;"'}>
          <td class="drag-handle" title="드래그하여 이동">⠿</td>
          <td><span class="sol-code-link" data-sid="${s.id}" data-code="${esc(s.code || s.name)}" title="관련 프로젝트 보기" style="cursor:pointer;color:#2563eb;text-decoration:underline;font-weight:600;">${s.code || '(코드없음)'}</span></td>
          <td><strong>${s.name}</strong>${s.spec ? `<br><small class="text-muted">${s.spec}</small>` : ''}</td>
          <td class="num">${fmtWon(s.standard_price)}</td>
          <td class="num">${fmtWon(s.internal_cost)}</td>
          <td class="num">${s.max_discount || 0}%</td>
          <td>${s.is_sellable === 'Y' ? 'Y' : 'N'}</td>
          <td>${s.is_internal === 'Y' ? 'Y' : 'N'}</td>
          <td>${s.sales_division_name || ''}</td>
          <td>${s.active ? '<span class="badge badge-수주완료">활성</span>' : '<span class="badge badge-수주실패">비활성</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${s.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${s.id}">삭제</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="11" class="empty">표시할 솔루션이 없습니다.</td></tr>`}
      </tbody></table></div>`;
  body.querySelector('#chkInactiveSol').onchange = (e) => { showInactiveSolutions = e.target.checked; loadSolutions(); };
  body.querySelector('#addBtn').onclick = () => editSolution(null, divs);
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editSolution(b.dataset.edit, divs));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delItem('/api/masters/solutions/' + b.dataset.del, loadSolutions));
  body.querySelectorAll('.sol-code-link').forEach(b => b.onclick = () => showSolutionProjects(b.dataset.sid, b.dataset.code));
  bindSolutionDrag();
}

function bindSolutionDrag() {
  const tbody = document.getElementById('solDragBody');
  if (!tbody) return;
  let dragEl = null;
  tbody.querySelectorAll('tr.drag-row').forEach(tr => {
    tr.addEventListener('dragstart', () => { dragEl = tr; tr.classList.add('dragging'); });
    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      dragEl = null;
    });
    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragEl || dragEl === tr) return;
      const rect = tr.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      tr.classList.add('drag-over');
      if (after) tr.after(dragEl); else tr.before(dragEl);
    });
    tr.addEventListener('drop', (e) => e.preventDefault());
  });
  tbody.addEventListener('drop', async () => {
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
    const visibleIds = Array.from(tbody.querySelectorAll('tr.drag-row')).map(r => Number(r.dataset.id));
    // 화면에 없는(비활성 숨김) 솔루션은 기존 정렬순 그대로 뒤에 붙여 누락 방지
    const hiddenIds = _solAll
      .filter(s => !visibleIds.includes(s.id))
      .map(s => s.id);
    const ids = [...visibleIds, ...hiddenIds];
    try {
      await api.post('/api/masters/solutions/reorder', { ids });
      toast('솔루션 순서가 저장되었습니다.', 'success');
    } catch (e) {
      toast('순서 저장 실패: ' + e.message, 'error');
      loadSolutions();
    }
  });
}

// 솔루션 코드 클릭 → 해당 솔루션이 납품된 관련 프로젝트 목록
async function showSolutionProjects(solutionId, codeLabel) {
  let projects = [];
  try {
    projects = await api.get('/api/projects?solution_id=' + solutionId);
  } catch (e) { toast('조회 실패: ' + e.message, 'error'); return; }

  const rows = projects.map(p => `
    <tr>
      <td style="font-variant-numeric:tabular-nums;">${esc(p.project_code)}</td>
      <td><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span></td>
      <td>${esc(p.project_name)}</td>
      <td>${esc(p.customer_name || '-')}</td>
      <td>${esc(p.division_name || '-')}</td>
      <td style="text-align:center;">${p.business_year || ''}</td>
    </tr>`).join('');

  openModal(`솔루션 [${esc(codeLabel)}] 관련 프로젝트 ${projects.length}건`, `
    ${projects.length ? `
    <div class="table-wrap" style="max-height:420px;overflow:auto;">
      <table class="data">
        <thead><tr><th>사업코드</th><th>진행상태</th><th style="min-width:220px;">사업명</th><th>고객사</th><th>주관본부</th><th>사업년도</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    : '<div class="empty" style="padding:24px;">이 솔루션이 납품된 프로젝트가 없습니다.</div>'}
  `, () => true, { saveText: '확인' });
}
async function editSolution(id, divs) {
  const item = id ? await api.get('/api/masters/solutions/' + id) : { is_sellable:'Y', is_internal:'Y', active:1 };
  openModal(id ? '솔루션 정보 수정' : '솔루션 등록', `
    <div class="grid-form">
      <div class="form-row"><label class="required">솔루션코드</label><input id="s_code" value="${esc(item.code)}" placeholder="예: SB"></div>
      <div class="form-row"><label class="required">솔루션명</label><input id="s_name" value="${esc(item.name)}" placeholder="SmartBig"></div>
      <div class="form-row"><label>기본소비자가격</label>${currencyHtml('s_base', item.base_consumer_price)}</div>
      <div class="form-row"><label>권장소비자가격</label>${currencyHtml('s_reco', item.recommended_price)}</div>
      <div class="form-row"><label>최대할인율(%)</label><input id="s_disc" type="number" step="0.01" value="${item.max_discount||0}"></div>
      <div class="form-row"><label>매출원가</label>${currencyHtml('s_cogs', item.cogs)}</div>
      <div class="form-row"><label>내부원가</label>${currencyHtml('s_intcost', item.internal_cost)}</div>
      <div class="form-row"><label>표준판매단가</label>${currencyHtml('s_std', item.standard_price)}</div>
      <div class="form-row"><label>판매여부</label>
        <div class="flex gap-8" style="align-items:center;">
          <label style="display:inline-flex;align-items:center;gap:4px;width:auto;font-weight:normal;"><input type="radio" name="s_sell" value="Y" ${item.is_sellable!=='N'?'checked':''} style="width:auto;"> Y</label>
          <label style="display:inline-flex;align-items:center;gap:4px;width:auto;font-weight:normal;"><input type="radio" name="s_sell" value="N" ${item.is_sellable==='N'?'checked':''} style="width:auto;"> N</label>
        </div>
      </div>
      <div class="form-row"><label>자사솔루션여부</label>
        <div class="flex gap-8" style="align-items:center;">
          <label style="display:inline-flex;align-items:center;gap:4px;width:auto;font-weight:normal;"><input type="radio" name="s_int" value="Y" ${item.is_internal!=='N'?'checked':''} style="width:auto;"> Y</label>
          <label style="display:inline-flex;align-items:center;gap:4px;width:auto;font-weight:normal;"><input type="radio" name="s_int" value="N" ${item.is_internal==='N'?'checked':''} style="width:auto;"> N</label>
        </div>
      </div>
      <div class="form-row"><label>매출귀속본부</label><select id="s_div"><option value="">선택 안함</option>${divs.map(d=>`<option value="${d.id}" ${d.id==item.sales_division_id?'selected':''}>${d.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>벤더</label><input id="s_vendor" value="${esc(item.vendor)}"></div>
      <div class="form-row full"><label>사양</label><input id="s_spec" value="${esc(item.spec)}" placeholder="사양"></div>
      <div class="form-row full"><label>비고</label><textarea id="s_notes" placeholder="비고">${esc(item.notes)}</textarea></div>
      <div class="form-row"><label>활성</label><select id="s_active"><option value="1" ${item.active?'selected':''}>활성</option><option value="0" ${!item.active?'selected':''}>비활성</option></select></div>
    </div>
  `, async (m) => {
    const body = {
      code: m.querySelector('#s_code').value.trim() || null,
      name: m.querySelector('#s_name').value.trim(),
      vendor: m.querySelector('#s_vendor').value.trim() || null,
      spec: m.querySelector('#s_spec').value.trim() || null,
      base_consumer_price: currencyValue(m.querySelector('#s_base')),
      recommended_price: currencyValue(m.querySelector('#s_reco')),
      max_discount: Number(m.querySelector('#s_disc').value || 0),
      cogs: currencyValue(m.querySelector('#s_cogs')),
      internal_cost: currencyValue(m.querySelector('#s_intcost')),
      standard_price: currencyValue(m.querySelector('#s_std')),
      is_sellable: m.querySelector('input[name="s_sell"]:checked').value,
      is_internal: m.querySelector('input[name="s_int"]:checked').value,
      sales_division_id: Number(m.querySelector('#s_div').value) || null,
      notes: m.querySelector('#s_notes').value.trim() || null,
      active: Number(m.querySelector('#s_active').value)
    };
    if (!body.name) { toast('솔루션명은 필수입니다.', 'error'); return false; }
    if (id) await api.put('/api/masters/solutions/' + id, body);
    else await api.post('/api/masters/solutions', body);
    toast('저장되었습니다.', 'success');
    loadSolutions();
  }, { saveText: id ? '수정' : '등록' });
}

async function delItem(url, reload) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await api.del(url);
    toast('삭제되었습니다.', 'success');
    reload();
  } catch (e) { toast(e.message, 'error'); }
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== DB 백업 =====
function loadBackup() {
  body.innerHTML = `
    <div class="card" style="max-width:640px;">
      <div class="card-header"><h3>💾 DB 백업</h3></div>
      <div class="card-body">
        <p class="text-muted" style="font-size:13px;line-height:1.7;">
          현재 데이터베이스 전체를 하나의 SQLite 파일(<code>crm-backup-YYYY-MM-DD.db</code>)로 내려받습니다.<br>
          내려받은 파일은 로컬 개발 환경의 <code>db/crm.db</code> 로 교체해 사용할 수 있습니다.
        </p>
        <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:10px 12px;font-size:12px;color:#92400e;margin:12px 0;">
          ⚠️ 백업 파일에는 <strong>모든 운영 데이터</strong>가 포함됩니다. 관리자만 다운로드할 수 있으며, 파일 취급에 주의하세요.
        </div>
        <button class="btn btn-primary" id="dlBackupBtn">⬇ DB 백업 다운로드</button>
        <span id="backupStatus" class="text-muted" style="font-size:12px;margin-left:10px;"></span>
      </div>
    </div>`;
  body.querySelector('#dlBackupBtn').onclick = async () => {
    const btn = body.querySelector('#dlBackupBtn');
    const st = body.querySelector('#backupStatus');
    btn.disabled = true; st.textContent = '백업 생성 중...';
    try {
      const r = await fetch('/api/admin/backup');
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || '다운로드 실패'); }
      const blob = await r.blob();
      const cd = r.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      const fname = m ? m[1] : ('crm-backup-' + new Date().toISOString().slice(0,10) + '.db');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      st.textContent = '다운로드 완료: ' + fname;
      toast('DB 백업이 다운로드되었습니다.', 'success');
    } catch (e) {
      st.textContent = ''; toast(e.message || '백업 실패', 'error');
    } finally { btn.disabled = false; }
  };
}

const loaders = { divisions: loadDivisions, users: loadUsers, employees: loadEmployees, customers: loadCustomers, types: loadTypes, solutions: loadSolutions, backup: loadBackup };
(loaders[currentTab] || loadDivisions)();
