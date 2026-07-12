renderLayout('참여인력 관리');

let employees = [];
let matrix = [];       // 서버 매트릭스(참여자)
const sels = {};

async function init() {
  employees = await api.get('/api/masters/users');
  const cur = new Date().getFullYear();
  const years = [];
  for (let y = cur + 1; y >= cur - 4; y--) years.push({ value: y, label: y + '년' });
  sels.year = new SearchableSelect(document.getElementById('ss_year'), { options: years, value: cur, allowClear: false, onChange: load });

  // 본부 옵션: 재직 직원의 소속본부(hq) + 매트릭스 org 합집합
  const hqs = new Set(employees.filter(e => !e.is_login && e.hq).map(e => e.hq));
  sels.div = new SearchableSelect(document.getElementById('ss_div'), {
    options: [{ value: '', label: '전체 본부' }, ...[...hqs].sort((a, b) => a.localeCompare(b, 'ko')).map(h => ({ value: h, label: h }))],
    value: '', onChange: render
  });

  document.getElementById('f_kw').addEventListener('input', render);
  document.getElementById('chkOver').addEventListener('change', render);
  document.getElementById('chkAll').addEventListener('change', render);
  await load();
}

async function load() {
  const year = sels.year.getValue();
  const data = await api.get('/api/research-members/participation-matrix?year=' + year);
  matrix = data.rows || [];
  render();
}

function currentRows() {
  const byKey = new Map(matrix.map(r => [r.employee_number ? 'E:' + r.employee_number : 'N:' + r.name, r]));
  let rows = matrix.slice();
  // 미참여 직원 포함
  if (document.getElementById('chkAll').checked) {
    for (const e of employees) {
      if (e.is_login) continue;
      const key = e.employee_number ? 'E:' + e.employee_number : 'N:' + e.name;
      if (byKey.has(key)) continue;
      rows.push({ key, employee_number: e.employee_number || null, name: e.name, org: e.hq || '', position: e.position || '',
        active: e.active, months: Array(12).fill(0), maxMonth: 0, avg: 0, projectCount: 0, projects: [] });
    }
  }
  // 필터
  const div = sels.div.getValue();
  const kw = document.getElementById('f_kw').value.trim().toLowerCase();
  const overOnly = document.getElementById('chkOver').checked;
  if (div) rows = rows.filter(r => r.org === div);
  if (kw) rows = rows.filter(r => (r.name || '').toLowerCase().includes(kw));
  if (overOnly) rows = rows.filter(r => r.maxMonth > 100);
  return rows;
}

function cellColor(v) {
  if (v > 100) return 'background:#fee2e2;color:#b91c1c;font-weight:700;';
  if (v >= 100) return 'background:#dcfce7;color:#15803d;font-weight:600;';
  if (v > 0) return 'background:#eff6ff;color:#1e40af;';
  return 'color:#cbd5e1;';
}

function render() {
  const rows = currentRows();
  const empByNo = new Map(employees.filter(e => e.employee_number).map(e => [e.employee_number, e]));
  const head = document.getElementById('pmHead');
  head.innerHTML = `<th style="width:78px;position:sticky;left:0;background:#f8fafc;z-index:1;">성명</th><th style="width:80px;">본부</th><th style="width:56px;">직급</th><th class="num" style="width:40px;">과제</th>`
    + Array.from({ length: 12 }, (_, i) => `<th class="num" style="width:38px;padding:8px 2px;">${i + 1}월</th>`).join('')
    + `<th class="num" style="width:46px;">최대</th><th style="width:260px;">비고</th>`;

  const body = document.getElementById('pmBody');
  body.innerHTML = rows.length ? rows.map(r => {
    const emp = r.employee_number ? empByNo.get(r.employee_number) : null;
    const noteCell = emp
      ? `<input class="pm-note" data-id="${emp.id}" value="${esc(emp.note || '')}" placeholder="비고" style="width:248px;font-size:12px;">`
      : `<input value="" placeholder="-" disabled style="width:248px;font-size:12px;background:#f1f5f9;">`;
    return `
    <tr data-key="${esc(r.key)}"${r.active ? '' : ' style="opacity:.5;"'}>
      <td style="position:sticky;left:0;background:#fff;z-index:1;"><div style="max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.name)}"><span class="pm-name" style="color:#2563eb;cursor:pointer;text-decoration:underline;font-weight:600;">${esc(r.name)}</span>${r.employee_number ? '' : '<span class="text-muted" style="font-size:10px;">(자유)</span>'}</div></td>
      <td style="font-size:12px;"><div style="max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.org || '')}">${esc(r.org || '')}</div></td>
      <td style="font-size:12px;">${esc(r.position || '')}</td>
      <td class="num">${r.projectCount || ''}</td>
      ${r.months.map(v => `<td class="num" style="${cellColor(v)}padding:4px 2px;">${v ? v : '·'}</td>`).join('')}
      <td class="num" style="${cellColor(r.maxMonth)}padding:4px 3px;">${r.maxMonth || '·'}</td>
      <td>${noteCell}</td>
    </tr>`; }).join('') : `<tr><td colspan="18" class="empty">표시할 인력이 없습니다.</td></tr>`;

  const over = rows.filter(r => r.maxMonth > 100).length;
  const participants = rows.filter(r => r.projectCount > 0).length;
  document.getElementById('summary').innerHTML =
    `표시 ${rows.length}명 · 참여 ${participants}명 · <strong style="color:#b91c1c;">과배정(월 최대 &gt;100%) ${over}명</strong>`;

  body.querySelectorAll('tr[data-key]').forEach(tr => {
    tr.querySelector('.pm-name').onclick = () => showDetail(rows.find(r => r.key === tr.dataset.key));
  });
  // 비고 저장 (직원별 users.note) — 전체 필드 보존 위해 기존 직원 객체와 병합
  body.querySelectorAll('.pm-note').forEach(inp => {
    inp.addEventListener('change', async () => {
      const id = Number(inp.dataset.id);
      const emp = employees.find(e => e.id === id);
      if (!emp) return;
      const val = inp.value.trim() || null;
      try {
        await api.put('/api/masters/users/' + id, { ...emp, note: val });
        emp.note = val;
        toast('비고 저장', 'success');
      } catch (e) { toast('비고 저장 실패: ' + e.message, 'error'); }
    });
  });
}

function showDetail(r) {
  if (!r) return;
  const year = sels.year.getValue();
  const monthTh = Array.from({ length: 12 }, (_, i) => `<th class="num">${i + 1}월</th>`).join('');
  const allocTd = r.months.map(v => `<td class="num" style="${cellColor(v)}">${v ? v + '%' : '·'}</td>`).join('');
  const remainTd = r.months.map(v => {
    const rem = Math.round((100 - v) * 10) / 10;
    const c = rem < 0 ? '#dc2626' : (rem < 100 ? '#2563eb' : '#16a34a');
    return `<td class="num" style="color:${c};font-weight:600;">${rem}%</td>`;
  }).join('');
  const projRows = (r.projects || []).map(p =>
    `<tr><td style="white-space:nowrap;">[${esc(p.project_code)}] ${esc(p.project_name)}</td><td style="font-size:11px;color:#64748b;">${esc(p.role || '')}</td>${p.m.map(v => `<td class="num">${v ? v + '%' : '·'}</td>`).join('')}</tr>`
  ).join('') || `<tr><td colspan="14" class="empty">참여 과제가 없습니다.</td></tr>`;
  const back = openModal(`${esc(r.name)} · ${year}년 과제 참여 현황`, `
    <div style="font-size:13px;margin-bottom:8px;">${esc(r.org || '')} ${esc(r.position || '')} · 참여 과제 <strong>${r.projectCount}건</strong> · 월 최대 <strong style="color:${r.maxMonth > 100 ? '#b91c1c' : '#2563eb'};">${r.maxMonth}%</strong></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th style="width:88px;">구분</th>${monthTh}</tr></thead>
      <tbody><tr><td style="font-weight:600;">참여 합계</td>${allocTd}</tr><tr><td style="font-weight:600;">잔여</td>${remainTd}</tr></tbody>
    </table></div>
    <div style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:600;color:#475569;">과제별 참여율</div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th style="min-width:220px;">과제</th><th style="width:80px;">역할</th>${Array.from({ length: 12 }, (_, i) => `<th class="num">${i + 1}</th>`).join('')}</tr></thead>
      <tbody>${projRows}</tbody>
    </table></div>
    <div class="text-muted" style="font-size:12px;margin-top:8px;">※ 잔여 = 100% − 월 참여 합계. 빨강은 100% 초과(과배정)입니다.</div>
  `, () => true, { saveText: '확인' });
  const m = back.querySelector('.modal'); if (m) { m.style.maxWidth = '940px'; m.style.width = '94vw'; }
}

init();
