renderLayout('프로젝트 상세');

const PROJECT_ID = qs('id');
if (!PROJECT_ID) { alert('잘못된 접근입니다.'); location.href = 'projects.html'; }

let project = null;
let divisions = [], customers = [], types = [], users = [], solutions = [];

async function init() {
  [divisions, customers, types, users, solutions, project] = await Promise.all([
    api.get('/api/masters/divisions'),
    api.get('/api/masters/customers'),
    api.get('/api/masters/project-types'),
    api.get('/api/masters/users'),
    api.get('/api/masters/solutions'),
    api.get('/api/projects/' + PROJECT_ID)
  ]);

  document.getElementById('projTitle').textContent = `[${project.project_code}] ${project.project_name}`;
  renderStatusFlow();
  renderBasic();

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
  document.getElementById('deleteBtn').onclick = deleteProject;

  // 팝업 모드(iframe)에서는 "목록" 버튼 숨김
  if (new URL(location.href).searchParams.get('popup') === '1') {
    const lb = document.getElementById('listBtn');
    if (lb) lb.style.display = 'none';
  }
}

async function deleteProject() {
  if (!confirm(`[${project.project_code}] ${project.project_name}\n\n이 프로젝트를 삭제하면 매출/매입/투입/활동/솔루션 등 모든 하위 데이터가 함께 삭제됩니다.\n정말 삭제하시겠습니까?`)) return;
  try {
    await api.del('/api/projects/' + PROJECT_ID);
    toast('프로젝트가 삭제되었습니다.', 'success');
    const isPopup = new URL(location.href).searchParams.get('popup') === '1';
    if (isPopup && window.parent && window.parent !== window) {
      // 상세 팝업(iframe) 안: 부모 창에 알려 팝업 닫고 목록 새로고침
      setTimeout(() => {
        try {
          const dp = window.parent.document.querySelector('.detail-popup-back .dp-close');
          if (dp) dp.click();
          else window.parent.location.reload();
        } catch { window.parent.location.reload(); }
      }, 500);
    } else {
      setTimeout(() => { location.href = 'projects.html'; }, 500);
    }
  } catch (e) {
    toast('삭제 실패: ' + (e.message || ''), 'error');
  }
}

function renderStatusFlow() {
  const flow = document.getElementById('statusFlow');
  const order = ['기획단계','영업단계','제안단계','수주완료','수행종료'];
  const idx = order.indexOf(project.status);
  flow.innerHTML = order.map((s, i) => {
    const cls = s === project.status ? 'active' : (idx >= 0 && i < idx ? 'done' : '');
    return `<div class="step ${cls}" data-st="${s}"><div class="dot">${i+1}</div><div class="label">${s}</div></div>${i<order.length-1?'<span class="arrow">›</span>':''}`;
  }).join('') + `
    <span class="arrow">|</span>
    <div class="step ${project.status==='수주실패'?'active':''}" data-st="수주실패"><div class="dot" style="background:${project.status==='수주실패'?'var(--danger)':'#cbd5e1'}">×</div><div class="label">수주실패</div></div>
    <div class="step ${project.status==='사업보류'?'active':''}" data-st="사업보류"><div class="dot" style="background:${project.status==='사업보류'?'var(--secondary)':'#cbd5e1'}">−</div><div class="label">사업보류</div></div>`;
  flow.querySelectorAll('[data-st]').forEach(el => el.onclick = async () => {
    const st = el.dataset.st;
    if (st === project.status) return;
    if (!confirm(`상태를 "${st}" 로 변경하시겠습니까?`)) return;
    await api.patch('/api/projects/' + PROJECT_ID + '/status', { status: st });
    project.status = st;
    renderStatusFlow();
    toast('상태가 변경되었습니다.', 'success');
  });
}

function renderBasic() {
  const html = `
    <div class="card">
      <div class="card-header"><h3>담당자 / 고객 정보</h3></div>
      <div class="card-body">
        <div class="grid-form">
          <div class="form-row"><label>사업주관본부</label><select id="b_div">${optionDivisions(project.division_id)}</select></div>
          <div class="form-row"><label>고객사</label><select id="b_cust">${optionCustomers(project.customer_id)}</select></div>
          <div class="form-row"><label>사업담당</label><select id="b_mgr">${optionUsers(project.manager_id)}</select></div>
          <div class="form-row"><label>고객 담당자</label><input id="b_ccontact" value="${escapeAttr(project.customer_contact)}"></div>
          <div class="form-row"><label>PM</label><select id="b_pm">${optionUsers(project.pm_id)}</select></div>
          <div class="form-row"><label>원도급사</label><input id="b_prime" value="${escapeAttr(project.prime_contractor)}"></div>
          <div class="form-row"><label>영업대표</label><select id="b_sales">${optionUsers(project.sales_rep_id)}</select></div>
          <div class="form-row"><label>제안마감일</label><input id="b_pdeadline" type="date" value="${project.proposal_deadline||''}"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>프로젝트 정보</h3></div>
      <div class="card-body">
        <div class="grid-form">
          <div class="form-row"><label>프로젝트 코드</label><input value="${project.project_code}" readonly></div>
          <div class="form-row"><label>프로젝트 유형</label><select id="b_type">${optionTypes(project.project_type_id)}</select></div>
          <div class="form-row full"><label class="required">프로젝트명</label><input id="b_name" value="${escapeAttr(project.project_name)}"></div>
          <div class="form-row"><label>사업년도</label><input id="b_year" type="number" value="${project.business_year||''}"></div>
          <div class="form-row"><label>참여형태</label><select id="b_ptype"><option ${project.participation_type==='참여'?'selected':''}>참여</option><option ${project.participation_type==='주관'?'selected':''}>주관</option><option ${project.participation_type==='하도'?'selected':''}>하도</option></select></div>
          <div class="form-row"><label>수행 시작일</label><input id="b_start" type="date" value="${project.start_date||''}"></div>
          <div class="form-row"><label>수행 종료일</label><input id="b_end" type="date" value="${project.end_date||''}"></div>
          <div class="form-row"><label>총사업비</label>${currencyHtml('b_budget', project.total_budget)}</div>
          <div class="form-row"><label>기술지원확약서일</label><input id="b_tech" type="date" value="${project.tech_support_date||''}"></div>
          <div class="form-row"><label>상위도메인</label><input id="b_top" value="${escapeAttr(project.top_domain)}"></div>
          <div class="form-row"><label>하위도메인</label><input id="b_sub" value="${escapeAttr(project.sub_domain)}"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>예상매입매출</h3>
        <small class="text-muted" style="font-size:11px;font-weight:400;">총매출액·예상매출액·실매출액은 자동 계산됩니다.</small>
      </div>
      <div class="card-body">
        <div class="grid-form">
          <div class="form-row"><label>참여비율(%)</label><input id="b_prate" type="number" step="0.1" value="${project.participation_rate||0}"></div>
          <div class="form-row"><label title="총사업비 × 참여비율">총매출액 <span class="auto-tag">자동</span></label>${currencyHtml('b_pamt', project.participation_amount)}</div>
          <div class="form-row"><label>총매입액</label>${currencyHtml('b_purchase', project.total_purchase)}</div>
          <div class="form-row"><label title="총매출액 − 총매입액">실매출액 <span class="auto-tag">자동</span></label>${currencyHtml('b_act', project.actual_revenue)}</div>
          <div class="form-row"><label>수주확률(%)</label><input id="b_win" type="number" step="0.1" value="${project.win_probability||0}"></div>
          <div class="form-row"><label title="총매출액 × 수주확률">예상매출액 <span class="auto-tag">자동</span></label>${currencyHtml('b_exp', project.expected_revenue)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>연도별 매출 / 매입</h3>
        <small class="text-muted" style="font-size:11px;font-weight:400;">계산서 발행일자 기준 자동 집계</small>
      </div>
      <div class="card-body" id="yearlyBreakdown">
        <div class="empty" style="padding:20px;">불러오는 중...</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>기타 정보 / 사업개요</h3></div>
      <div class="card-body">
        <div class="grid-form">
          <div class="form-row"><label>SW실적 등록</label><select id="b_sw"><option value="N" ${project.sw_registered!=='Y'?'selected':''}>N</option><option value="Y" ${project.sw_registered==='Y'?'selected':''}>Y</option></select></div>
          <div class="form-row"><label>예상 경쟁사</label><input id="b_comp" value="${escapeAttr(project.competitor)}"></div>
          <div class="form-row full"><label>소개 경로</label><input id="b_intro" value="${escapeAttr(project.intro_channel)}"></div>
          <div class="form-row full"><label>사업 개요</label><textarea id="b_overview" rows="6">${escapeHtml(project.overview)}</textarea></div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('tab-basic').innerHTML = html;
  bindCurrencyInputs(document.getElementById('tab-basic'));
  bindAutoCalc();
  loadYearlyBreakdown();
}

// 예상매입매출 자동계산
//  총매출액(b_pamt)   = 총사업비(b_budget) × 참여비율(b_prate)/100
//  예상매출액(b_exp)  = 총매출액 × 수주확률(b_win)/100
//  실매출액(b_act)    = 총매출액 − 총매입액(b_purchase)
function bindAutoCalc() {
  const pamtEl = document.getElementById('b_pamt');
  const expEl  = document.getElementById('b_exp');
  const actEl  = document.getElementById('b_act');
  // 자동계산 필드는 직접 입력 막기 (readonly + 회색)
  [pamtEl, expEl, actEl].forEach(el => {
    if (!el) return;
    el.readOnly = true;
    el.style.background = '#f1f5f9';
    el.style.color = 'var(--text)';
    el.title = '자동 계산되는 값입니다';
  });

  const setCurrency = (el, val) => {
    if (!el) return;
    el.value = Math.round(val).toLocaleString('ko-KR');
  };
  const recalc = () => {
    const budget = currencyValue(document.getElementById('b_budget'));
    const prate  = Number(document.getElementById('b_prate').value || 0);
    const win    = Number(document.getElementById('b_win').value || 0);
    const purchase = currencyValue(document.getElementById('b_purchase'));

    const totalSales = budget * prate / 100;          // 총매출액
    const expected   = totalSales * win / 100;          // 예상매출액
    const actual     = totalSales - purchase;           // 실매출액

    setCurrency(pamtEl, totalSales);
    setCurrency(expEl, expected);
    setCurrency(actEl, actual);
  };

  ['b_budget', 'b_prate', 'b_win', 'b_purchase'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', recalc);
      el.addEventListener('blur', recalc);
    }
  });
  recalc();
}

async function loadYearlyBreakdown() {
  const wrap = document.getElementById('yearlyBreakdown');
  if (!wrap) return;
  try {
    const rows = await api.get('/api/projects/' + PROJECT_ID + '/yearly-breakdown');
    if (!rows.length) {
      wrap.innerHTML = `<div class="empty" style="padding:20px;">매출 / 매입 입력 시 자동으로 연도별 합계가 표시됩니다.</div>`;
      return;
    }
    let totalSales = 0, totalPurc = 0;
    const body = rows.map(r => {
      totalSales += r.sales; totalPurc += r.purchase;
      return `<tr>
        <td><strong>${r.year}년</strong></td>
        <td class="num">${fmtWon(r.sales)}</td>
        <td class="num">${fmtWon(r.purchase)}</td>
        <td class="num ${r.profit < 0 ? 'text-danger' : 'text-success'} fw-bold">${fmtWon(r.profit)}</td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `
      <div class="table-wrap"><table class="data">
        <thead><tr>
          <th style="width:120px;">연도</th>
          <th class="num">매출</th>
          <th class="num">매입</th>
          <th class="num">매출이익 (매출-매입)</th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr style="background:#f1f5f9;font-weight:700;">
          <td>합계</td>
          <td class="num">${fmtWon(totalSales)}</td>
          <td class="num">${fmtWon(totalPurc)}</td>
          <td class="num ${totalSales - totalPurc < 0 ? 'text-danger' : 'text-success'}">${fmtWon(totalSales - totalPurc)}</td>
        </tr></tfoot>
      </table></div>`;
  } catch (e) {
    wrap.innerHTML = `<div class="empty" style="padding:20px;color:var(--danger);">로드 실패: ${e.message}</div>`;
  }
}

async function saveBasic() {
  const v = id => document.getElementById(id) ? document.getElementById(id).value : null;
  const cv = id => currencyValue(document.getElementById(id));
  const body = {
    project_code: project.project_code,
    project_name: v('b_name'),
    project_type_id: Number(v('b_type')) || null,
    status: project.status,
    division_id: Number(v('b_div')) || null,
    manager_id: Number(v('b_mgr')) || null,
    pm_id: Number(v('b_pm')) || null,
    sales_rep_id: Number(v('b_sales')) || null,
    proposal_deadline: v('b_pdeadline') || null,
    customer_id: Number(v('b_cust')) || null,
    customer_contact: v('b_ccontact'),
    prime_contractor: v('b_prime'),
    business_year: Number(v('b_year')) || null,
    start_date: v('b_start') || null,
    end_date: v('b_end') || null,
    total_budget: cv('b_budget'),
    participation_type: v('b_ptype'),
    total_purchase: cv('b_purchase'),
    tech_support_date: v('b_tech') || null,
    participation_rate: Number(v('b_prate')) || 0,
    participation_amount: cv('b_pamt'),
    win_probability: Number(v('b_win')) || 0,
    expected_revenue: cv('b_exp'),
    actual_revenue: cv('b_act'),
    has_solution: project.has_solution || 'N',
    sw_registered: v('b_sw'),
    competitor: v('b_comp'),
    intro_channel: v('b_intro'),
    overview: v('b_overview'),
    top_domain: v('b_top'),
    sub_domain: v('b_sub'),
    is_favorite: project.is_favorite || 0,
    // 연도별 매출/매입은 project_sales/project_purchases에서 자동 계산되므로 별도 저장 X
    y2023: project.y2023 || 0, y2024: project.y2024 || 0, y2025: project.y2025 || 0,
    y2026: project.y2026 || 0, y2027: project.y2027 || 0, y2028: project.y2028 || 0,
    y2029: project.y2029 || 0, y2030: project.y2030 || 0
  };
  try {
    await api.put('/api/projects/' + PROJECT_ID, body);
    Object.assign(project, body);
    toast('저장되었습니다.', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function loadTab(name) {
  if (name === 'solutions') return loadSolutions();
  if (name === 'sales') return loadSales();
  if (name === 'purchases') return loadPurchases();
  if (name === 'resources') return loadResources();
  if (name === 'activities') return loadActivities();
  if (name === 'schedule') return loadSchedule();
  if (name === 'summary') return loadSummary();
}

// === 솔루션 납품 ===
async function loadSolutions() {
  const rows = await api.get('/api/project-solutions?project_id=' + PROJECT_ID);
  document.getElementById('tab-solutions').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>솔루션 납품 정보</h3><button class="btn btn-primary btn-sm" id="addSol">+ 추가</button></div>
      <div class="card-body">
        <div class="table-wrap"><table class="data">
          <thead><tr><th>솔루션</th><th>사양</th><th class="num">표준단가</th><th class="num">수량</th><th class="num">내부원가</th><th class="num">할인율(%)</th><th class="num">납품금액</th><th>설치일</th><th>확약서</th><th></th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td>${r.solution_name || ''}</td><td>${r.spec || ''}</td>
              <td class="num">${fmtWon(r.standard_price)}</td>
              <td class="num">${r.quantity}</td>
              <td class="num">${fmtWon(r.internal_cost)}</td>
              <td class="num">${r.discount_rate || 0}</td>
              <td class="num">${fmtWon(r.delivery_amount)}</td>
              <td>${r.install_date || ''}</td>
              <td>${r.contract_issued || ''}</td>
              <td class="actions">
                <button class="btn btn-sm" data-edit-sol="${r.id}">수정</button>
                <button class="btn btn-sm btn-danger" data-del-sol="${r.id}">삭제</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="10" class="empty">납품내역이 없습니다.</td></tr>`}
          </tbody></table></div>
      </div>
    </div>`;
  document.getElementById('addSol').onclick = () => editSolution(null);
  document.querySelectorAll('[data-edit-sol]').forEach(b => b.onclick = () => editSolution(b.dataset.editSol));
  document.querySelectorAll('[data-del-sol]').forEach(b => b.onclick = async () => {
    if (!confirm('삭제하시겠습니까?')) return;
    await api.del('/api/project-solutions/' + b.dataset.delSol);
    loadSolutions();
  });
}
function editSolution(id) {
  const item = id ? null : { quantity: 1, discount_rate: 0, contract_issued: 'N' };
  const open = (it) => openModal(id ? '솔루션 수정' : '솔루션 추가', `
    <div class="grid-form">
      <div class="form-row"><label>솔루션</label><select id="s_id"><option value="">선택</option>${solutions.map(s=>`<option value="${s.id}" data-price="${s.standard_price}" data-cost="${s.internal_cost}" ${s.id==it.solution_id?'selected':''}>${s.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>사양</label><input id="s_spec" value="${escapeAttr(it.spec)}"></div>
      <div class="form-row"><label>표준단가</label>${currencyHtml('s_price', it.standard_price)}</div>
      <div class="form-row"><label>수량</label><input id="s_qty" type="number" value="${it.quantity||1}"></div>
      <div class="form-row"><label>할인율(%)</label><input id="s_disc" type="number" step="0.1" value="${it.discount_rate||0}"></div>
      <div class="form-row"><label title="표준단가 × 수량 × (1 − 할인율)">납품금액 <span class="auto-tag">자동</span></label>${currencyHtml('s_amt', it.delivery_amount)}</div>
      <div class="form-row"><label>내부원가</label>${currencyHtml('s_cost', it.internal_cost)}</div>
      <div></div>
      <div class="form-row"><label>설치확인일</label><input id="s_inst" type="date" value="${it.install_date||''}"></div>
      <div class="form-row"><label>확약서 발행</label><select id="s_contract"><option value="N" ${it.contract_issued!=='Y'?'selected':''}>N</option><option value="Y" ${it.contract_issued==='Y'?'selected':''}>Y</option></select></div>
      <div class="form-row full"><label>비고</label><input id="s_notes" value="${escapeAttr(it.notes)}"></div>
    </div>
    <div class="text-muted" style="font-size:12px;margin-top:8px">* 솔루션 선택 시 표준단가/내부원가 자동 채움 · 납품금액 = 표준단가 × 수량 × (1 − 할인율).</div>
  `, async (m) => {
    const body = {
      project_id: Number(PROJECT_ID),
      solution_id: Number(m.querySelector('#s_id').value) || null,
      spec: m.querySelector('#s_spec').value,
      standard_price: currencyValue(m.querySelector('#s_price')),
      quantity: Number(m.querySelector('#s_qty').value || 1),
      internal_cost: currencyValue(m.querySelector('#s_cost')),
      discount_rate: Number(m.querySelector('#s_disc').value || 0),
      delivery_amount: currencyValue(m.querySelector('#s_amt')),
      install_date: m.querySelector('#s_inst').value || null,
      contract_issued: m.querySelector('#s_contract').value,
      notes: m.querySelector('#s_notes').value
    };
    if (id) await api.put('/api/project-solutions/' + id, body);
    else await api.post('/api/project-solutions', body);
    toast('저장되었습니다.', 'success');
    loadSolutions();
  });
  const setSolFields = (back) => {
    const amtEl = back.querySelector('#s_amt');
    // 납품금액은 자동계산 (readonly)
    amtEl.readOnly = true;
    amtEl.style.background = '#f1f5f9';
    amtEl.title = '자동 계산되는 값입니다';

    const recalcAmt = () => {
      const price = currencyValue(back.querySelector('#s_price'));
      const qty = Number(back.querySelector('#s_qty').value || 1);
      const disc = Number(back.querySelector('#s_disc').value || 0);
      const amt = Math.round(price * qty * (1 - disc / 100));
      amtEl.value = amt.toLocaleString('ko-KR');
    };

    // 표준단가/수량/할인율 변경 시 납품금액 재계산
    ['s_price', 's_qty', 's_disc'].forEach(fid => {
      const el = back.querySelector('#' + fid);
      if (el) { el.addEventListener('input', recalcAmt); el.addEventListener('blur', recalcAmt); }
    });

    const sel = back.querySelector('#s_id');
    sel.onchange = () => {
      const opt = sel.options[sel.selectedIndex];
      if (!opt.value) return;
      back.querySelector('#s_price').value = Number(opt.dataset.price || 0).toLocaleString('ko-KR');
      back.querySelector('#s_cost').value = Number(opt.dataset.cost || 0).toLocaleString('ko-KR');
      recalcAmt();
    };

    recalcAmt();
  };
  if (id) {
    api.get('/api/project-solutions?project_id=' + PROJECT_ID).then(rows => {
      const r = rows.find(x => x.id == id);
      setSolFields(open(r));
    });
  } else {
    setSolFields(open(item));
  }
}

// ============================================================
// 매출 / 채권회수 (인라인 편집, 부가세/합계 컬럼 제외, 행별 저장 버튼)
// 미청구 잔액 = 총 매출 - (이전 행 매출 합계 + 현재 행 매출)  ← 자동 누적 차감
// ============================================================
const COLLECTION_TYPES = ['기성금','선금','잔금','계약금','계좌이체','현금','어음'];
const CASH_TYPES = ['현금','어음'];

function projectTotalRevenue() {
  return Number(project.actual_revenue) || Number(project.expected_revenue) || Number(project.participation_amount) || 0;
}

async function loadSales() {
  const rows = await api.get('/api/sales?project_id=' + PROJECT_ID);
  document.getElementById('tab-sales').innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>매출 &amp; 채권회수 <small class="text-muted" style="font-weight:400;font-size:12px;margin-left:8px;">총 매출 ${fmtWon(projectTotalRevenue())}</small></h3>
        <button class="btn btn-primary btn-sm" id="addSale">+ 추가</button>
      </div>
      <div class="card-body">
        <div class="table-wrap"><table class="inline-edit">
          <thead><tr>
            <th style="width:130px;">세금계산서발행일자</th>
            <th style="width:90px;">발행여부</th>
            <th style="width:140px;">매출금액</th>
            <th style="width:140px;">미청구잔액</th>
            <th style="width:110px;">수금유형</th>
            <th style="width:100px;">현금어음구분</th>
            <th style="width:130px;">입금(예정)일자</th>
            <th style="width:80px;">입금여부</th>
            <th class="act-cell" style="width:90px;"></th>
          </tr></thead>
          <tbody id="salesBody"></tbody>
          <tfoot id="salesFoot"></tfoot>
        </table></div>
      </div>
    </div>`;
  renderSalesRows(rows);
  document.getElementById('addSale').onclick = async () => {
    // 새 행의 초기 미청구 = 총 매출 - 이전 행 매출 합계
    const usedSum = rows.reduce((s, r) => s + (Number(r.sales_amount) || 0), 0);
    const remaining = Math.max(0, projectTotalRevenue() - usedSum);
    await api.post('/api/sales', {
      project_id: Number(PROJECT_ID),
      invoice_date: new Date().toISOString().slice(0,10),
      invoice_issued: 'N', paid: 'N',
      collection_type: '기성금', cash_or_note: '현금',
      sales_amount: 0, vat: 0, total_amount: 0,
      unpaid_balance: remaining
    });
    loadSales();
  };
}

function renderSalesRows(rows) {
  const body = document.getElementById('salesBody');
  body.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input type="date" class="s-idate" value="${r.invoice_date||''}"></td>
      <td><select class="s-iss"><option value="N" ${r.invoice_issued!=='Y'?'selected':''}>N</option><option value="Y" ${r.invoice_issued==='Y'?'selected':''}>Y</option></select></td>
      <td>${currencyHtml('s-amt-' + r.id, r.sales_amount, { cls: 's-amt' })}</td>
      <td>${currencyHtml('s-unpaid-' + r.id, r.unpaid_balance, { cls: 's-unpaid' })}</td>
      <td><select class="s-col">${COLLECTION_TYPES.map(t=>`<option ${r.collection_type===t?'selected':''}>${t}</option>`).join('')}</select></td>
      <td><select class="s-cash">${CASH_TYPES.map(t=>`<option ${r.cash_or_note===t?'selected':''}>${t}</option>`).join('')}</select></td>
      <td><input type="date" class="s-due" value="${r.payment_due_date||''}"></td>
      <td><select class="s-paid"><option value="N" ${r.paid!=='Y'?'selected':''}>N</option><option value="Y" ${r.paid==='Y'?'selected':''}>Y</option></select></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save="${r.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del="${r.id}" title="삭제">🗑</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="9" class="empty">대금수급내역을 추가해주세요.</td></tr>`;

  bindCurrencyInputs(body);

  // 매출금액 변경 시 미청구 자동 재계산
  body.querySelectorAll('.s-amt').forEach(input => {
    input.addEventListener('input', recalcSalesUnpaid);
    input.addEventListener('blur',  recalcSalesUnpaid);
  });

  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('[data-save]').onclick = async () => {
      try {
        await saveSaleRow(id, tr);
        toast('저장되었습니다.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
    tr.querySelector('[data-del]').onclick = async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      await api.del('/api/sales/' + id);
      toast('삭제되었습니다.', 'success');
      loadSales();
    };
  });

  recalcSalesUnpaid(); // 초기 표시
}

function recalcSalesUnpaid() {
  const total = projectTotalRevenue();
  let remaining = total;
  let sumSales = 0, sumUnpaid = 0, sumPaid = 0;
  document.querySelectorAll('#salesBody tr[data-id]').forEach(tr => {
    const amt = currencyValue(tr.querySelector('.s-amt'));
    sumSales += amt;
    remaining -= amt;
    const unpaid = tr.querySelector('.s-unpaid');
    if (unpaid && document.activeElement !== unpaid) {
      unpaid.value = remaining.toLocaleString('ko-KR');
    }
    sumUnpaid += currencyValue(tr.querySelector('.s-unpaid'));
    if (tr.querySelector('.s-paid')?.value === 'Y') sumPaid += amt;
  });
  // 합계 행 갱신
  const tfoot = document.getElementById('salesFoot');
  if (tfoot) {
    const rowCount = document.querySelectorAll('#salesBody tr[data-id]').length;
    tfoot.innerHTML = rowCount ? `
      <tr style="background:#f1f5f9;font-weight:700;">
        <td colspan="2" style="text-align:right;">합계 (${rowCount}건)</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmtWon(sumSales)}</td>
        <td></td>
        <td colspan="4" style="text-align:right;font-size:11px;color:var(--text-muted);font-weight:400;">
          입금완료 ${fmtWon(sumPaid)} · 총 매출 ${fmtWon(total)}
        </td>
        <td></td>
      </tr>` : '';
  }
}

async function saveSaleRow(id, tr) {
  const amt = currencyValue(tr.querySelector('.s-amt'));
  const body = {
    project_id: Number(PROJECT_ID),
    invoice_date: tr.querySelector('.s-idate').value || null,
    invoice_issued: tr.querySelector('.s-iss').value,
    sales_amount: amt,
    vat: 0,
    total_amount: amt,  // 부가세 제외 → 합계 = 매출금액
    unpaid_balance: currencyValue(tr.querySelector('.s-unpaid')),
    collection_type: tr.querySelector('.s-col').value,
    cash_or_note: tr.querySelector('.s-cash').value,
    payment_due_date: tr.querySelector('.s-due').value || null,
    paid: tr.querySelector('.s-paid').value,
    notes: null
  };
  await api.put('/api/sales/' + id, body);
}

// ============================================================
// 매입 / 지급정보 (인라인 편집, 부가세/합계/계산서번호 제외, 행별 저장 버튼)
// 컬럼 순서: 세금계산서발행일자 / 발행여부 / 매입금액 / 매입업체 /
//          매입내역 / 매입구분코드 / 지급(예정)일자 / 실지급여부
// ============================================================
const PURCHASE_CODES = ['솔루션','외주인건','인건비','HW','SW','경비','기타'];

async function loadPurchases() {
  const rows = await api.get('/api/purchases?project_id=' + PROJECT_ID);
  document.getElementById('tab-purchases').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>매입 &amp; 지급정보</h3>
        <button class="btn btn-primary btn-sm" id="addP">+ 추가</button>
      </div>
      <div class="card-body">
        <div class="table-wrap"><table class="inline-edit">
          <thead><tr>
            <th style="width:130px;">세금계산서발행일자</th>
            <th style="width:90px;">발행여부</th>
            <th style="width:140px;">매입금액</th>
            <th style="width:160px;">매입업체</th>
            <th style="width:220px;">매입내역</th>
            <th style="width:110px;">매입구분코드</th>
            <th style="width:130px;">지급(예정)일자</th>
            <th style="width:90px;">실지급여부</th>
            <th class="act-cell" style="width:90px;"></th>
          </tr></thead>
          <tbody id="purcBody"></tbody>
          <tfoot id="purcFoot"></tfoot>
        </table></div>
      </div>
    </div>`;
  renderPurchaseRows(rows);
  document.getElementById('addP').onclick = async () => {
    const today = new Date().toISOString().slice(0,10);
    await api.post('/api/purchases', {
      project_id: Number(PROJECT_ID),
      purchase_code: '인건비',
      invoice_date: today,
      payment_due_date: today,
      invoice_issued: 'N', paid: 'N',
      purchase_amount: 0, vat: 0, total_amount: 0
    });
    loadPurchases();
  };
}

function renderPurchaseRows(rows) {
  const body = document.getElementById('purcBody');
  body.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input type="date" class="p-idate" value="${r.invoice_date||''}"></td>
      <td><select class="p-iss"><option value="N" ${r.invoice_issued!=='Y'?'selected':''}>N</option><option value="Y" ${r.invoice_issued==='Y'?'selected':''}>Y</option></select></td>
      <td>${currencyHtml('p-amt-' + r.id, r.purchase_amount, { cls: 'p-amt' })}</td>
      <td><input class="p-vendor" value="${escapeAttr(r.vendor)}" placeholder="매입 업체"></td>
      <td><input class="p-desc" value="${escapeAttr(r.description)}" placeholder="매입 내역"></td>
      <td><select class="p-code">${PURCHASE_CODES.map(c=>`<option ${r.purchase_code===c?'selected':''}>${c}</option>`).join('')}</select></td>
      <td><input type="date" class="p-due" value="${r.payment_due_date||''}"></td>
      <td><select class="p-paid"><option value="N" ${r.paid!=='Y'?'selected':''}>N</option><option value="Y" ${r.paid==='Y'?'selected':''}>Y</option></select></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save="${r.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del="${r.id}" title="삭제">🗑</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="9" class="empty">매입내역을 추가해주세요.</td></tr>`;

  bindCurrencyInputs(body);
  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('[data-save]').onclick = async () => {
      try {
        await savePurchaseRow(id, tr);
        toast('저장되었습니다.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
    tr.querySelector('[data-del]').onclick = async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      await api.del('/api/purchases/' + id);
      toast('삭제되었습니다.', 'success');
      loadPurchases();
    };
    tr.querySelectorAll('.p-amt').forEach(el => el.addEventListener('input', recalcPurchaseFooter));
    tr.querySelectorAll('.p-paid').forEach(el => el.addEventListener('change', recalcPurchaseFooter));
  });
  recalcPurchaseFooter();
}

function recalcPurchaseFooter() {
  let sumPur = 0, sumPaid = 0, sumUnpaid = 0;
  let countPaid = 0, countUnpaid = 0;
  document.querySelectorAll('#purcBody tr[data-id]').forEach(tr => {
    const amt = currencyValue(tr.querySelector('.p-amt'));
    sumPur += amt;
    if (tr.querySelector('.p-paid')?.value === 'Y') { sumPaid += amt; countPaid++; }
    else { sumUnpaid += amt; countUnpaid++; }
  });
  const tfoot = document.getElementById('purcFoot');
  if (!tfoot) return;
  const rowCount = document.querySelectorAll('#purcBody tr[data-id]').length;
  tfoot.innerHTML = rowCount ? `
    <tr style="background:#f1f5f9;font-weight:700;">
      <td colspan="2" style="text-align:right;">합계 (${rowCount}건)</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmtWon(sumPur)}</td>
      <td colspan="5" style="text-align:right;font-size:11px;color:var(--text-muted);font-weight:400;">
        지급완료 ${countPaid}건 ${fmtWon(sumPaid)} · 미지급 ${countUnpaid}건 ${fmtWon(sumUnpaid)}
      </td>
      <td></td>
    </tr>` : '';
}

async function savePurchaseRow(id, tr) {
  const amt = currencyValue(tr.querySelector('.p-amt'));
  const body = {
    project_id: Number(PROJECT_ID),
    purchase_code: tr.querySelector('.p-code').value,
    payment_due_date: tr.querySelector('.p-due').value || null,
    purchase_amount: amt,
    vat: 0,
    total_amount: amt,
    vendor: tr.querySelector('.p-vendor').value,
    description: tr.querySelector('.p-desc').value,
    invoice_number: null, // 컬럼 제거
    invoice_date: tr.querySelector('.p-idate').value || null,
    invoice_issued: tr.querySelector('.p-iss').value,
    paid: tr.querySelector('.p-paid').value
  };
  await api.put('/api/purchases/' + id, body);
}

// ============================================================
// 투입내역 (project_resources) - 인라인 편집
// ============================================================
const RES_CATEGORIES = ['선택안함','PM','PL','컨설턴트','분석가','개발자','디자이너','QA','운영자','기타'];

async function loadResources() {
  const rows = await api.get('/api/project-resources?project_id=' + PROJECT_ID);
  document.getElementById('tab-resources').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>투입내역</h3><div class="flex gap-8"><button class="btn btn-primary btn-sm" id="addRes">+ 추가</button></div></div>
      <div class="card-body">
        <div class="table-wrap"><table class="inline-edit">
          <thead><tr>
            <th style="width:90px;">구분 <span style="color:#dc2626;">*</span></th>
            <th style="width:120px;">소속</th>
            <th style="width:100px;">이름 <span style="color:#dc2626;">*</span></th>
            <th style="width:90px;">직급</th>
            <th style="width:120px;">투입일</th>
            <th style="width:120px;">철수일</th>
            <th style="width:80px;">투입률</th>
            <th style="width:80px;">투입공수</th>
            <th style="width:80px;">총투입일수</th>
            <th style="width:130px;">표준단가</th>
            <th style="width:130px;">내부인건비</th>
            <th style="width:80px;">할인율</th>
            <th style="width:130px;">내부원가</th>
            <th class="act-cell"></th>
          </tr></thead>
          <tbody id="resBody"></tbody>
        </table></div>
      </div>
    </div>`;
  renderResourceRows(rows);
  document.getElementById('addRes').onclick = async () => {
    const today = new Date().toISOString().slice(0,10);
    await api.post('/api/project-resources', {
      project_id: Number(PROJECT_ID),
      participation_rate: 100,
      start_date: today, end_date: today
    });
    loadResources();
  };
}

function renderResourceRows(rows) {
  const body = document.getElementById('resBody');
  body.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><select class="r-cat">${RES_CATEGORIES.map(c=>`<option ${r.category===c?'selected':''}>${c}</option>`).join('')}</select></td>
      <td><input class="r-aff" value="${escapeAttr(r.affiliation)}" placeholder="소속"></td>
      <td><input class="r-name" value="${escapeAttr(r.name)}" placeholder="이름"></td>
      <td><input class="r-pos" value="${escapeAttr(r.position)}" placeholder="직급"></td>
      <td><input type="date" class="r-sd" value="${r.start_date||''}"></td>
      <td><input type="date" class="r-ed" value="${r.end_date||''}"></td>
      <td><input type="number" class="r-pr" value="${r.participation_rate||100}" min="0" max="100" step="1" style="text-align:right;"></td>
      <td><span class="r-mm ie-readonly" style="display:inline-block;padding:5px 7px;border-radius:4px;text-align:right;width:100%;">${(r.effort_mm||0).toFixed(2)}MM</span></td>
      <td><span class="r-days ie-readonly" style="display:inline-block;padding:5px 7px;border-radius:4px;text-align:right;width:100%;">${r.total_days||0}일</span></td>
      <td>${currencyHtml('r-sp-' + r.id, r.standard_price, { cls: 'r-sp' })}</td>
      <td>${currencyHtml('r-ic-' + r.id, r.internal_cost, { cls: 'r-ic' })}</td>
      <td><input type="number" class="r-dr" value="${r.discount_rate||0}" min="0" max="100" step="0.1" style="text-align:right;"></td>
      <td><span class="r-total ie-readonly" style="display:inline-block;padding:5px 7px;border-radius:4px;text-align:right;width:100%;font-variant-numeric:tabular-nums;">${fmtWon(r.internal_total||0)}</span></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save="${r.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del="${r.id}" title="삭제">🗑</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="14" class="empty">투입내역을 추가해주세요.</td></tr>`;

  bindCurrencyInputs(body);
  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    // 변경 시 자동 계산만 (저장은 버튼 클릭 시)
    const recalc = () => calcResource(tr);
    tr.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });
    tr.querySelector('[data-save]').onclick = async () => {
      try {
        calcResource(tr);
        await saveResourceRow(id, tr);
        toast('저장되었습니다.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
    tr.querySelector('[data-del]').onclick = async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      await api.del('/api/project-resources/' + id);
      toast('삭제되었습니다.', 'success');
      loadResources();
    };
  });
}

function calcResource(tr) {
  const sd = tr.querySelector('.r-sd').value;
  const ed = tr.querySelector('.r-ed').value;
  const pr = Number(tr.querySelector('.r-pr').value || 100);
  let days = 0;
  if (sd && ed) {
    days = Math.max(0, Math.round((new Date(ed) - new Date(sd)) / 86400000) + 1);
  }
  const mm = (days / 20) * (pr / 100); // 한 달 20영업일 가정
  const internalCost = currencyValue(tr.querySelector('.r-ic'));
  const dr = Number(tr.querySelector('.r-dr').value || 0);
  const total = Math.round(internalCost * mm * (1 - dr / 100));
  tr.querySelector('.r-mm').textContent = mm.toFixed(2) + 'MM';
  tr.querySelector('.r-days').textContent = days + '일';
  tr.querySelector('.r-total').textContent = fmtWon(total);
  return { days, mm, total };
}

async function saveResourceRow(id, tr) {
  const calc = calcResource(tr);
  const body = {
    project_id: Number(PROJECT_ID),
    category: tr.querySelector('.r-cat').value,
    affiliation: tr.querySelector('.r-aff').value,
    name: tr.querySelector('.r-name').value,
    position: tr.querySelector('.r-pos').value,
    start_date: tr.querySelector('.r-sd').value || null,
    end_date: tr.querySelector('.r-ed').value || null,
    participation_rate: Number(tr.querySelector('.r-pr').value || 100),
    effort_mm: Number(calc.mm.toFixed(4)),
    total_days: calc.days,
    standard_price: currencyValue(tr.querySelector('.r-sp')),
    internal_cost: currencyValue(tr.querySelector('.r-ic')),
    discount_rate: Number(tr.querySelector('.r-dr').value || 0),
    internal_total: calc.total
  };
  try { await api.put('/api/project-resources/' + id, body); }
  catch (e) { toast(e.message, 'error'); }
}

// ============================================================
// 활동정보등록 - 카운트 chip + 검색 + 인라인 편집
// ============================================================
const ACT_CATEGORIES = ['영업방문','전화상담','이슈등록','리스트등록','기타'];
let _actFilter = { category: '', keyword: '' };

async function loadActivities() {
  const rows = await api.get('/api/activities?project_id=' + PROJECT_ID);
  // 카운트
  const counts = { '전체': rows.length };
  ACT_CATEGORIES.forEach(c => counts[c] = 0);
  rows.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });

  document.getElementById('tab-activities').innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:8px;">
        <div class="act-chips" id="actChips">
          <strong style="font-size:13px;margin-right:6px;">활동정보등록</strong>
          <span class="ac-item ${_actFilter.category===''?'active':''}" data-cat="">전체 <span class="cnt">${counts['전체']}</span></span>
          ${ACT_CATEGORIES.slice(0,4).map(c=>`<span class="ac-item ${_actFilter.category===c?'active':''}" data-cat="${c}">${c} <span class="cnt">${counts[c]||0}</span></span>`).join('')}
        </div>
        <div class="flex gap-8">
          <select id="actFilterCat" style="width:120px;">
            <option value="">전체</option>
            ${ACT_CATEGORIES.map(c=>`<option ${_actFilter.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <input id="actFilterKw" placeholder="내용을 입력하세요." value="${escapeAttr(_actFilter.keyword)}" style="width:220px;">
          <button class="btn btn-success btn-sm" id="actSearchBtn">조회</button>
          <button class="btn btn-sm" id="actResetBtn">초기화</button>
          <button class="btn btn-primary btn-sm" id="addAct">+ 추가</button>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap"><table class="inline-edit">
          <thead><tr>
            <th style="width:130px;">활동일자</th>
            <th style="width:110px;">분야</th>
            <th style="width:120px;text-align:center;">활동 후<br>수주확률(%)</th>
            <th style="width:240px;">제목</th>
            <th>내용</th>
            <th class="act-cell"></th>
          </tr></thead>
          <tbody id="actBody"></tbody>
        </table></div>
      </div>
    </div>`;

  // 필터 적용된 rows
  const filtered = rows.filter(r => {
    if (_actFilter.category && r.category !== _actFilter.category) return false;
    if (_actFilter.keyword) {
      const kw = _actFilter.keyword.toLowerCase();
      if (!((r.title||'').toLowerCase().includes(kw) || (r.content||'').toLowerCase().includes(kw))) return false;
    }
    return true;
  });
  renderActivityRows(filtered);

  document.querySelectorAll('#actChips .ac-item').forEach(el => el.onclick = () => {
    _actFilter.category = el.dataset.cat;
    loadActivities();
  });
  document.getElementById('actSearchBtn').onclick = () => {
    _actFilter.category = document.getElementById('actFilterCat').value;
    _actFilter.keyword = document.getElementById('actFilterKw').value;
    loadActivities();
  };
  document.getElementById('actResetBtn').onclick = () => {
    _actFilter = { category: '', keyword: '' };
    loadActivities();
  };
  document.getElementById('actFilterKw').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('actSearchBtn').click();
  });
  document.getElementById('addAct').onclick = async () => {
    const today = new Date().toISOString().slice(0,10);
    await api.post('/api/activities', {
      project_id: Number(PROJECT_ID),
      activity_date: today,
      category: '영업방문',
      post_win_rate: project.win_probability || 0,
      title: '',
      content: ''
    });
    loadActivities();
  };
}

function renderActivityRows(rows) {
  const body = document.getElementById('actBody');
  body.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input type="date" class="a-date" value="${r.activity_date||''}"></td>
      <td><select class="a-cat">${ACT_CATEGORIES.map(c=>`<option ${r.category===c?'selected':''}>${c}</option>`).join('')}</select></td>
      <td><input type="number" class="a-win" value="${r.post_win_rate||0}" min="0" max="100" step="1" style="text-align:right;"></td>
      <td><input class="a-title" value="${escapeAttr(r.title)}" placeholder="제목"></td>
      <td><textarea class="a-content" placeholder="내용">${escapeHtml(r.content||'')}</textarea></td>
      <td class="act-cell ie-row-actions">
        <button class="ie-icon-btn" data-save="${r.id}" title="저장" style="color:var(--primary);">💾</button>
        <button class="ie-icon-btn danger" data-del="${r.id}" title="삭제">🗑</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="empty">활동 이력이 없습니다.</td></tr>`;

  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('[data-save]').onclick = async () => {
      try {
        await saveActivityRow(id, tr);
        toast('저장되었습니다.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
    tr.querySelector('[data-del]').onclick = async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      await api.del('/api/activities/' + id);
      toast('삭제되었습니다.', 'success');
      loadActivities();
    };
  });
}

async function saveActivityRow(id, tr) {
  const body = {
    project_id: Number(PROJECT_ID),
    activity_date: tr.querySelector('.a-date').value || null,
    category: tr.querySelector('.a-cat').value,
    post_win_rate: Number(tr.querySelector('.a-win').value || 0),
    title: tr.querySelector('.a-title').value,
    content: tr.querySelector('.a-content').value,
    created_by: null
  };
  try { await api.put('/api/activities/' + id, body); }
  catch (e) { toast(e.message, 'error'); }
}

// ============================================================
// 일정 (캘린더 + 리스트) - 프로젝트 전체 일정 통합 표시
// ============================================================
let _scheduleEvents = [];
let _calMonth = null;
let _scheduleView = 'calendar';

const SCHED_LEGEND = [
  ['마감', '#dc2626'], ['수행', '#2563eb'], ['기술', '#a855f7'],
  ['매출(발행)', '#16a34a'], ['매출(입금)', '#eab308'],
  ['매입(발행)', '#f97316'], ['매입(지급)', '#fb923c'],
  ['활동', '#ec4899'], ['솔루션 설치', '#64748b'], ['투입/철수', '#92400e']
];

async function loadSchedule() {
  _scheduleEvents = await api.get('/api/projects/' + PROJECT_ID + '/schedule');

  // 기본 표시 월: 사업 시작일 또는 오늘
  if (!_calMonth) {
    let pivot = new Date();
    if (project.start_date) {
      const d = new Date(project.start_date);
      if (!isNaN(d)) pivot = d;
    }
    _calMonth = { year: pivot.getFullYear(), month: pivot.getMonth() + 1 };
  }

  document.getElementById('tab-schedule').innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:12px;">
        <h3>프로젝트 일정 <small class="text-muted" style="font-weight:400;font-size:11px;margin-left:6px;">총 ${_scheduleEvents.length}건</small></h3>
        <div class="schedule-view-toggle">
          <button class="btn btn-sm ${_scheduleView==='calendar'?'active':''}" data-view="calendar">📅 캘린더</button>
          <button class="btn btn-sm ${_scheduleView==='list'?'active':''}" data-view="list">📋 리스트</button>
        </div>
      </div>
      <div class="card-body">
        <div class="sched-legend" style="margin-bottom:12px;">
          ${SCHED_LEGEND.map(([k, c]) => `<span class="lg-item"><span class="lg-dot" style="background:${c};"></span>${k}</span>`).join('')}
        </div>
        <div id="schedule-view"></div>
      </div>
    </div>`;

  document.querySelectorAll('.schedule-view-toggle button').forEach(b => b.onclick = () => {
    _scheduleView = b.dataset.view;
    document.querySelectorAll('.schedule-view-toggle button').forEach(x => x.classList.toggle('active', x.dataset.view === _scheduleView));
    if (_scheduleView === 'calendar') renderCalendar();
    else renderScheduleList();
  });

  if (_scheduleView === 'calendar') renderCalendar();
  else renderScheduleList();
}

// 로컬 날짜 → YYYY-MM-DD (toISOString의 UTC 변환 회피)
function ymdLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 일정 카테고리 → 탭/탭이름 매핑
const SCHED_TAB_MAP = {
  deadline:      { tab: 'basic',      name: '기본정보' },
  p_start:       { tab: 'basic',      name: '기본정보' },
  p_end:         { tab: 'basic',      name: '기본정보' },
  tech:          { tab: 'basic',      name: '기본정보' },
  sales_invoice: { tab: 'sales',      name: '매출 / 채권' },
  sales_due:     { tab: 'sales',      name: '매출 / 채권' },
  purc_invoice:  { tab: 'purchases',  name: '매입 / 지급' },
  purc_due:      { tab: 'purchases',  name: '매입 / 지급' },
  activity:      { tab: 'activities', name: '활동이력' },
  install:       { tab: 'solutions',  name: '솔루션 납품' },
  res_start:     { tab: 'resources',  name: '투입내역' },
  res_end:       { tab: 'resources',  name: '투입내역' }
};

function switchToTab(name) {
  document.querySelectorAll('#detailTabs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`#detailTabs .tab[data-tab="${name}"]`);
  const panel = document.getElementById('tab-' + name);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
  loadTab(name);
}

// 카테고리별 상세 행 정의 (key, label, format)
function buildDetailRows(ev) {
  const d = ev.detail || {};
  const cat = ev.category;
  const rows = [];
  const yn = v => v === 'Y' ? '<span class="badge badge-수주완료">Y</span>' : v === 'N' ? '<span class="badge badge-수주실패">N</span>' : '-';
  const won = v => (v != null && v !== '') ? fmtWon(v) : '-';
  const txt = v => v ? escapeHtml(v) : '<span class="text-muted">-</span>';

  if (cat === 'sales_invoice' || cat === 'sales_due') {
    rows.push(['세금계산서 발행일', txt(d.invoice_date)]);
    rows.push(['발행여부', yn(d.invoice_issued)]);
    rows.push(['매출금액', `<strong style="color:var(--primary);">${won(d.sales_amount)}</strong>`]);
    rows.push(['미청구잔액', won(d.unpaid_balance)]);
    rows.push(['수금유형', txt(d.collection_type)]);
    rows.push(['현금/어음', txt(d.cash_or_note)]);
    rows.push(['입금(예정)일자', txt(d.payment_due_date)]);
    rows.push(['입금여부', yn(d.paid)]);
    if (d.notes) rows.push(['비고', txt(d.notes)]);
  } else if (cat === 'purc_invoice' || cat === 'purc_due') {
    rows.push(['매입구분', txt(d.purchase_code)]);
    rows.push(['매입금액', `<strong style="color:var(--primary);">${won(d.purchase_amount)}</strong>`]);
    rows.push(['매입업체', txt(d.vendor)]);
    rows.push(['매입내역', txt(d.description)]);
    rows.push(['세금계산서 발행일', txt(d.invoice_date)]);
    rows.push(['발행여부', yn(d.invoice_issued)]);
    if (d.invoice_number) rows.push(['세금계산서번호', txt(d.invoice_number)]);
    rows.push(['지급(예정)일자', txt(d.payment_due_date)]);
    rows.push(['실지급여부', yn(d.paid)]);
  } else if (cat === 'activity') {
    rows.push(['분야', `<span class="badge badge-기획단계">${txt(d.category_orig)}</span>`]);
    rows.push(['제목', `<strong>${txt(d.title)}</strong>`]);
    rows.push(['활동 후 수주확률', d.post_win_rate != null ? `<strong style="color:var(--primary);">${d.post_win_rate}%</strong>` : '-']);
    if (d.creator_name) rows.push(['작성자', txt(d.creator_name)]);
    if (d.content) rows.push(['내용', `<div style="white-space:pre-wrap;background:#f8fafc;padding:8px;border-radius:4px;font-size:12px;max-height:200px;overflow:auto;">${escapeHtml(d.content)}</div>`]);
  } else if (cat === 'install') {
    rows.push(['솔루션', `<strong>${txt(d.solution_name)}</strong>${d.solution_vendor ? ` <small class="text-muted">(${escapeHtml(d.solution_vendor)})</small>` : ''}`]);
    if (d.spec) rows.push(['사양', txt(d.spec)]);
    rows.push(['수량', d.quantity != null ? d.quantity + '개' : '-']);
    rows.push(['표준단가', won(d.standard_price)]);
    rows.push(['내부원가', won(d.internal_cost)]);
    if (d.discount_rate) rows.push(['할인율', `${d.discount_rate}%`]);
    rows.push(['납품금액', `<strong style="color:var(--primary);">${won(d.delivery_amount)}</strong>`]);
    rows.push(['확약서 발행', yn(d.contract_issued)]);
    if (d.notes) rows.push(['비고', txt(d.notes)]);
  } else if (cat === 'res_start' || cat === 'res_end') {
    rows.push(['구분', `<strong>${txt(d.category_orig)}</strong>`]);
    rows.push(['소속 / 이름 / 직급', `${txt(d.affiliation)} / <strong>${txt(d.name)}</strong> / ${txt(d.position)}`]);
    rows.push(['투입일 ~ 철수일', `${txt(d.start_date)} ~ ${txt(d.end_date)}  <span class="text-muted">(${d.total_days||0}일)</span>`]);
    rows.push(['투입률 / 공수', `${d.participation_rate||0}% · ${(d.effort_mm||0).toFixed ? Number(d.effort_mm).toFixed(2) : d.effort_mm}MM`]);
    rows.push(['표준단가', won(d.standard_price)]);
    rows.push(['내부인건비', won(d.internal_cost)]);
    if (d.discount_rate) rows.push(['할인율', `${d.discount_rate}%`]);
    rows.push(['내부원가', `<strong style="color:var(--primary);">${won(d.internal_total)}</strong>`]);
  } else if (cat === 'deadline') {
    rows.push(['프로젝트 상태', `<span class="badge badge-${project.status}">${project.status}</span>`]);
    rows.push(['수주확률', `<strong>${project.win_probability || 0}%</strong>`]);
    rows.push(['예상매출', won(project.expected_revenue)]);
    if (project.competitor) rows.push(['예상 경쟁사', txt(project.competitor)]);
  } else if (cat === 'p_start' || cat === 'p_end' || cat === 'tech') {
    rows.push(['사업기간', `${txt(project.start_date)} ~ ${txt(project.end_date)}`]);
    rows.push(['총 사업비', won(project.total_budget)]);
    rows.push(['참여형태 / 참여율', `${txt(project.participation_type)} · ${project.participation_rate||0}%`]);
    rows.push(['참여금액', won(project.participation_amount)]);
  }
  return rows;
}

// 일정 항목 상세 팝업 (카테고리별 풀 정보 + 인라인 탭 이동)
function showEventDetail(ev) {
  const map = SCHED_TAB_MAP[ev.category] || { tab: 'basic', name: '기본정보' };
  const back = document.createElement('div');
  back.className = 'modal-backdrop over open';
  const overdue = (() => {
    if (ev.paid === 'Y') return false;
    if (!ev.date) return false;
    return ev.date < ymdLocal(new Date()) && (ev.category === 'sales_due' || ev.category === 'purc_due' || ev.category === 'deadline');
  })();
  let statusHtml = '';
  if (ev.paid === 'Y') statusHtml = '<span class="badge badge-수주완료">완료</span>';
  else if (overdue) statusHtml = '<span class="badge badge-수주실패">연체</span>';
  else if (ev.category === 'sales_due' || ev.category === 'purc_due') statusHtml = '<span class="badge badge-사업보류">예정</span>';

  const dowKo = ['일','월','화','수','목','금','토'];
  let dowLabel = '';
  try { const dd = new Date(ev.date); if (!isNaN(dd)) dowLabel = ` (${dowKo[dd.getDay()]})`; } catch {}

  const detailRows = buildDetailRows(ev);

  back.innerHTML = `
    <div class="modal event-detail-modal" style="max-width: 620px;">
      <div class="modal-header" style="background:${ev.color};color:#fff;border-bottom:none;">
        <h3 style="color:#fff;font-size:14px;display:flex;align-items:center;gap:8px;">
          <span style="opacity:.9;">📅 ${ev.date}${dowLabel}</span>
          <span style="background:rgba(255,255,255,.25);padding:2px 10px;border-radius:12px;font-size:12px;">${ev.type}</span>
          ${statusHtml ? `<span style="margin-left:auto;margin-right:30px;">${statusHtml}</span>` : ''}
        </h3>
        <button class="close-x" style="color:#fff;">&times;</button>
      </div>
      <div class="modal-body event-detail-body" style="max-height:60vh;overflow:auto;">
        <div class="ed-title">${escapeHtml(ev.title)}</div>
        <div class="ed-section">
          <div class="ed-section-title">📋 상세 정보</div>
          <div class="ed-rows">
            ${detailRows.map(([k, v]) => `
              <div class="ed-row">
                <div class="ed-label">${k}</div>
                <div class="ed-value">${v}</div>
              </div>`).join('')}
          </div>
        </div>
        <div class="ed-section">
          <div class="ed-section-title">🗂 프로젝트</div>
          <div class="ed-project-info">
            <div style="font-weight:600;color:var(--text);">[${project.project_code}] ${escapeHtml(project.project_name)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">
              <span>본부: ${escapeHtml(project.division_name||'-')}</span>
              <span>고객: ${escapeHtml(project.customer_name||'-')}</span>
              <span>상태: <span class="badge badge-${project.status}" style="font-size:10px;">${project.status}</span></span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-act="close">닫기</button>
        <button class="btn btn-primary" data-act="goto">${map.name} 탭에서 수정 →</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="close"]').onclick = close;
  back.querySelector('[data-act="goto"]').onclick = () => {
    close();
    switchToTab(map.tab);
  };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  const onEsc = (ev2) => { if (ev2.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
}

// 특정 일자의 모든 일정 팝업 (캘린더 +더보기 클릭 시)
function showDayEvents(dateStr, events) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop over open';
  back.innerHTML = `
    <div class="modal" style="max-width: 560px;">
      <div class="modal-header">
        <h3>📅 ${dateStr} 일정 (${events.length}건)</h3>
        <button class="close-x">&times;</button>
      </div>
      <div class="modal-body" style="padding:0;">
        <table class="data" style="margin:0;">
          <thead><tr><th style="width:90px;">구분</th><th>내용</th><th class="num" style="width:140px;">금액</th></tr></thead>
          <tbody>${events.map((e, i) => `
            <tr data-i="${i}" style="cursor:pointer;">
              <td><span class="sched-type-chip" style="background:${e.color};">${escapeHtml(e.type)}</span></td>
              <td>${escapeHtml(e.title)}</td>
              <td class="num">${e.amount ? fmtWon(e.amount) : ''}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-act="close">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="close"]').onclick = close;
  back.querySelectorAll('tr[data-i]').forEach(tr => {
    tr.onclick = () => {
      const i = Number(tr.dataset.i);
      const ev = events[i];
      close();
      if (ev) showEventDetail(ev);
    };
    tr.onmouseenter = () => tr.style.background = '#dbeafe';
    tr.onmouseleave = () => tr.style.background = '';
  });
  back.addEventListener('click', e => { if (e.target === back) close(); });
}

function renderCalendar() {
  const { year, month } = _calMonth;
  const byDate = {};
  _scheduleEvents.forEach((e, idx) => {
    e._idx = idx;  // index lookup용
    const key = (e.date || '').slice(0, 10);
    if (!key) return;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(e);
  });

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = ymdLocal(new Date());

  const cells = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: new Date(year, month - 1, -startDow + i + 1), otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month - 1, d), otherMonth: false });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), otherMonth: true });
  }

  const view = document.getElementById('schedule-view');
  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;">
      <div class="flex gap-8">
        <button class="btn btn-sm" id="cal-prev">‹ 이전</button>
        <button class="btn btn-sm" id="cal-today">오늘</button>
        <button class="btn btn-sm" id="cal-next">다음 ›</button>
      </div>
      <h4 style="margin:0;font-size:16px;font-weight:700;">${year}년 ${month}월</h4>
      <div style="font-size:12px;color:var(--text-muted);">${_scheduleEvents.length}개 일정</div>
    </div>
    <table class="cal-table">
      <thead><tr>${['일','월','화','수','목','금','토'].map((d, i) =>
        `<th class="cal-dow ${i===0?'sun':''} ${i===6?'sat':''}">${d}</th>`).join('')}</tr></thead>
      <tbody>${[0,1,2,3,4,5].map(week => `<tr>${cells.slice(week*7, week*7+7).map((c) => {
        const dStr = ymdLocal(c.date);
        const events = byDate[dStr] || [];
        const isToday = dStr === today;
        const dow = c.date.getDay();
        return `<td class="cal-cell ${c.otherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${dow===0?'sun':''} ${dow===6?'sat':''}">
          <div class="cal-date">${c.date.getDate()}</div>
          <div class="cal-events">
            ${events.slice(0, 4).map(e => `
              <div class="cal-event" data-eidx="${e._idx}" style="background:${e.color};cursor:pointer;" title="${escapeAttr(e.type)} - ${escapeAttr(e.title)}${e.amount?' · '+fmtWon(e.amount):''} (클릭하여 상세보기)">
                ${escapeHtml(e.title)}${e.amount ? ' ' + fmtEokShort(e.amount) : ''}
              </div>`).join('')}
            ${events.length > 4 ? `<div class="cal-more" data-day="${dStr}">+${events.length - 4} 더보기</div>` : ''}
          </div>
        </td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>`;

  // 캘린더 이벤트 chip 클릭 → 상세 팝업
  view.querySelectorAll('.cal-event').forEach(el => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      const idx = Number(el.dataset.eidx);
      if (!isNaN(idx) && _scheduleEvents[idx]) showEventDetail(_scheduleEvents[idx]);
    };
  });

  document.getElementById('cal-prev').onclick = () => {
    _calMonth.month--; if (_calMonth.month < 1) { _calMonth.month = 12; _calMonth.year--; }
    renderCalendar();
  };
  document.getElementById('cal-next').onclick = () => {
    _calMonth.month++; if (_calMonth.month > 12) { _calMonth.month = 1; _calMonth.year++; }
    renderCalendar();
  };
  document.getElementById('cal-today').onclick = () => {
    const n = new Date();
    _calMonth = { year: n.getFullYear(), month: n.getMonth() + 1 };
    renderCalendar();
  };
  // "더보기" 클릭 → 해당 일자 전체 일정 팝업 (각 항목 클릭 시 상세 팝업)
  view.querySelectorAll('.cal-more').forEach(el => el.onclick = (ev) => {
    ev.stopPropagation();
    const day = el.dataset.day;
    showDayEvents(day, byDate[day] || []);
  });
}

function fmtEokShort(n) {
  if (!n) return '';
  const eok = n / 100000000;
  if (Math.abs(eok) >= 1) return eok.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억';
  const man = n / 10000;
  if (Math.abs(man) >= 1) return Math.round(man).toLocaleString('ko-KR') + '만';
  return n.toLocaleString('ko-KR');
}

function renderScheduleList() {
  const groups = {};
  _scheduleEvents.forEach((e, idx) => {
    e._idx = idx;
    const key = (e.date || '').slice(0, 7); // YYYY-MM
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  const keys = Object.keys(groups).sort();
  const view = document.getElementById('schedule-view');
  if (!keys.length) {
    view.innerHTML = '<div class="empty">일정이 없습니다.</div>';
    return;
  }
  const today = ymdLocal(new Date());
  view.innerHTML = keys.map(k => {
    const [y, m] = k.split('-');
    return `<div class="sched-month-group">
      <h4>${y}년 ${Number(m)}월 <small style="color:var(--text-muted);font-weight:400;font-size:12px;">${groups[k].length}건</small></h4>
      <div class="table-wrap"><table class="data" style="margin:0;">
        <thead><tr>
          <th style="width:110px;">일자</th>
          <th style="width:90px;">구분</th>
          <th>내용</th>
          <th class="num" style="width:160px;">금액</th>
          <th style="width:90px;">상태</th>
        </tr></thead>
        <tbody>${groups[k].map(e => {
          const overdue = e.date < today && e.paid !== 'Y' && (e.category === 'sales_due' || e.category === 'purc_due' || e.category === 'deadline');
          let statusBadge = '';
          if (e.paid === 'Y') statusBadge = '<span class="badge badge-수주완료">완료</span>';
          else if (overdue) statusBadge = '<span class="badge badge-수주실패">연체</span>';
          else if (e.category === 'sales_due' || e.category === 'purc_due') statusBadge = '<span class="badge badge-사업보류">예정</span>';
          return `<tr data-eidx="${e._idx}" style="cursor:pointer;">
            <td class="${overdue?'text-danger fw-bold':''}">${e.date}${overdue?' ⚠':''}</td>
            <td><span class="sched-type-chip" style="background:${e.color};">${escapeHtml(e.type)}</span></td>
            <td>${escapeHtml(e.title)}</td>
            <td class="num">${e.amount ? fmtWon(e.amount) : ''}</td>
            <td>${statusBadge}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  }).join('');

  // 행 클릭 → 상세 팝업
  view.querySelectorAll('tr[data-eidx]').forEach(tr => {
    tr.onclick = () => {
      const idx = Number(tr.dataset.eidx);
      if (!isNaN(idx) && _scheduleEvents[idx]) showEventDetail(_scheduleEvents[idx]);
    };
    tr.onmouseenter = () => tr.style.background = '#f1f5f9';
    tr.onmouseleave = () => tr.style.background = '';
  });
}

// === 손익 요약 ===
async function loadSummary() {
  const s = await api.get('/api/projects/' + PROJECT_ID + '/summary');
  document.getElementById('tab-summary').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card primary"><div class="label">매출 합계</div><div class="value">${fmtEok(s.sales_total)}</div><div class="sub">${fmtWon(s.sales_total)}</div></div>
      <div class="stat-card warning"><div class="label">매입 합계</div><div class="value">${fmtEok(s.purchase_total)}</div><div class="sub">${fmtWon(s.purchase_total)}</div></div>
      <div class="stat-card success"><div class="label">매출총이익</div><div class="value">${fmtEok(s.gross_profit)}</div><div class="sub">${fmtWon(s.gross_profit)} (매출 - 매입)</div></div>
      <div class="stat-card danger"><div class="label">미수금</div><div class="value">${fmtEok(s.unpaid)}</div><div class="sub">${fmtWon(s.unpaid)}</div></div>
      <div class="stat-card"><div class="label">솔루션 납품액</div><div class="value">${fmtEok(s.solution_delivery)}</div><div class="sub">내부원가 ${fmtWon(s.solution_cost)}</div></div>
    </div>
    <div class="card"><div class="card-body text-muted" style="font-size:12px">* 본 손익은 프로젝트 단위 매출/매입 합산값입니다. 본부 단위의 영업이익(판관비/공통비 반영)은 대시보드를 확인하세요.</div></div>
  `;
}

// === 옵션 헬퍼 ===
function optionDivisions(sel) {
  return `<option value="">선택</option>` + divisions.map(d => `<option value="${d.id}" ${d.id==sel?'selected':''}>${d.name}</option>`).join('');
}
function optionCustomers(sel) {
  return `<option value="">선택</option>` + customers.map(c => `<option value="${c.id}" ${c.id==sel?'selected':''}>${c.name}</option>`).join('');
}
function optionUsers(sel) {
  // 담당자(사업담당/PM/영업)는 직원(is_login=0). 현재 지정된 사람은 로그인계정이라도 표시.
  const staff = users.filter(u => !u.is_login || u.id == sel);
  return `<option value="">선택</option>` + staff.map(u => `<option value="${u.id}" ${u.id==sel?'selected':''}>${u.name}</option>`).join('');
}
function optionTypes(sel) {
  return `<option value="">선택</option>` + types.map(t => `<option value="${t.id}" ${t.id==sel?'selected':''}>(${t.code}) ${t.name}</option>`).join('');
}

function escapeHtml(s) { return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

init();
