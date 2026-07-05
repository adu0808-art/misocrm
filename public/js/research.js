renderLayout('과제 관리');

const RESEARCH_STAGES = ['기획', '신청', '선정', '협약체결', '수행중', '최종평가', '종료'];
const STAGE_COLORS = { '기획': '#64748b', '신청': '#0ea5e9', '선정': '#6366f1', '협약체결': '#8b5cf6', '수행중': '#2563eb', '최종평가': '#f59e0b', '종료': '#16a34a', '미지정': '#cbd5e1' };

let divisions = [];
let activeStages = new Set();   // 선택된 진행단계 필터(다중 선택, 비어있으면 전체)
const sels = {};

function stageBadge(stage) {
  const s = stage || '미지정';
  const c = STAGE_COLORS[s] || '#94a3b8';
  return `<span style="display:inline-block;padding:2px 9px;border-radius:11px;font-size:11px;font-weight:600;color:#fff;background:${c};">${s}</span>`;
}

async function init() {
  divisions = await api.get('/api/masters/divisions');
  const cur = new Date().getFullYear();
  const years = [{ value: '', label: '전체 연도' }];
  for (let y = cur + 1; y >= cur - 4; y--) years.push({ value: y, label: y + '년' });
  sels.year = new SearchableSelect(document.getElementById('ss_year'), { options: years, value: cur, allowClear: false, onChange: load });
  sels.div = new SearchableSelect(document.getElementById('ss_div'), { options: [{ value: '', label: '전체 본부' }, ...divisions.map(d => ({ value: d.id, label: d.name }))], value: '', onChange: load });

  document.getElementById('searchBtn').onclick = load;
  document.getElementById('f_kw').addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
  document.getElementById('resetBtn').onclick = () => { sels.year.setValue(cur); sels.div.setValue(''); activeStages.clear(); document.getElementById('f_kw').value = ''; load(); };
  document.getElementById('addBtn').onclick = () => openNewResearch();
  load();
}

function params() {
  const p = new URLSearchParams();
  const y = sels.year.getValue(); if (y) p.set('year', y);
  const d = sels.div.getValue(); if (d) p.set('division_id', d);
  if (activeStages.size) p.set('stages', Array.from(activeStages).join(','));
  const kw = document.getElementById('f_kw').value.trim(); if (kw) p.set('keyword', kw);
  return p.toString();
}

async function load() {
  const qs = params();
  const [list, agg] = await Promise.all([
    api.get('/api/research' + (qs ? '?' + qs : '')),
    api.get('/api/research/aggregate' + (qs ? '?' + qs : ''))
  ]);
  // 진행단계 필터 칩 (프로젝트 상태 칩과 동일 방식, 클릭 필터)
  const stageMap = Object.fromEntries((agg.stages || []).map(s => [s.stage, s.cnt]));
  const order = [...RESEARCH_STAGES];
  if (stageMap['미지정']) order.push('미지정');
  const chips = [{ key: '', label: '진행단계 전체', cnt: agg.totals.cnt || 0, allBtn: true }]
    .concat(order.map(s => ({ key: s === '미지정' ? '__none__' : s, label: s, cnt: stageMap[s] || 0 })));
  const wrap = document.getElementById('stageChips');
  wrap.innerHTML = `<span class="text-muted" style="font-size:12px;font-weight:600;margin-right:4px;">조회결과</span>` +
    chips.map(c => {
      const isActive = c.key === '' ? activeStages.size === 0 : activeStages.has(c.key);
      return `<span class="status-chip ${c.allBtn ? 'all' : ''} ${isActive ? 'active' : ''}" data-st="${c.key}"><span>${c.label}</span><span class="cnt">${c.cnt}</span></span>`;
    }).join('');
  wrap.querySelectorAll('.status-chip').forEach(el => el.onclick = () => {
    const st = el.dataset.st;
    if (!st) activeStages.clear();
    else if (activeStages.has(st)) activeStages.delete(st);
    else activeStages.add(st);
    load();
  });
  // 합계는 조회된 목록(필터 반영) 기준으로 계산
  const sum = k => list.reduce((a, r) => a + (r[k] || 0), 0);
  const t = { total_budget: sum('total_budget'), year_funds: sum('year_funds'), cost_executed: sum('cost_executed'), funds_received: sum('funds_received') };
  const curYear = sels.year.getValue() || new Date().getFullYear();
  const thYF = document.getElementById('thYearFund'); if (thYF) thYF.textContent = `당해 연구비 (${curYear})`;
  document.getElementById('totalsInfo').innerHTML =
    `총연구비 <strong>${fmtWon(t.total_budget)}</strong> · 당해 연구비 <strong style="color:var(--primary);">${fmtWon(t.year_funds)}</strong> · 집행 <strong>${fmtWon(t.cost_executed)}</strong> · 수급 <strong>${fmtWon(t.funds_received)}</strong>`;

  document.getElementById('resBody').innerHTML = list.map(r => {
    const rate = r.total_budget ? Math.round((r.cost_executed || 0) / r.total_budget * 100) : 0;
    return `<tr data-id="${r.id}" style="cursor:pointer;">
      <td style="font-variant-numeric:tabular-nums;">${esc(r.project_code)}</td>
      <td><span style="color:#2563eb;font-weight:500;">${esc(r.project_name)}</span></td>
      <td>${esc(r.division_name || '')}</td>
      <td>${esc(r.lead_name || r.manager_name || '')}</td>
      <td>${stageBadge(r.research_stage)}</td>
      <td class="num">${fmtWon(r.total_budget)}</td>
      <td class="num" style="color:var(--primary);">${fmtWon(r.year_funds || 0)}</td>
      <td class="num">${rate}%</td>
      <td class="num">${r.member_count || 0}명</td>
      <td style="font-size:12px;">${(r.start_date || '') + (r.end_date ? ' ~ ' + r.end_date : '')}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="10" class="empty">과제가 없습니다.</td></tr>`;

  // 합계 행 (첫 열에 '합계')
  document.getElementById('resFoot').innerHTML = list.length ? `
    <tr style="background:#f1f5f9;font-weight:700;">
      <td>합계</td>
      <td style="font-weight:400;color:#64748b;font-size:12px;">${list.length}건</td>
      <td></td><td></td><td></td>
      <td class="num">${fmtWon(t.total_budget)}</td>
      <td class="num" style="color:var(--primary);">${fmtWon(t.year_funds)}</td>
      <td></td><td></td><td></td>
    </tr>` : '';

  document.querySelectorAll('#resBody tr[data-id]').forEach(tr => tr.onclick = () => openResearchPopup(tr.dataset.id));
}

// 과제 상세 팝업 (iframe)
function openResearchPopup(id) {
  const back = document.createElement('div');
  back.className = 'detail-popup-back';
  back.innerHTML = `<div class="detail-popup"><div class="dp-head"><h3>과제 상세</h3><button class="dp-close">&times;</button></div>
    <iframe src="research-detail.html?id=${encodeURIComponent(id)}&popup=1" style="width:100%;height:100%;border:none;"></iframe></div>`;
  document.body.appendChild(back);
  const close = () => { back.remove(); load(); };
  back.querySelector('.dp-close').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  const onEsc = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
}

function openNewResearch() {
  const cur = new Date().getFullYear();
  openModal('신규 과제', `
    <div class="grid-form">
      <div class="form-row"><label class="required">과제명</label><input id="n_name"></div>
      <div class="form-row"><label>주관본부</label><select id="n_div"><option value="">선택</option>${divisions.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
      <div class="form-row"><label>진행단계</label><select id="n_stage">${RESEARCH_STAGES.map(s => `<option ${s === '수행중' ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="form-row"><label>협약연도</label><input id="n_year" type="number" value="${cur}"></div>
      <div class="form-row"><label>연구기간</label><div class="flex gap-8"><input id="n_sd" type="date" style="flex:1;"><input id="n_ed" type="date" style="flex:1;"></div></div>
      <div class="form-row"><label>총연구비</label>${currencyHtml('n_budget', 0)}</div>
      <div class="form-row"><label>전문기관</label><input id="n_agency" placeholder="예: IITP, NIPA"></div>
    </div>`, async (m) => {
    const body = {
      project_name: m.querySelector('#n_name').value.trim(),
      division_id: Number(m.querySelector('#n_div').value) || null,
      research_stage: m.querySelector('#n_stage').value,
      business_year: Number(m.querySelector('#n_year').value) || cur,
      start_date: m.querySelector('#n_sd').value || null,
      end_date: m.querySelector('#n_ed').value || null,
      total_budget: currencyValue(m.querySelector('#n_budget')),
      specialized_agency: m.querySelector('#n_agency').value.trim() || null
    };
    if (!body.project_name) { toast('과제명은 필수입니다.', 'error'); return false; }
    const r = await api.post('/api/research', body);
    toast('과제가 등록되었습니다. 번호: ' + (r.project_code || ''), 'success');
    setTimeout(() => openResearchPopup(r.id), 300);
  });
}

init();
