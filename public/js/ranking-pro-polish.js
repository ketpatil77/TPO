(() => {
  if (window.__AIT_RANKING_PRO_POLISH__) return;
  window.__AIT_RANKING_PRO_POLISH__ = true;

  const HISTORY_KEY = 'ait-ranking-history-v1';
  const state = { query: '', sort: 'rank' };
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch]));

  let nativeFetch = null;
  let nativeXHR = null;
  let timer = null;
  let latestPayload = null;
  let renderQueued = false;
  let rendering = false;

  function css() {
    if (document.querySelector('link[data-ranking-pro-polish]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/css/ranking-pro-polish.css?v=20260908-4';
    l.dataset.rankingProPolish = 'true';
    document.head.appendChild(l);
  }

  function filters() {
    return {
      branch: document.getElementById('rankingBranch')?.value || 'all',
      year: document.getElementById('rankingYear')?.value || 'all'
    };
  }

  function cgpa(r) { return num(r?.cgpa ?? r?.cgpa_overall ?? r?.overall_cgpa); }
  function points(r) { return num(r?.points ?? r?.profile_points ?? r?.profilePoints); }
  function name(r) { return String(r?.name ?? r?.student_name ?? r?.studentName ?? '').trim(); }
  function branch(r) { return String(r?.branch ?? r?.department ?? '').trim(); }
  function year(r) { return String(r?.year ?? r?.academic_year ?? r?.academicYear ?? '').trim(); }
  function originalRank(r) { return num(r?.rank ?? r?.position); }

  function compare(a, b) {
    if (state.sort === 'name') {
      return name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true }) || points(b) - points(a) || originalRank(a) - originalRank(b);
    }
    if (state.sort === 'cgpa') {
      return cgpa(b) - cgpa(a) || points(b) - points(a) || name(a).localeCompare(name(b), undefined, { sensitivity: 'base' });
    }
    if (state.sort === 'points') {
      return points(b) - points(a) || name(a).localeCompare(name(b), undefined, { sensitivity: 'base' }) || originalRank(a) - originalRank(b);
    }
    return originalRank(a) - originalRank(b) || name(a).localeCompare(name(b), undefined, { sensitivity: 'base' });
  }

  function transform(payload) {
    if (!payload?.data?.rows) return null;
    const f = filters();
    const q = state.query.trim().toLowerCase();
    let rows = payload.data.rows.filter(r => {
      const b = f.branch === 'all' || branch(r).toLowerCase() === String(f.branch).toLowerCase();
      const y = f.year === 'all' || year(r).toLowerCase() === String(f.year).toLowerCase();
      const text = `${name(r)} ${branch(r)} ${year(r)}`.toLowerCase();
      return b && y && (!q || text.includes(q));
    });

    rows.sort(compare);
    rows = rows.map((r, i) => {
      const rank = i + 1;
      return { ...r, rank };
    });
    return rows;
  }

  function rememberPayload(payload) {
    if (!payload?.data?.rows || !Array.isArray(payload.data.rows)) return;
    latestPayload = payload;
    window.__AIT_RANKING_FAST_SNAPSHOT__ = payload.data;
    queueRender();
  }

  function installFetchGuard() {
    if (nativeFetch || typeof window.fetch !== 'function') return;
    nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const response = await nativeFetch(input, init);
      if (String(url).includes('/api/student/rankings-view/fast')) {
        try {
          const payload = await response.clone().json();
          rememberPayload(payload);
          if (state.query || state.sort !== 'rank') {
            return new Response(JSON.stringify({ ...payload, data: { ...payload.data, rows: transform(payload) } }), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        } catch (_) {}
      }
      return response;
    };
  }

  function installXHRGuard() {
    if (nativeXHR || !window.XMLHttpRequest) return;
    nativeXHR = window.XMLHttpRequest.prototype.open;
    const send = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function(method, url) {
      this.__aitRankingUrl = String(url || '');
      return nativeXHR.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function() {
      if (this.__aitRankingUrl?.includes('/api/student/rankings-view/fast')) {
        this.addEventListener('load', function() {
          try { rememberPayload(JSON.parse(this.responseText)); } catch (_) {}
        });
      }
      return send.apply(this, arguments);
    };
  }

  function getList() {
    return document.getElementById('rankingStableListV4');
  }

  function getNativeRows() {
    const list = getList();
    if (!list) return [];
    return Array.from(list.children).filter(el => !el.matches('#rankingProToolbar') && el.id !== 'rankingProToolbar' && el.id !== 'rankingProResults');
  }

  function rowIdentity(row) {
    return String(row?.student_id ?? row?.id ?? row?.user_id ?? name(row)).trim().toLowerCase();
  }

  function elementIdentity(el) {
    return String(el?.dataset?.studentId ?? el?.dataset?.id ?? el?.dataset?.userId ?? '').trim().toLowerCase();
  }

  function findNativeElement(rows, row, used) {
    const id = rowIdentity(row);
    let el = rows.find(x => !used.has(x) && elementIdentity(x) && elementIdentity(x) === id);
    if (el) return el;
    const n = name(row).toLowerCase();
    if (!n) return null;
    return rows.find(x => !used.has(x) && String(x.textContent || '').toLowerCase().includes(n)) || null;
  }

  function updateRank(el, rank) {
    const nodes = el.querySelectorAll('[data-rank], .rank-badge, .rank-number, .ranking-rank, .rank');
    nodes.forEach(node => {
      node.textContent = String(rank);
      node.dataset.rank = String(rank);
    });
    if (!nodes.length) {
      const first = el.querySelector('td,th');
      if (first && /^\s*#?\d+\s*$/.test(first.textContent || '')) first.textContent = `#${rank}`;
    }
  }

  function renderNativeRows(rows) {
    const list = getList();
    if (!list) return false;
    const nativeRows = getNativeRows();
    if (!nativeRows.length) return false;

    const used = new Set();
    const ordered = [];
    rows.forEach(row => {
      const el = findNativeElement(nativeRows, row, used);
      if (el) {
        used.add(el);
        updateRank(el, row.rank);
        ordered.push(el);
      }
    });

    if (!ordered.length) return false;

    rendering = true;
    try {
      nativeRows.forEach(el => { if (!used.has(el)) el.remove(); });
      ordered.forEach(el => list.appendChild(el));
    } finally {
      rendering = false;
    }
    return true;
  }

  function renderFallback(rows) {
    const list = getList();
    if (!list) return;
    let box = document.getElementById('rankingProResults');
    if (!box) {
      box = document.createElement('div');
      box.id = 'rankingProResults';
      box.className = 'ranking-pro-results';
      list.appendChild(box);
    }
    box.innerHTML = rows.length ? rows.map(r => `
      <article class="ranking-pro-result" data-student-id="${esc(r.student_id ?? r.id ?? r.user_id ?? '')}">
        <span class="rank-badge">${r.rank}</span>
        <div class="ranking-pro-result-main">
          <strong>${esc(name(r) || 'Unnamed student')}</strong>
          <span>${esc(branch(r))}${year(r) ? ` • ${esc(year(r))}` : ''}</span>
        </div>
        <div class="ranking-pro-result-stats">
          <span>CGPA <b>${cgpa(r).toFixed(2)}</b></span>
          <span>Points <b>${points(r).toFixed(1).replace(/\.0$/, '')}</b></span>
        </div>
      </article>`).join('') : '<div class="ranking-pro-empty">No students match the current filters.</div>';
  }

  function render() {
    renderQueued = false;
    if (!latestPayload?.data?.rows || !getList() || rendering) return;
    const rows = transform(latestPayload);
    if (!rows) return;

    const nativeRendered = renderNativeRows(rows);
    if (!nativeRendered) renderFallback(rows);

    const count = document.querySelector('#rankingProToolbar .ranking-pro-count');
    if (count) count.textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  function ensureToolbar() {
    const list = getList();
    if (!list || document.getElementById('rankingProToolbar')) return;

    const t = document.createElement('section');
    t.id = 'rankingProToolbar';
    t.className = 'glass-card ranking-pro-toolbar';
    t.setAttribute('aria-label', 'Leaderboard controls');
    t.innerHTML = `
      <div class="ranking-pro-toolbar-head">
        <div class="ranking-pro-toolbar-copy"><span class="eyebrow">Leaderboard controls</span><strong>Find and compare students</strong></div>
        <span class="ranking-pro-count" aria-live="polite"></span>
      </div>
      <div class="ranking-pro-toolbar-grid">
        <label class="ranking-pro-search"><span class="sr-only">Search students</span><input id="rankingProSearch" type="search" autocomplete="off" placeholder="Search student name, branch or year" aria-label="Search students"></label>
        <label class="ranking-pro-sort"><span>Sort</span><select id="rankingProSort" aria-label="Sort leaderboard"><option value="rank">Rank</option><option value="points">Profile Points</option><option value="cgpa">CGPA</option><option value="name">Name</option></select></label>
        <button type="button" id="rankingProClear" class="btn btn-secondary ranking-pro-clear" hidden>Clear</button>
      </div>
      <p class="ranking-pro-hint">Search and sorting update the visible leaderboard without changing the underlying Profile Points calculation.</p>`;

    list.before(t);
    const s = t.querySelector('#rankingProSearch');
    const o = t.querySelector('#rankingProSort');
    const c = t.querySelector('#rankingProClear');

    s.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.query = s.value.trim().toLowerCase();
        c.hidden = !state.query && state.sort === 'rank';
        queueRender();
      }, 20);
    });

    o.addEventListener('change', () => {
      state.sort = o.value || 'rank';
      c.hidden = !state.query && state.sort === 'rank';
      queueRender();
    });

    c.addEventListener('click', () => {
      s.value = '';
      o.value = 'rank';
      state.query = '';
      state.sort = 'rank';
      c.hidden = true;
      queueRender();
      s.focus();
    });
  }

  function history() {
    const current = window.__AIT_RANKING_FAST_SNAPSHOT__?.current;
    if (!current?.student_id || !current.rank) return;
    let items = [];
    try { items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { items = []; }
    const next = { rank: num(current.rank), points: points(current), at: new Date().toISOString() };
    const recent = items.filter(i => Date.now() - new Date(i.at || 0).getTime() < 30 * 86400000);
    const last = recent[recent.length - 1];
    if (!last || last.rank !== next.rank || last.points !== next.points || Date.now() - new Date(last.at).getTime() > 6 * 3600000) recent.push(next);
    recent.splice(0, Math.max(0, recent.length - 8));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(recent));
    renderHistory(recent);
  }

  function renderHistory(items) {
    const shell = document.getElementById('rankingCompetitionV1');
    if (!shell) return;
    let p = document.getElementById('rankingHistoryPanel');
    if (!p) {
      p = document.createElement('section');
      p.id = 'rankingHistoryPanel';
      p.className = 'glass-card ranking-history-panel';
      (shell.querySelector('.rank-chaos-lower') || shell).before(p);
    }
    const list = [...items].reverse(), cur = list[0], prev = list[1];
    const d = cur && prev ? prev.rank - cur.rank : 0;
    const label = d > 0 ? `↑ ${d} rank${d === 1 ? '' : 's'}` : d < 0 ? `↓ ${Math.abs(d)} rank${d === -1 ? '' : 's'}` : 'No recorded movement yet';
    p.innerHTML = `<div class="ranking-history-head"><div><span class="eyebrow">Rank history</span><h3>Recent position trend</h3><p>Stored locally from your ranking visits. Official ranking remains server-calculated.</p></div><strong class="ranking-history-movement">${esc(label)}</strong></div><div class="ranking-history-list">${list.map((i,n)=>`<div class="ranking-history-item"><span>#${i.rank}</span><div><strong>${points(i).toFixed(1).replace(/\.0$/,'')} pts</strong><small>${n===0?'Latest':new Date(i.at).toLocaleDateString([], {day:'numeric',month:'short'})}</small></div></div>`).join('') || '<span class="rank-chaos-muted">No recorded movement yet.</span>'}</div>`;
  }

  function boot(attempt = 0) {
    css();
    installFetchGuard();
    installXHRGuard();
    ensureToolbar();
    if (!latestPayload?.data?.rows && window.__AIT_RANKING_FAST_SNAPSHOT__?.rows) latestPayload = { data: window.__AIT_RANKING_FAST_SNAPSHOT__ };
    document.addEventListener('ait-ranking-snapshot', (event) => {
      rememberPayload({ data: event.detail || window.__AIT_RANKING_FAST_SNAPSHOT__ });
    });
    queueRender();
    history();
    if (!document.getElementById('rankingProToolbar') && attempt < 40) setTimeout(() => boot(attempt + 1), 180);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  else boot();
})();
