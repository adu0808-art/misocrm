/* WYSIWYG HTML Editor — 모달 다이얼로그 (SalesAgent RichEditor 이식) */
// UI 헬퍼 shim (프로젝트 전역 toast 사용, esc는 자체 구현)
window.UI = window.UI || {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  toast: (m, t) => (typeof window.toast === 'function' ? window.toast(m, t) : alert(m)),
};

window.RichEditor = {
  open(opts = {}) {
    return new Promise(resolve => {
      const { title = '내용 편집', html = '', itemName = '', label } = opts;
      const dlg = document.createElement('div');
      dlg.className = 'rich-edit-dlg';
      dlg.innerHTML = this.template({ title, html, itemName, label });
      document.body.appendChild(dlg);

      const area = dlg.querySelector('#re-area');
      const toolbar = dlg.querySelector('#re-toolbar');

      const finish = (val) => { dlg.remove(); resolve(val); };
      const saveRange = () => {
        const sel = window.getSelection();
        if (sel.rangeCount && area.contains(sel.anchorNode)) area.__savedRange = sel.getRangeAt(0).cloneRange();
      };
      const exec = (cmd, arg) => {
        area.focus();
        this._restoreRange(area);
        try { document.execCommand(cmd, false, arg); } catch {}
        saveRange();
        this._updateState(toolbar, area);
      };

      toolbar.querySelectorAll('.re-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          let arg = btn.dataset.arg || null;
          if (btn.dataset.cmd === 'formatBlock' && arg) arg = `<${arg}>`;
          exec(btn.dataset.cmd, arg);
        });
      });

      toolbar.querySelectorAll('select[data-cmd]').forEach(sel => {
        sel.addEventListener('change', () => {
          if (!sel.value) return;
          exec(sel.dataset.cmd, sel.value);
          sel.value = '';
        });
      });

      const colorInput = toolbar.querySelector('input[data-cmd="foreColor"]');
      if (colorInput) colorInput.addEventListener('input', () => exec('foreColor', colorInput.value));

      this._bindPopover(toolbar, dlg, area, '#re-pop-table', '[data-pop="table"]', () => this._renderTablePopover(dlg, area));
      this._bindPopover(toolbar, dlg, area, '#re-pop-image', '[data-pop="image"]', () => this._renderImagePopover(dlg, area));
      this._bindPopover(toolbar, dlg, area, '#re-pop-blocks', '[data-pop="blocks"]', () => this._renderBlocksPopover(dlg, area));

      dlg.addEventListener('click', e => {
        if (e.target.matches('[data-cancel]') || e.target.matches('.rich-edit-bg')) finish(null);
        if (e.target.matches('[data-ok]')) {
          const out = { html: area.innerHTML };
          if (label) out.name = (dlg.querySelector('#re-name')?.value || '').trim();
          finish(out);
        }
      });
      document.addEventListener('keydown', function escHandler(e) {
        if (!dlg.isConnected) { document.removeEventListener('keydown', escHandler); return; }
        if (e.key === 'Escape' && !dlg.querySelector('.re-pop.open')) {
          finish(null);
          document.removeEventListener('keydown', escHandler);
        }
      });

      ['keyup', 'mouseup', 'input'].forEach(ev => area.addEventListener(ev, () => { saveRange(); this._updateState(toolbar, area); }));
      area.addEventListener('blur', saveRange);
      // URL 자동 링크: space/enter 입력 시 커서 앞 URL을 <a>로 변환
      area.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') this._linkifyBeforeCaret(area); });
      setTimeout(() => { area.focus(); this._updateState(toolbar, area); saveRange(); }, 50);
    });
  },

  template({ title, html, itemName, label }) {
    return `
      <div class="rich-edit-bg"></div>
      <div class="rich-edit-card">
        <header><h3>${UI.esc(title)}</h3><button class="close" data-cancel>×</button></header>
        <div class="body">
          ${label ? `
            <div class="field"><label>${UI.esc(label)} *</label>
              <input id="re-name" class="input" value="${UI.esc(itemName)}">
            </div>
            <div class="field"><label>내용</label></div>
          ` : ''}
          <div class="re-toolbar" id="re-toolbar">
            <div class="re-grp">
              <button class="re-btn" data-cmd="formatBlock" data-arg="P"  data-active-block="P">본문</button>
              <button class="re-btn" data-cmd="formatBlock" data-arg="H1" data-active-block="H1"><b>H1</b></button>
              <button class="re-btn" data-cmd="formatBlock" data-arg="H2" data-active-block="H2"><b>H2</b></button>
              <button class="re-btn" data-cmd="formatBlock" data-arg="H3" data-active-block="H3"><b>H3</b></button>
            </div>
            <div class="re-grp">
              <select class="re-sel" data-cmd="fontName">
                <option value="">폰트</option>
                <option value="'Malgun Gothic',sans-serif">맑은 고딕</option>
                <option value="'Noto Sans KR',sans-serif">Noto Sans KR</option>
                <option value="'Nanum Gothic',sans-serif">나눔고딕</option>
                <option value="serif">Serif</option>
                <option value="monospace">Monospace</option>
              </select>
              <select class="re-sel" data-cmd="fontSize">
                <option value="">크기</option>
                <option value="2">작게</option>
                <option value="3">보통</option>
                <option value="4">크게</option>
                <option value="5">더 크게</option>
                <option value="6">매우 크게</option>
                <option value="7">제목급</option>
              </select>
            </div>
            <div class="re-grp">
              <button class="re-btn" data-cmd="bold" data-active="bold"><b>B</b></button>
              <button class="re-btn" data-cmd="italic" data-active="italic"><i>I</i></button>
              <button class="re-btn" data-cmd="underline" data-active="underline"><u>U</u></button>
              <button class="re-btn" data-cmd="strikeThrough" data-active="strikeThrough"><s>S</s></button>
            </div>
            <div class="re-grp">
              <button class="re-btn re-icon" data-cmd="justifyLeft"   data-active="justifyLeft"   title="왼쪽 정렬">
                <span class="ico"><span></span><span></span><span></span><span></span></span>
              </button>
              <button class="re-btn re-icon" data-cmd="justifyCenter" data-active="justifyCenter" title="가운데 정렬">
                <span class="ico c"><span></span><span></span><span></span><span></span></span>
              </button>
              <button class="re-btn re-icon" data-cmd="justifyRight"  data-active="justifyRight"  title="오른쪽 정렬">
                <span class="ico r"><span></span><span></span><span></span><span></span></span>
              </button>
            </div>
            <div class="re-grp">
              <label class="re-color-pick" title="글자색">
                <span class="A">A</span>
                <span class="bar" id="re-color-bar"></span>
                <input type="color" data-cmd="foreColor" value="#1f2937">
              </label>
            </div>
            <div class="re-grp">
              <button class="re-btn" data-cmd="insertUnorderedList" data-active="insertUnorderedList">• 목록</button>
              <button class="re-btn" data-cmd="insertOrderedList"   data-active="insertOrderedList">1. 목록</button>
              <button class="re-btn" data-cmd="formatBlock" data-arg="BLOCKQUOTE" data-active-block="BLOCKQUOTE" title="인용">"</button>
            </div>
            <div class="re-grp">
              <button class="re-btn" data-pop="table">표 삽입</button>
              <button class="re-btn" data-pop="image">이미지</button>
              <button class="re-btn re-prim" data-pop="blocks">+ 블럭</button>
            </div>
            <div class="re-grp">
              <button class="re-btn" data-cmd="undo" title="실행 취소">↶</button>
              <button class="re-btn" data-cmd="redo" title="다시 실행">↷</button>
            </div>
            <div id="re-pop-table"  class="re-pop"></div>
            <div id="re-pop-image"  class="re-pop"></div>
            <div id="re-pop-blocks" class="re-pop wide"></div>
          </div>
          <div id="re-area" class="re-area" contenteditable="true">${html || '<p><br></p>'}</div>
        </div>
        <footer>
          <button class="btn" data-cancel>취소</button>
          <button class="btn btn-primary" data-ok>저장</button>
        </footer>
      </div>
    `;
  },

  _updateState(toolbar, area) {
    if (!toolbar) return;
    toolbar.querySelectorAll('[data-active]').forEach(btn => {
      try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.active)); } catch {}
    });
    const blockTag = this._currentBlock(area);
    toolbar.querySelectorAll('[data-active-block]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.activeBlock === blockTag);
    });
    try {
      const c = document.queryCommandValue('foreColor');
      const bar = toolbar.querySelector('#re-color-bar');
      if (bar && c) bar.style.background = c;
    } catch {}
  },

  _currentBlock(area) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    let node = sel.anchorNode;
    while (node && node !== area && node !== document.body) {
      if (node.nodeType === 1) {
        const tag = node.tagName;
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI'].includes(tag)) return tag;
      }
      node = node.parentNode;
    }
    return 'P';
  },

  // 저장된 선택영역 복원
  _restoreRange(area) {
    const r = area && area.__savedRange;
    if (!r) return;
    try { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch {}
  },

  // 현재(저장된) 커서 위치에 HTML 삽입
  _insertAtCursor(area, html) {
    area.focus();
    this._restoreRange(area);
    try { document.execCommand('insertHTML', false, html); } catch {}
    const sel = window.getSelection();
    if (sel.rangeCount && area.contains(sel.anchorNode)) area.__savedRange = sel.getRangeAt(0).cloneRange();
  },

  // 커서 앞의 URL을 자동으로 <a> 링크로 변환
  _linkifyBeforeCaret(area) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3) return;                       // 텍스트 노드만
    const parentEl = node.parentElement;
    if (parentEl && parentEl.closest && parentEl.closest('a')) return; // 이미 링크 안이면 skip
    const caret = sel.anchorOffset;
    const before = node.textContent.slice(0, caret);
    const m = before.match(/(^|\s)((https?:\/\/|www\.)[^\s]+)$/i);
    if (!m) return;
    const url = m[2];
    const start = caret - url.length;
    const href = /^https?:\/\//i.test(url) ? url : 'http://' + url;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, caret);
    const a = document.createElement('a');
    a.href = href; a.textContent = url; a.target = '_blank'; a.rel = 'noopener';
    range.deleteContents();
    range.insertNode(a);
    // 캐럿을 링크 뒤로 이동(다음 입력이 링크 밖으로)
    const after = document.createRange();
    after.setStartAfter(a); after.collapse(true);
    sel.removeAllRanges(); sel.addRange(after);
    area.__savedRange = after.cloneRange();
  },

  _bindPopover(toolbar, dlg, area, popSel, btnSel, render) {
    const btn = toolbar.querySelector(btnSel);
    const pop = dlg.querySelector(popSel);
    if (!btn || !pop) return;
    btn.addEventListener('click', e => {
      e.preventDefault();
      const wasOpen = pop.classList.contains('open');
      dlg.querySelectorAll('.re-pop.open').forEach(p => p.classList.remove('open'));
      if (wasOpen) return;
      pop.style.left = '-9999px'; pop.style.top = '-9999px';
      pop.classList.add('open');
      render();
      const r = btn.getBoundingClientRect();
      const popW = pop.offsetWidth, popH = pop.offsetHeight;
      let left = r.left, top = r.bottom + 6;
      const margin = 8;
      if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
      if (left < margin) left = margin;
      if (top + popH > window.innerHeight - margin) {
        const aboveTop = r.top - 6 - popH;
        top = (aboveTop > margin) ? aboveTop : Math.max(margin, window.innerHeight - popH - margin);
      }
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    });
    document.addEventListener('mousedown', function onDoc(ev) {
      if (!dlg.isConnected) { document.removeEventListener('mousedown', onDoc); return; }
      if (!pop.classList.contains('open')) return;
      if (pop.contains(ev.target) || btn.contains(ev.target)) return;
      pop.classList.remove('open');
    });
  },

  _renderTablePopover(dlg, area) {
    const pop = dlg.querySelector('#re-pop-table');
    const ROWS = 8, COLS = 8;
    let cells = '';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells += `<div class="re-tc" data-r="${r + 1}" data-c="${c + 1}"></div>`;
    pop.innerHTML = `
      <div class="re-table-grid" style="grid-template-columns:repeat(${COLS},22px)">${cells}</div>
      <div class="re-table-label" id="re-table-label">크기를 선택하세요</div>`;
    const label = pop.querySelector('#re-table-label');
    pop.querySelectorAll('.re-tc').forEach(cell => {
      cell.addEventListener('mouseenter', () => {
        const r = +cell.dataset.r, c = +cell.dataset.c;
        pop.querySelectorAll('.re-tc').forEach(x => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c));
        label.textContent = `${r} × ${c}`;
      });
      cell.addEventListener('click', () => {
        const r = +cell.dataset.r, c = +cell.dataset.c;
        let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0">';
        for (let i = 0; i < r; i++) {
          html += '<tr>';
          for (let j = 0; j < c; j++) {
            const tag = i === 0 ? 'th' : 'td';
            const bg = i === 0 ? 'background:#f3f4f6;' : '';
            html += `<${tag} style="border:1px solid #d1d5db;padding:6px 10px;${bg}">&nbsp;</${tag}>`;
          }
          html += '</tr>';
        }
        html += '</table><p><br></p>';
        RichEditor._insertAtCursor(area, html);
        pop.classList.remove('open');
      });
    });
  },

  _renderImagePopover(dlg, area) {
    const pop = dlg.querySelector('#re-pop-image');
    pop.innerHTML = `
      <div class="re-image-pop">
        <div class="re-pop-title">이미지 삽입</div>
        <div class="re-field"><label>파일 업로드</label>
          <label class="re-drop"><input type="file" id="re-img-file" accept="image/*" style="display:none"><span>파일 선택</span></label>
        </div>
        <div class="re-or">또는</div>
        <div class="re-field"><label>이미지 URL</label><input id="re-img-url" class="input" placeholder="https://..."></div>
        <div class="re-field"><input id="re-img-alt" class="input" placeholder="설명 텍스트 (선택)"></div>
        <button class="re-insert-btn" id="re-img-insert">삽입</button>
      </div>`;
    const fileInput = pop.querySelector('#re-img-file');
    const urlInput = pop.querySelector('#re-img-url');
    const altInput = pop.querySelector('#re-img-alt');
    pop.querySelector('.re-drop').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { urlInput.value = reader.result; };
      reader.readAsDataURL(f);
    });
    pop.querySelector('#re-img-insert').addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) { UI.toast('URL 또는 파일이 필요합니다', 'error'); return; }
      const alt = altInput.value.trim();
      const html = `<img src="${UI.esc(url)}" alt="${UI.esc(alt)}" style="max-width:100%;height:auto;border-radius:4px">`;
      RichEditor._insertAtCursor(area, html);
      pop.classList.remove('open');
    });
  },

  _renderBlocksPopover(dlg, area) {
    const pop = dlg.querySelector('#re-pop-blocks');
    const blocks = this._smartBlocks();
    pop.innerHTML = `
      <div class="re-pop-title">스마트 블럭 — 클릭해 삽입</div>
      <div class="re-blocks-grid">
        ${blocks.map((b, i) => `
          <div class="re-block-card ${i === 0 ? 'active' : ''}" data-i="${i}">
            <div class="re-block-icon">${b.icon}</div>
            <div class="re-block-info">
              <div class="re-block-name">${UI.esc(b.name)}</div>
              <div class="re-block-desc">${UI.esc(b.desc)}</div>
            </div>
          </div>`).join('')}
      </div>`;
    pop.querySelectorAll('.re-block-card').forEach(card => {
      card.addEventListener('click', () => {
        const i = parseInt(card.dataset.i);
        RichEditor._insertAtCursor(area, blocks[i].html);
        pop.classList.remove('open');
      });
    });
  },

  _smartBlocks() {
    return [
      { icon: '📋', name: '스테이트먼트', desc: 'MISSION/VISION 등 강조 배너',
        html: '<div class="callout"><span class="callout-tag">MISSION</span><strong>핵심 메시지를 입력하세요.</strong> <span style="color:#fbbf24;font-weight:bold">강조 텍스트</span> 부분은 색상이 다르게 표시됩니다.</div><p><br></p>' },
      { icon: '🎨', name: '히어로 배너', desc: '인사말·소개 그라디언트 헤더',
        html: '<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:32px 28px;border-radius:12px;text-align:center;margin:12px 0"><h1 style="margin:0 0 8px;color:#fff;font-size:26px">제목을 입력하세요</h1><p style="margin:0;opacity:.9">소개 문구를 입력하세요</p></div><p><br></p>' },
      { icon: '🧩', name: '피처 그리드', desc: '아이콘 + 제목 + 설명 (2~4열)',
        html: '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:12px 0">' + ['⭐', '🚀', '💡'].map(ic => `<div style="padding:18px 14px;border:1px solid #e5e7eb;border-radius:10px;text-align:center"><div style="font-size:32px">${ic}</div><h3 style="margin:8px 0 4px;font-size:15px">제목</h3><p style="margin:0;color:#6b7280;font-size:12px">간단한 설명</p></div>`).join('') + '</div><p><br></p>' },
      { icon: '🟪', name: '피처 카드', desc: '단일 강조 카드 (아이콘+제목+설명)',
        html: '<div style="display:flex;gap:14px;align-items:flex-start;padding:18px;border:1px solid #c7d2fe;border-radius:10px;background:#eef2ff;margin:12px 0"><div style="font-size:36px">🎯</div><div><h3 style="margin:0 0 6px">핵심 기능</h3><p style="margin:0;color:#4b5563">상세 설명을 입력하세요.</p></div></div><p><br></p>' },
      { icon: '💡', name: '정보 콜아웃', desc: '강조하고 싶은 정보',
        html: '<div style="border-left:4px solid #2563eb;background:#eff6ff;padding:12px 16px;margin:12px 0;border-radius:0 6px 6px 0"><b style="color:#1e40af">💡 알아두세요</b><p style="margin:6px 0 0;color:#1e3a8a">정보성 메시지를 입력하세요.</p></div><p><br></p>' },
      { icon: '⚠️', name: '주의 콜아웃', desc: '주의·경고 박스',
        html: '<div style="border-left:4px solid #f59e0b;background:#fffbeb;padding:12px 16px;margin:12px 0;border-radius:0 6px 6px 0"><b style="color:#92400e">⚠️ 주의</b><p style="margin:6px 0 0;color:#78350f">주의가 필요한 내용을 입력하세요.</p></div><p><br></p>' },
      { icon: '✨', name: '팁 콜아웃', desc: '팁·노하우 박스',
        html: '<div style="border-left:4px solid #10b981;background:#ecfdf5;padding:12px 16px;margin:12px 0;border-radius:0 6px 6px 0"><b style="color:#065f46">✨ 팁</b><p style="margin:6px 0 0;color:#064e3b">유용한 팁을 입력하세요.</p></div><p><br></p>' },
      { icon: '📌', name: 'TL;DR 요약', desc: '글 시작에 한 줄 요약',
        html: '<div style="background:#1e293b;color:#fff;padding:14px 18px;border-radius:8px;margin:12px 0;display:flex;align-items:center;gap:10px"><span style="background:#fbbf24;color:#1e293b;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700">TL;DR</span><span>한 줄 요약을 입력하세요.</span></div><p><br></p>' },
      { icon: '⚖️', name: '2단 비교', desc: 'Before/After·장단점',
        html: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:12px 0"><div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;border-radius:8px"><h4 style="margin:0 0 6px;color:#991b1b">Before</h4><p style="margin:0;color:#7f1d1d">개선 전 상태</p></div><div style="padding:16px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px"><h4 style="margin:0 0 6px;color:#065f46">After</h4><p style="margin:0;color:#064e3b">개선 후 상태</p></div></div><p><br></p>' },
      { icon: '✅', name: '체크리스트', desc: '체크박스 항목 묶음',
        html: '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin:12px 0">' + ['항목 1', '항목 2', '항목 3'].map(t => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><input type="checkbox" style="width:16px;height:16px"> <span>${t}</span></div>`).join('') + '</div><p><br></p>' },
      { icon: '"', name: '인용 + 출처', desc: '강조 인용문과 출처',
        html: '<blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:12px 0;color:#374151;font-style:italic">"여기에 인용문을 입력하세요."<footer style="margin-top:6px;color:#6b7280;font-style:normal;font-size:13px">— 출처</footer></blockquote><p><br></p>' },
      { icon: '🖼️', name: '이미지 갤러리', desc: '3장 그리드 — 클릭해 업로드',
        html: '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0">' + [1, 2, 3].map(() => '<div style="aspect-ratio:4/3;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px">이미지</div>').join('') + '</div><p><br></p>' },
      { icon: '🔘', name: 'CTA 버튼', desc: '클릭 유도 버튼',
        html: '<div style="text-align:center;margin:16px 0"><a href="#" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-weight:600;box-shadow:0 4px 12px rgba(99,102,241,.3)">지금 시작하기 →</a></div><p><br></p>' },
    ];
  },
};
