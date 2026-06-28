renderLayout('기준정보 관리');

const TABS = [
  { key: 'divisions', label: '사업본부' },
  { key: 'users',     label: '사용자' },
  { key: 'customers', label: '고객사' },
  { key: 'types',     label: '프로젝트 유형' },
  { key: 'solutions', label: '솔루션' }
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
async function loadDivisions() {
  const list = await api.get('/api/masters/divisions');
  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}개 본부 <span style="font-size:12px;">· 행을 드래그하여 순서를 변경하면 정렬값이 자동 저장됩니다.</span></div>
      <button class="btn btn-primary" id="addBtn">+ 본부 추가</button>
    </div>
    <div class="table-wrap"><table class="data" id="divTable">
      <thead><tr><th style="width:36px;"></th><th>코드</th><th>본부명</th><th>정렬</th><th>활성</th><th></th></tr></thead>
      <tbody id="divDragBody">${list.map(d => `
        <tr data-id="${d.id}" draggable="true" class="drag-row">
          <td class="drag-handle" title="드래그하여 이동">⠿</td>
          <td>${d.code}</td>
          <td>${d.name}</td>
          <td class="sort-val">${d.sort_order ?? 0}</td>
          <td>${d.active ? '<span class="badge badge-수주완료">활성</span>' : '<span class="badge badge-수주실패">비활성</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${d.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${d.id}">삭제</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="6" class="empty">등록된 본부가 없습니다.</td></tr>`}
      </tbody></table></div>`;
  body.querySelector('#addBtn').onclick = () => editDivision(null);
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
  const item = id ? await api.get('/api/masters/divisions/' + id) : { code: '', name: '', sort_order: 0, active: 1 };
  openModal(id ? '본부 수정' : '본부 추가', `
    <div class="grid-form">
      <div class="form-row"><label class="required">코드</label><input id="m_code" value="${item.code || ''}"></div>
      <div class="form-row"><label class="required">본부명</label><input id="m_name" value="${item.name || ''}"></div>
      <div class="form-row"><label>정렬</label><input id="m_sort" type="number" value="${item.sort_order ?? 0}"></div>
      <div class="form-row"><label>활성</label><select id="m_active"><option value="1" ${item.active ? 'selected' : ''}>활성</option><option value="0" ${!item.active ? 'selected' : ''}>비활성</option></select></div>
    </div>`, async (m) => {
    const body = {
      code: m.querySelector('#m_code').value.trim(),
      name: m.querySelector('#m_name').value.trim(),
      sort_order: Number(m.querySelector('#m_sort').value || 0),
      active: Number(m.querySelector('#m_active').value)
    };
    if (!body.code || !body.name) { toast('코드와 이름은 필수입니다.', 'error'); return false; }
    if (id) await api.put('/api/masters/divisions/' + id, body);
    else await api.post('/api/masters/divisions', body);
    divisionsCache = null;
    toast('저장되었습니다.', 'success');
    loadDivisions();
  });
}

// ===== 사용자 =====
async function loadUsers() {
  const [list, divs] = await Promise.all([api.get('/api/masters/users'), getDivisions()]);
  const divMap = Object.fromEntries(divs.map(d => [d.id, d.name]));
  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}명</div>
      <button class="btn btn-primary" id="addBtn">+ 사용자 추가</button>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>ID</th><th>이름</th><th>소속</th><th>역할</th><th>이메일</th><th>전화</th><th></th></tr></thead>
      <tbody>${list.map(u => `
        <tr>
          <td>${u.username}</td><td>${u.name}</td>
          <td>${divMap[u.division_id] || ''}</td>
          <td>${u.role || ''}</td>
          <td>${u.email || ''}</td>
          <td>${u.phone || ''}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${u.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${u.id}">삭제</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="7" class="empty">등록된 사용자가 없습니다.</td></tr>`}
      </tbody></table></div>`;
  body.querySelector('#addBtn').onclick = () => editUser(null, divs);
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editUser(b.dataset.edit, divs));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delItem('/api/masters/users/' + b.dataset.del, loadUsers));
}
async function editUser(id, divs) {
  const item = id ? await api.get('/api/masters/users/' + id) : { username:'', name:'', division_id:'', role:'user', email:'', phone:'', active:1 };
  openModal(id ? '사용자 수정' : '사용자 추가', `
    <div class="grid-form">
      <div class="form-row"><label class="required">ID</label><input id="m_username" value="${item.username || ''}"></div>
      <div class="form-row"><label class="required">이름</label><input id="m_name" value="${item.name || ''}"></div>
      <div class="form-row"><label>소속본부</label><select id="m_div"><option value="">선택</option>${divs.map(d=>`<option value="${d.id}" ${d.id==item.division_id?'selected':''}>${d.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>역할</label><select id="m_role"><option value="admin" ${item.role==='admin'?'selected':''}>관리자</option><option value="pm" ${item.role==='pm'?'selected':''}>PM</option><option value="sales" ${item.role==='sales'?'selected':''}>영업</option><option value="user" ${item.role==='user'?'selected':''}>일반</option></select></div>
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
      if (id) await api.put('/api/masters/users/' + id, body);
      else await api.post('/api/masters/users', body);
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

// ===== 고객사 =====
async function loadCustomers() {
  const list = await api.get('/api/masters/customers');
  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}개 고객사</div>
      <div class="flex gap-8">
        <input id="custSearch" placeholder="고객사명 검색" style="width:240px;">
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
        <td><strong>${c.name}</strong></td>
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
  };
  render(list);
  document.getElementById('addBtn').onclick = () => editCustomer(null);
  document.getElementById('custSearch').addEventListener('input', e => {
    const kw = e.target.value.toLowerCase();
    render(list.filter(c => !kw || (c.name || '').toLowerCase().includes(kw)));
  });
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
async function loadSolutions() {
  const [list, divs] = await Promise.all([api.get('/api/masters/solutions'), getDivisions()]);
  body.innerHTML = `
    <div class="flex-between mb-16">
      <div class="text-muted">총 ${list.length}개</div>
      <button class="btn btn-primary" id="addBtn">+ 솔루션 추가</button>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr>
        <th>코드</th><th>솔루션명</th><th class="num">표준판매단가</th><th class="num">내부원가</th>
        <th class="num">최대할인율</th><th>판매</th><th>자사</th><th>매출귀속</th><th></th>
      </tr></thead>
      <tbody>${list.map(s => `
        <tr>
          <td>${s.code || ''}</td>
          <td><strong>${s.name}</strong>${s.spec ? `<br><small class="text-muted">${s.spec}</small>` : ''}</td>
          <td class="num">${fmtWon(s.standard_price)}</td>
          <td class="num">${fmtWon(s.internal_cost)}</td>
          <td class="num">${s.max_discount || 0}%</td>
          <td>${s.is_sellable === 'Y' ? 'Y' : 'N'}</td>
          <td>${s.is_internal === 'Y' ? 'Y' : 'N'}</td>
          <td>${s.sales_division_name || ''}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${s.id}">수정</button>
            <button class="btn btn-sm btn-danger" data-del="${s.id}">삭제</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="9" class="empty">등록된 솔루션이 없습니다.</td></tr>`}
      </tbody></table></div>`;
  body.querySelector('#addBtn').onclick = () => editSolution(null, divs);
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editSolution(b.dataset.edit, divs));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delItem('/api/masters/solutions/' + b.dataset.del, loadSolutions));
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

const loaders = { divisions: loadDivisions, users: loadUsers, customers: loadCustomers, types: loadTypes, solutions: loadSolutions };
(loaders[currentTab] || loadDivisions)();
