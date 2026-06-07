// ============================================================
//  SearchableSelect - 검색 가능한 콤보박스
// ============================================================
class SearchableSelect {
  constructor(host, opts) {
    this.host = host;
    this.options = opts.options || [];
    this.value = opts.value ?? '';
    this.placeholder = opts.placeholder || '선택안함';
    this.allowClear = opts.allowClear !== false;
    this.onChange = opts.onChange || (() => {});
    this.render();
  }
  render() {
    this.host.classList.add('ss');
    this.host.innerHTML = `<div class="ss-input" tabindex="0"></div><span class="ss-arrow">▼</span>`;
    this.input = this.host.querySelector('.ss-input');
    this.input.addEventListener('click', () => this.toggle());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); this.open(); }
    });
    this.updateDisplay();
    this._docHandler = (e) => { if (this.dd && !this.host.contains(e.target) && !this.dd.contains(e.target)) this.close(); };
    document.addEventListener('mousedown', this._docHandler);
  }
  destroy() { document.removeEventListener('mousedown', this._docHandler); this.close(); }
  updateDisplay() {
    const label = this.labelOf(this.value);
    this.input.classList.toggle('empty', !label);
    this.input.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = label || this.placeholder;
    this.input.appendChild(span);
    const oldClear = this.host.querySelector('.ss-clear');
    if (oldClear) oldClear.remove();
    if (this.allowClear && this.value !== '' && this.value != null) {
      const clr = document.createElement('span');
      clr.className = 'ss-clear';
      clr.innerHTML = '×';
      clr.title = '지우기';
      clr.onclick = (e) => { e.stopPropagation(); this.select(''); };
      this.host.appendChild(clr);
    }
  }
  labelOf(v) {
    if (v === '' || v == null) return '';
    const o = this.options.find(o => String(o.value) === String(v));
    return o ? o.label : '';
  }
  open() {
    if (this.dd) return;
    this.dd = document.createElement('div');
    this.dd.className = 'ss-dropdown';
    this.dd.innerHTML = `<input class="ss-search" placeholder="검색..."><div class="ss-options"></div>`;
    document.body.appendChild(this.dd);
    this.position();
    this.search = this.dd.querySelector('.ss-search');
    this.list = this.dd.querySelector('.ss-options');
    this.search.addEventListener('input', () => this.filter());
    this.search.addEventListener('keydown', e => this.onKey(e));
    this.filter();
    setTimeout(() => this.search.focus(), 0);
    window.addEventListener('scroll', this._scroll = () => this.position(), true);
  }
  position() {
    const r = this.host.getBoundingClientRect();
    this.dd.style.left = r.left + 'px';
    this.dd.style.top = (r.bottom + 2) + 'px';
    this.dd.style.minWidth = Math.max(220, r.width) + 'px';
  }
  close() {
    if (!this.dd) return;
    this.dd.remove(); this.dd = null;
    if (this._scroll) { window.removeEventListener('scroll', this._scroll, true); this._scroll = null; }
  }
  toggle() { this.dd ? this.close() : this.open(); }
  filter() {
    const kw = (this.search?.value || '').toLowerCase();
    const items = [{ value: '', label: this.placeholder }].concat(this.options);
    const matched = items.filter(o => !kw || (o.label || '').toLowerCase().includes(kw));
    this.list.innerHTML = matched.length ? matched.map(o =>
      `<div class="ss-option ${String(o.value) === String(this.value) ? 'selected' : ''}" data-v="${o.value}">${esc(o.label)}</div>`
    ).join('') : `<div class="ss-empty">결과 없음</div>`;
    this.list.querySelectorAll('.ss-option').forEach(el => {
      el.onclick = () => this.select(el.dataset.v);
      el.onmouseenter = () => { this.list.querySelectorAll('.ss-option').forEach(x => x.classList.remove('active')); el.classList.add('active'); };
    });
  }
  select(v) { this.value = v; this.updateDisplay(); this.close(); this.onChange(v); }
  setValue(v) { this.value = v; this.updateDisplay(); }
  getValue() { return this.value; }
  setOptions(opts) { this.options = opts; if (this.dd) this.filter(); else this.updateDisplay(); }
  onKey(e) {
    const items = Array.from(this.list.querySelectorAll('.ss-option'));
    let i = items.findIndex(el => el.classList.contains('active'));
    if (e.key === 'ArrowDown') { e.preventDefault(); i = Math.min(items.length - 1, i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); i = Math.max(0, i - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[i]) this.select(items[i].dataset.v); return; }
    else if (e.key === 'Escape') { this.close(); return; }
    else return;
    items.forEach(el => el.classList.remove('active'));
    if (items[i]) { items[i].classList.add('active'); items[i].scrollIntoView({ block: 'nearest' }); }
  }
}

// ============================================================
//  SmartTable (colgroup 기반, table-layout:fixed 사용)
//   - 인라인 확장 행 지원 (cfg.renderExpanded)
//   - 정렬 / 컬럼 리사이즈 / 컬럼 이동 / 합계 / 테이블 높이 리사이즈
//   - localStorage 저장
// ============================================================
class SmartTable {
  constructor(host, cfg) {
    this.host = host;
    this.cfg = cfg;
    this.idKey = cfg.idKey || 'id';
    this.data = [];
    this.footerData = null;
    this.selectedId = null;
    this.expandedId = null;
    this.sort = { key: null, dir: 'asc' };
    this.savedHeight = null;
    this.loadSettings();
    this.render();
    if (this.savedHeight) {
      this.scroll.style.maxHeight = this.savedHeight + 'px';
      this.scroll.style.height = this.savedHeight + 'px';
    }
    window.addEventListener('resize', () => this.updateExpandWidth());
  }

  loadSettings() {
    if (!this.cfg.storageKey) return;
    try {
      const obj = JSON.parse(localStorage.getItem(this.cfg.storageKey) || '{}');
      if (obj.order && Array.isArray(obj.order)) {
        const map = new Map(this.cfg.columns.map(c => [c.key, c]));
        const ordered = obj.order.map(k => map.get(k)).filter(Boolean);
        const missing = this.cfg.columns.filter(c => !obj.order.includes(c.key));
        this.cfg.columns = [...ordered, ...missing];
      }
      if (obj.widths) this.cfg.columns.forEach(c => { if (obj.widths[c.key]) c.width = obj.widths[c.key]; });
      if (obj.visible) this.cfg.columns.forEach(c => { if (obj.visible[c.key] === false) c.visible = false; });
      if (obj.sort) this.sort = obj.sort;
      if (obj.height) this.savedHeight = obj.height;
    } catch {}
  }
  _readStored() { try { return JSON.parse(localStorage.getItem(this.cfg.storageKey) || '{}'); } catch { return {}; } }
  saveSettings() {
    if (!this.cfg.storageKey) return;
    const cur = this._readStored();
    const obj = {
      ...cur,
      order: this.cfg.columns.map(c => c.key),
      widths: Object.fromEntries(this.cfg.columns.map(c => [c.key, c.width])),
      visible: Object.fromEntries(this.cfg.columns.map(c => [c.key, c.visible !== false])),
      sort: this.sort
    };
    localStorage.setItem(this.cfg.storageKey, JSON.stringify(obj));
  }
  visibleColumns() { return this.cfg.columns.filter(c => c.visible !== false); }
  openColumnPicker() {
    if (typeof window.openColumnPicker !== 'function') return;
    window.openColumnPicker(this.cfg.columns, (updated) => {
      this.cfg.columns = updated;
      this.saveSettings();
      this.renderColgroup();
      this.renderHead();
      this.renderBody();
      this.renderFoot();
      this.updateTableWidth();
    });
  }
  saveHeight(h) {
    if (!this.cfg.storageKey) return;
    const obj = this._readStored();
    obj.height = h;
    localStorage.setItem(this.cfg.storageKey, JSON.stringify(obj));
  }

  render() {
    this.host.classList.add('st-wrap');
    this.host.innerHTML = `
      <div class="st-scroll">
        <table class="st-table">
          <colgroup></colgroup>
          <thead><tr></tr></thead>
          <tbody></tbody>
          <tfoot></tfoot>
        </table>
      </div>
      <div class="st-vresize" title="드래그하여 높이 조절"></div>`;
    this.scroll = this.host.querySelector('.st-scroll');
    this.table = this.host.querySelector('table');
    this.colgroup = this.host.querySelector('colgroup');
    this.thead = this.host.querySelector('thead tr');
    this.tbody = this.host.querySelector('tbody');
    this.tfoot = this.host.querySelector('tfoot');
    this.vresize = this.host.querySelector('.st-vresize');
    this.bindVResize();
    this.renderColgroup();
    this.renderHead();
    this.updateTableWidth();
  }

  bindVResize() {
    this.vresize.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = this.scroll.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      let raf = null; let lastH = startH;
      const move = (ev) => {
        lastH = Math.max(180, startH + (ev.clientY - startY));
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          this.scroll.style.maxHeight = lastH + 'px';
          this.scroll.style.height = lastH + 'px';
        });
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        this.saveHeight(lastH);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  renderColgroup() {
    this.colgroup.innerHTML = this.visibleColumns().map(c =>
      `<col data-key="${esc(c.key)}" style="width:${c.width || 120}px;">`
    ).join('');
  }

  updateTableWidth() {
    const total = this.visibleColumns().reduce((s, c) => s + (c.width || 120), 0);
    this.table.style.width = total + 'px';
  }

  renderHead() {
    this.thead.innerHTML = this.visibleColumns().map((c) => {
      const align = c.align === 'right' ? 'text-align:right;' : '';
      const sortDir = (this.sort.key === c.key) ? this.sort.dir : '';
      const arrow = sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '⇅';
      const sortHtml = (c.sortable === false) ? '' : `<span class="st-sort ${sortDir ? 'on' : ''}">${arrow}</span>`;
      return `
        <th data-key="${esc(c.key)}" style="${align}" draggable="true">
          <span class="st-th-label">${esc(c.label)}${sortHtml}</span>
          <span class="st-resize" title="크기 조절"></span>
        </th>`;
    }).join('');
    this.bindHeadEvents();
  }

  bindHeadEvents() {
    this.thead.querySelectorAll('th').forEach(th => {
      const key = th.dataset.key;
      const col = this.cfg.columns.find(c => c.key === key);

      th.querySelector('.st-th-label').addEventListener('click', (e) => {
        e.stopPropagation();
        if (col && col.sortable === false) return;
        if (this.sort.key === key) this.sort.dir = this.sort.dir === 'asc' ? 'desc' : 'asc';
        else this.sort = { key, dir: 'asc' };
        this.saveSettings();
        this.renderHead();
        this.renderBody();
      });

      const handle = th.querySelector('.st-resize');
      handle.addEventListener('mousedown', (e) => this.startResize(e, th));
      handle.addEventListener('dragstart', e => { e.preventDefault(); e.stopPropagation(); });

      th.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('st-resize')) { e.preventDefault(); return; }
        th.classList.add('st-th-dragging');
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
      });
      th.addEventListener('dragend', () => th.classList.remove('st-th-dragging'));
      th.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; th.classList.add('st-th-dragover'); });
      th.addEventListener('dragleave', () => th.classList.remove('st-th-dragover'));
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('st-th-dragover');
        const fromKey = e.dataTransfer.getData('text/plain');
        this.reorderColumns(fromKey, key);
      });
    });
  }

  startResize(e, th) {
    // 가이드 라인 방식: 드래그 중에는 라인만 움직이고
    // 마우스 업 시점에 한 번만 폭을 적용 → 테이블 reflow 1회만 발생 (완전히 매끄러움)
    e.preventDefault(); e.stopPropagation();
    const key = th.dataset.key;
    const col = this.cfg.columns.find(c => c.key === key);
    const colEl = this.colgroup.querySelector(`col[data-key="${cssEscape(key)}"]`);
    const startX = e.clientX;
    const startW = (col && col.width) || colEl.offsetWidth || 120;

    const thRect = th.getBoundingClientRect();
    const scrollRect = this.scroll.getBoundingClientRect();
    const leftEdge = thRect.right;

    // 가이드 라인
    const guide = document.createElement('div');
    guide.style.cssText =
      `position:fixed;left:${leftEdge - 1}px;top:${scrollRect.top}px;` +
      `height:${scrollRect.height}px;width:2px;background:#2563eb;` +
      `z-index:99999;pointer-events:none;box-shadow:0 0 6px rgba(37,99,235,0.6);`;
    document.body.appendChild(guide);

    // 폭 표시 뱃지
    const badge = document.createElement('div');
    badge.style.cssText =
      `position:fixed;left:${leftEdge + 6}px;top:${scrollRect.top + 6}px;` +
      `background:#2563eb;color:#fff;padding:3px 8px;border-radius:4px;` +
      `font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;` +
      `z-index:99999;pointer-events:none;white-space:nowrap;`;
    badge.textContent = `${startW}px`;
    document.body.appendChild(badge);

    // 마우스 이벤트 안전 캡처용 오버레이
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;cursor:col-resize;z-index:99998;background:transparent;';
    document.body.appendChild(overlay);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const move = (ev) => {
      const delta = ev.clientX - startX;
      lastW = Math.max(50, startW + delta);
      const newEdge = leftEdge + (lastW - startW);
      guide.style.left = (newEdge - 1) + 'px';
      badge.style.left = (newEdge + 6) + 'px';
      badge.textContent = `${lastW}px`;
    };
    const cleanup = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('keydown', onEsc);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      guide.remove();
      badge.remove();
      overlay.remove();
    };
    const up = () => {
      cleanup();
      // 마우스 업 시점에 한 번만 폭 적용 → 테이블 단 1회 reflow
      if (col) col.width = lastW;
      colEl.style.width = lastW + 'px';
      this.updateTableWidth();
      this.updateExpandWidth();
      this.saveSettings();
    };
    const onEsc = (ev) => { if (ev.key === 'Escape') cleanup(); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('keydown', onEsc);
  }

  reorderColumns(fromKey, toKey) {
    if (!fromKey || fromKey === toKey) return;
    const cols = this.cfg.columns;
    const fromIdx = cols.findIndex(c => c.key === fromKey);
    const toIdx = cols.findIndex(c => c.key === toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = cols.splice(fromIdx, 1);
    cols.splice(toIdx, 0, item);
    this.saveSettings();
    this.renderColgroup();
    this.renderHead();
    this.renderBody();
    this.renderFoot();
    this.updateTableWidth();
  }

  setData(data) {
    this.data = data || [];
    this.renderBody();
    this.renderFoot();
  }
  setFooterData(d) { this.footerData = d; this.renderFoot(); }
  setSelected(id) {
    this.selectedId = id == null ? null : String(id);
    this.tbody.querySelectorAll('tr[data-id]').forEach(t => t.classList.toggle('selected', String(t.dataset.id) === String(id)));
  }
  collapseExpanded() {
    if (this.expandedId == null) return;
    this.expandedId = null;
    this.selectedId = null;
    this.renderBody();
  }

  sortedData() {
    if (!this.sort.key) return this.data;
    const col = this.cfg.columns.find(c => c.key === this.sort.key);
    const sortKey = (col && col.sortKey) || this.sort.key;
    const dir = this.sort.dir === 'asc' ? 1 : -1;
    return [...this.data].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1 * dir;
      if (bv == null) return -1 * dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ko') * dir;
    });
  }

  renderBody() {
    const data = this.sortedData();
    const cols = this.visibleColumns();
    if (!data.length) {
      this.tbody.innerHTML = `<tr><td colspan="${cols.length}"><div class="empty">조건에 맞는 데이터가 없습니다.</div></td></tr>`;
      return;
    }
    const exp = this.expandedId;
    const html = [];
    for (const row of data) {
      const id = row[this.idKey];
      const sel = String(this.selectedId) === String(id) ? ' selected' : '';
      const isExp = String(exp) === String(id);
      const cells = cols.map(c => {
        const align = c.align === 'right' ? ' st-num' : '';
        const inner = c.render ? c.render(row) : esc(row[c.key] == null ? '' : row[c.key]);
        return `<td class="${align}">${inner}</td>`;
      }).join('');
      html.push(`<tr data-id="${esc(id)}" class="${sel}">${cells}</tr>`);
      if (isExp && this.cfg.renderExpanded) {
        html.push(`<tr class="st-expand" data-exp-for="${esc(id)}"><td colspan="${cols.length}"><div class="st-expand-inner">${this.cfg.renderExpanded(row)}</div></td></tr>`);
      }
    }
    this.tbody.innerHTML = html.join('');
    this.bindBodyEvents();
    this.updateExpandWidth();
  }

  bindBodyEvents() {
    this.tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a, button, .star, input, .ss, .no-row-click')) return;
        const id = tr.dataset.id;
        const wasExpanded = String(this.expandedId) === String(id);
        if (wasExpanded) {
          this.expandedId = null; this.selectedId = null;
          this.renderBody();
          if (this.cfg.onRowCollapse) this.cfg.onRowCollapse();
        } else {
          this.expandedId = id; this.selectedId = id;
          this.renderBody();
          const row = this.data.find(r => String(r[this.idKey]) === String(id));
          if (row && this.cfg.onRowSelect) this.cfg.onRowSelect(row);
          // 확장 행이 보이도록 스크롤
          setTimeout(() => {
            const exp = this.tbody.querySelector(`tr.st-expand[data-exp-for="${cssEscape(id)}"]`);
            if (exp) exp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 0);
        }
      });
    });
  }

  updateExpandWidth() {
    const inner = this.tbody?.querySelector('.st-expand-inner');
    if (inner) inner.style.width = Math.max(this.scroll.clientWidth - 2, 320) + 'px';
  }

  renderFoot() {
    if (!this.cfg.footer) { this.tfoot.innerHTML = ''; return; }
    const footer = this.cfg.footer(this.footerData);
    if (!footer) { this.tfoot.innerHTML = ''; return; }
    this.tfoot.innerHTML = `<tr>${this.visibleColumns().map(c => {
      const align = c.align === 'right' ? ' st-num' : '';
      const val = footer[c.key] != null ? footer[c.key] : '';
      return `<td class="${align}">${val}</td>`;
    }).join('')}</tr>`;
  }
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

window.SearchableSelect = SearchableSelect;
window.SmartTable = SmartTable;
