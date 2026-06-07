renderLayout('영업목표 / 판관비');

let divisions = [];
let year = new Date().getFullYear();
let _expensesMap = {}; // {division_id: {sga, common_cost}}

async function init() {
  divisions = await api.get('/api/masters/divisions');

  const yearSel = document.getElementById('yearSel');
  for (let y = new Date().getFullYear() + 1; y >= new Date().getFullYear() - 3; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`;
  }
  yearSel.onchange = () => { year = Number(yearSel.value); load(); };
  document.getElementById('saveAll').onclick = saveAll;

  load();
}

async function load() {
  const [targets, expenses] = await Promise.all([
    api.get('/api/targets?year=' + year),
    api.get('/api/expenses?year=' + year)
  ]);
  const tMap = Object.fromEntries(targets.map(t => [t.division_id, t]));
  _expensesMap = Object.fromEntries(expenses.map(e => [e.division_id, e]));

  document.getElementById('tgtTbody').innerHTML = divisions.map(d => {
    const t = tMap[d.id] || {};
    const e = _expensesMap[d.id] || {};
    return `
      <tr data-div="${d.id}">
        <td><strong>${d.name}</strong><br><small class="text-muted">${d.code}</small></td>
        <td class="num">${currencyHtml('rev_' + d.id, t.target_revenue || 0)}</td>
        <td class="num">${currencyHtml('prof_' + d.id, t.target_profit || 0)}</td>
        <td class="num">
          <div class="sga-display" data-div="${d.id}" style="text-align:right;padding:6px 10px;background:#f1f5f9;border-radius:6px;font-variant-numeric:tabular-nums;color:var(--text);font-weight:500;">
            ${fmtWon(e.sga || 0)}
          </div>
        </td>
        <td class="num">
          <div class="com-display" data-div="${d.id}" style="text-align:right;padding:6px 10px;background:#f1f5f9;border-radius:6px;font-variant-numeric:tabular-nums;color:var(--text);font-weight:500;">
            ${fmtWon(e.common_cost || 0)}
          </div>
        </td>
        <td class="num">
          <div class="op-profit" data-div="${d.id}" style="text-align:right;padding:6px 10px;font-weight:600;color:var(--primary);font-variant-numeric:tabular-nums;">-</div>
        </td>
        <td class="text-center">
          <button class="btn btn-sm monthly-btn" data-div="${d.id}" data-name="${esc(d.name)}" title="월별 판관비/공통비 입력">📅 월별</button>
        </td>
        <td><input class="memo" data-div="${d.id}" value="${(t.memo || e.memo || '').replace(/"/g,'&quot;')}"></td>
      </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty">등록된 본부가 없습니다.</td></tr>`;

  bindCurrencyInputs(document.getElementById('tgtTbody'));

  // 이익목표 변경 시에만 매출이익목표 갱신
  document.querySelectorAll('#tgtTbody input.currency').forEach(input => {
    input.addEventListener('input', () => { updateRowOpProfit(input.id); updateFooter(); });
  });

  // 월별 입력 버튼
  document.querySelectorAll('.monthly-btn').forEach(b => b.onclick = () => {
    openMonthlyExpenseModal(Number(b.dataset.div), b.dataset.name);
  });

  divisions.forEach(d => updateRowOpProfit('rev_' + d.id));
  updateFooter();
}

function esc(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// 매출이익목표 = 이익목표 + 판매관리비 + 공통비
function updateRowOpProfit(triggerId) {
  const m = (triggerId || '').match(/_(\d+)$/);
  if (!m) return;
  const divId = m[1];
  const prof = currencyValue(document.getElementById('prof_' + divId));
  const e = _expensesMap[divId] || { sga: 0, common_cost: 0 };
  const sga = e.sga || 0;
  const com = e.common_cost || 0;
  const gp = prof + sga + com;
  const div = document.querySelector(`.op-profit[data-div="${divId}"]`);
  if (div) div.textContent = fmtWon(gp);
}

function updateFooter() {
  let rev = 0, prof = 0, sga = 0, com = 0;
  divisions.forEach(d => {
    rev  += currencyValue(document.getElementById('rev_'  + d.id));
    prof += currencyValue(document.getElementById('prof_' + d.id));
    const e = _expensesMap[d.id] || {};
    sga += e.sga || 0;
    com += e.common_cost || 0;
  });
  const gp = prof + sga + com;
  const tfoot = document.getElementById('tgtTfoot');
  tfoot.innerHTML = `
    <tr style="background:#f1f5f9;font-weight:700;border-top:2px solid var(--border);">
      <td>전사 합계</td>
      <td class="num">${fmtWon(rev)}</td>
      <td class="num">${fmtWon(prof)}</td>
      <td class="num">${fmtWon(sga)}</td>
      <td class="num">${fmtWon(com)}</td>
      <td class="num" style="color:var(--primary);">${fmtWon(gp)}</td>
      <td></td>
      <td class="text-muted" style="font-size:11px;font-weight:400;">매출이익목표 = 이익목표 + 판관비 + 공통비</td>
    </tr>`;
}

async function saveAll() {
  const rows = document.querySelectorAll('#tgtTbody tr[data-div]');
  let ok = 0;
  for (const tr of rows) {
    const divId = Number(tr.dataset.div);
    const memoEl = tr.querySelector('input.memo');
    const memo = memoEl ? memoEl.value : '';
    await api.post('/api/targets/upsert', {
      year,
      division_id: divId,
      target_revenue: currencyValue(document.getElementById('rev_' + divId)),
      target_profit: currencyValue(document.getElementById('prof_' + divId)),
      memo
    });
    ok++;
  }
  toast(`${ok}개 본부 매출/이익목표 저장 완료. 판관비/공통비는 월별 입력으로 관리합니다.`, 'success');
}

// ============================================================
// 월별 판관비/공통비 입력 모달
// ============================================================
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

async function openMonthlyExpenseModal(divId, divName) {
  // 기존 월별 데이터 로드
  const rows = await api.get(`/api/expenses/monthly?year=${year}&division_id=${divId}`);
  const map = {};
  rows.forEach(r => { map[r.month] = r; });

  const back = document.createElement('div');
  back.className = 'modal-backdrop over open';
  back.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-header" style="background:#2563eb;color:#fff;border-bottom:none;">
        <h3 style="color:#fff;">📅 ${esc(divName)} - ${year}년 월별 판관비/공통비</h3>
        <button class="close-x" style="color:#fff;">&times;</button>
      </div>
      <div class="modal-body">
        <div class="text-muted mb-8" style="font-size:12px;">
          각 월의 판매관리비/공통비를 입력하세요. 저장 시 본부별 연 합계가 자동으로 갱신됩니다.
        </div>
        <table class="inline-edit" style="width:100%;">
          <thead><tr>
            <th style="width:80px;text-align:center;">월</th>
            <th style="width:42%;text-align:right;">판관비(원)</th>
            <th style="text-align:right;">공통비(원)</th>
          </tr></thead>
          <tbody id="mexBody">
            ${MONTHS.map(m => {
              const r = map[m] || {};
              return `<tr data-month="${m}">
                <td style="text-align:center;font-weight:600;">${m}월</td>
                <td>${currencyHtml('mex_sga_' + m, r.sga || 0, { cls: 'mex-sga' })}</td>
                <td>${currencyHtml('mex_com_' + m, r.common_cost || 0, { cls: 'mex-com' })}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot id="mexFoot"></tfoot>
        </table>
      </div>
      <div class="modal-footer">
        <button class="btn" data-act="even" style="margin-right:auto;" title="첫 번째 행 값을 12개월에 균등 분배">균등 분배</button>
        <button class="btn btn-outline" data-act="cancel">취소</button>
        <button class="btn btn-primary" data-act="save">저장</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  bindCurrencyInputs(back);

  const close = () => back.remove();
  back.querySelector('.close-x').onclick = close;
  back.querySelector('[data-act="cancel"]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });

  const recalcFoot = () => {
    let sga = 0, com = 0;
    back.querySelectorAll('#mexBody tr').forEach(tr => {
      sga += currencyValue(tr.querySelector('.mex-sga'));
      com += currencyValue(tr.querySelector('.mex-com'));
    });
    back.querySelector('#mexFoot').innerHTML = `
      <tr style="background:#f1f5f9;font-weight:700;">
        <td style="text-align:center;">합계</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--primary);">${fmtWon(sga)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--primary);">${fmtWon(com)}</td>
      </tr>`;
  };
  back.querySelectorAll('input.currency').forEach(el => el.addEventListener('input', recalcFoot));
  recalcFoot();

  // 균등 분배 (1월 값을 12개월에 균등하게)
  back.querySelector('[data-act="even"]').onclick = () => {
    const annualSga = currencyValue(back.querySelector('#mex_sga_1')) * 12;
    const annualCom = currencyValue(back.querySelector('#mex_com_1')) * 12;
    const promptText = '연 합계로 균등 분배할 금액을 콤마(,)로 구분 입력하세요.\n예: 12000000,3000000  → 판관비 1200만/12=100만씩, 공통비 300만/12=25만씩\n\n현재 1월 × 12 기준 추천: ' + annualSga.toLocaleString() + ',' + annualCom.toLocaleString();
    const input = prompt(promptText, annualSga + ',' + annualCom);
    if (!input) return;
    const [sgaStr, comStr] = input.split(',').map(s => (s||'').trim());
    const totalSga = Number(String(sgaStr).replace(/[^\d]/g, '')) || 0;
    const totalCom = Number(String(comStr).replace(/[^\d]/g, '')) || 0;
    const baseS = Math.floor(totalSga / 12), baseC = Math.floor(totalCom / 12);
    MONTHS.forEach(m => {
      const sgaVal = m === 12 ? (totalSga - baseS * 11) : baseS;
      const comVal = m === 12 ? (totalCom - baseC * 11) : baseC;
      const sgaInput = back.querySelector('#mex_sga_' + m);
      const comInput = back.querySelector('#mex_com_' + m);
      if (sgaInput) sgaInput.value = sgaVal ? sgaVal.toLocaleString('ko-KR') : '';
      if (comInput) comInput.value = comVal ? comVal.toLocaleString('ko-KR') : '';
    });
    recalcFoot();
  };

  // 저장
  back.querySelector('[data-act="save"]').onclick = async () => {
    const months = MONTHS.map(m => {
      const tr = back.querySelector(`tr[data-month="${m}"]`);
      return {
        month: m,
        sga: currencyValue(tr.querySelector('.mex-sga')),
        common_cost: currencyValue(tr.querySelector('.mex-com'))
      };
    });
    try {
      const result = await api.post('/api/expenses/monthly/bulk', {
        year, division_id: divId, months
      });
      toast(`${divName} 월별 데이터 저장 완료. 연 합계: 판관비 ${fmtWon(result.yearly.sga)} / 공통비 ${fmtWon(result.yearly.common_cost)}`, 'success');
      close();
      load(); // 본 페이지 재로드 (연 합계 갱신)
    } catch (e) {
      toast('저장 실패: ' + e.message, 'error');
    }
  };
}

init();
