(() => {
  if (window.__AIT_RANKING_PRO_POLISH__) return;
  window.__AIT_RANKING_PRO_POLISH__ = true;

  const HISTORY_KEY = 'ait-ranking-history-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  let toolbar = null;
  let searchTimer = null;
  let lastQuery = '';

  function css() {
    if (document.querySelector('link[data-ranking-pro-polish]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/ranking-pro-polish.css?v=20260908-1';
    link.dataset.rankingProPolish = 'true';
    document.head.appendChild(link);
  }

  function rankingPanel() { return document.getElementById('tab-ranking'); }
  function stableList() { return document.getElementById('rankingStableListV4'); }
  function snapshot() { return window.__AIT_RANKING_FAST_SNAPSHOT__ || null; }

  function ensureToolbar() {
    const panel = rankingPanel();
    const list = stableList();
    if (!panel || !list) return false;
    if (toolbar?.isConnected) return true;
    toolbar = document.getElementById('rankingProToolbar');
    if (!toolbar) {
      toolbar = document.createElement('section');
      toolbar.id = 'rankingProToolbar';
      toolbar.className = 'glass-card ranking-pro-toolbar';
      toolbar.setAttribute('aria-label', 'Leaderboard controls');
      toolbar.innerHTML = `
        <div class="ranking-pro-toolbar-head">
          <div><span class="eyebrow">Leaderboard controls</span><strong>Find and compare students</strong></div>
          <span id="rankingProMatchCount" class="ranking-pro-count" aria-live="polite"></span>
        </div>
        <div class="ranking-pro-toolbar-grid">
          <label class="ranking-pro-search"><span class="sr-only">Search students</span><input id="rankingProSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Search student name, branch or year" aria-label="Search students"></label>
          <label class="ranking-pro-sort"><span>Sort</span><select id="rankingProSort" aria-label="Sort leaderboard"><option value="rank">Rank</option><option value="points">Profile Points</option><option value="cgpa">CGPA</option><option value="name">Name</option></select></label>
          <button type="button" id="rankingProClear" class="btn btn-secondary ranking-pro-clear" hidden>Clear</button>
        </div>
        <p id="rankingProHint" class="ranking-pro-hint">Search works across the selected college, branch, or year. Results stay tied to the existing leaderboard pagination.</p>`;
      list.before(toolbar);
    }
    bindToolbar();
    return true;
  }

  function bindToolbar() {
    if (!toolbar || toolbar.dataset.bound === '1') return;
    toolbar.dataset.bound = '1';
    const search = toolbar.querySelector('#rankingProSearch');
    const sort = toolbar.querySelector('#rankingProSort');
    const clear = toolbar.querySelector('#rankingProClear');
    search?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => applyControls(true), 90);
    });
    sort?.addEventListener('change', () => applyControls(false));
    clear?.addEventListener('click', () => {
      if (search) search.value = '';
      if (sort) sort.value = 'rank';
      applyControls(false);
      search?.focus();
    });
  }

  function rowId(entry) { return entry?.dataset?.studentId || ''; }
  function rowMap() {
    return new Map((snapshot()?.rows || []).map(row => [String(row.student_id), row]));
  }

  function selectedFilters() {
    return {
      branch: document.getElementById('rankingBranch')?.value || 'all',
      year: document.getElementById('rankingYear')?.value || 'all'
    };
  }

  function matches(row, query, filters) {
    if (!row) return false;
    const branchOk = filters.branch === 'all' || String(row.branch || '').toUpperCase() === String(filters.branch).toUpperCase();
    const yearOk = filters.year === 'all' || String(row.year || '').toLowerCase() === String(filters.year).toLowerCase();
    if (!branchOk || !yearOk) return false;
    if (!query) return true;
    const haystack = `${row.name || ''} ${row.branch || ''} ${row.year || ''}`.toLowerCase();
    return haystack.includes(query);
  }

  function cgpaValue(row) {
    if (!row) return 0;
    if (row.cgpa !== undefined && row.cgpa !== null) return num(row.cgpa);
    if (row.cgpa_overall !== undefined && row.cgpa_overall !== null) return num(row.cgpa_overall);
    return 0;
  }

  function sortVisible(entries, sortKey, rows) {
    const copy = [...entries];
    const value = entry => rows.get(String(rowId(entry))) || {};
    copy.sort((a, b) => {
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      const ra = value(a), rb = value(b);
      if (sortKey === 'points') return num(rb.points) - num(ra.points) || String(ra.name || '').localeCompare(String(rb.name || ''));
      if (sortKey === 'cgpa') return cgpaValue(rb) - cgpaValue(ra) || num(rb.points) - num(ra.points);
      if (sortKey === 'name') return String(ra.name || '').localeCompare(String(rb.name || ''));
      return num(ra.rank) - num(rb.rank) || String(ra.name || '').localeCompare(String(rb.name || ''));
    });
    copy.forEach(entry => stableList()?.appendChild(entry));
  }

  function updateCount(entries, query, rows) {
    const count = toolbar?.querySelector('#rankingProMatchCount');
    const clear = toolbar?.querySelector('#rankingProClear');
    if (!count) return;
    const visible = entries.filter(entry => !entry.hidden).length;
    const total = query ? rows.filter(row => matches(row, query, selectedFilters())).length : rows.length;
    count.textContent = query ? `${visible} shown · ${total} match${total === 1 ? '' : 'es'} in selected scope` : `${rows.length} students in selected scope`;
    if (clear) clear.hidden = !query;
  }

  function jumpToMatch(query, rows) {
    if (!query || query === lastQuery) return;
    const filters = selectedFilters();
    const first = rows.find(row => matches(row, query, filters));
    if (!first) return;
    const pageSize = 25;
    const ordered = [...rows].filter(row => matches(row, '', filters)).sort((a,b) => num(a.rank)-num(b.rank) || String(a.name||'').localeCompare(String(b.name||'')));
    const index = ordered.findIndex(row => String(row.student_id) === String(first.student_id));
    if (index < pageSize) return;
    const targetPage = Math.floor(index / pageSize) + 1;
    const currentInfo = document.getElementById('rankingPageInfoV5')?.textContent || '';
    const currentMatch = currentInfo.match(/Page\s+(\d+)\s+of/i);
    const currentPage = currentMatch ? Number(currentMatch[1]) : 1;
    if (targetPage === currentPage) return;
    const buttonId = targetPage > currentPage ? 'rankingNextV5' : 'rankingPrevV5';
    let left = Math.min(20, Math.abs(targetPage - currentPage));
    const step = () => {
      const button = document.getElementById(buttonId);
      if (!button || button.disabled || left <= 0) { applyControls(false); return; }
      left -= 1;
      button.click();
      setTimeout(step, 45);
    };
    step();
  }

  function applyControls(allowJump) {
    if (!toolbar || !stableList()) return;
    const query = String(toolbar.querySelector('#rankingProSearch')?.value || '').trim().toLowerCase();
    const sortKey = toolbar.querySelector('#rankingProSort')?.value || 'rank';
    const map = rowMap();
    const rows = snapshot()?.rows || [];
    const entries = [...stableList().querySelectorAll('.leaderboard-entry')];
    if (!entries.length) { updateCount([], query, rows); return; }
    entries.forEach(entry => {
      const row = map.get(String(rowId(entry)));
      entry.hidden = Boolean(query && !matches(row, query, selectedFilters()));
      entry.classList.toggle('ranking-pro-match', !entry.hidden && Boolean(query));
    });
    sortVisible(entries, sortKey, map);
    updateCount(entries, query, rows);
    if (query) {
      toolbar.querySelector('#rankingProHint').textContent = 'Search is scoped to the selected leaderboard filters. Matching students are highlighted without changing their official rank.';
      if (allowJump) jumpToMatch(query, rows);
    } else {
      toolbar.querySelector('#rankingProHint').textContent = 'Search works across the selected college, branch, or year. Results stay tied to the existing leaderboard pagination.';
    }
    lastQuery = query;
  }

  function recordRankHistory() {
    const current = snapshot()?.current;
    if (!current?.student_id || !current.rank) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { history = []; }
    const next = { rank:num(current.rank), points:num(current.points), at:new Date().toISOString() };
    const recent = history.filter(item => Date.now() - new Date(item.at || 0).getTime() < 30 * 86400000);
    const last = recent[recent.length - 1];
    if (!last || last.rank !== next.rank || last.points !== next.points || Date.now() - new Date(last.at).getTime() > 6 * 3600000) recent.push(next);
    recent.splice(0, Math.max(0, recent.length - 8));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(recent));
    renderRankHistory(recent);
  }

  function renderRankHistory(history) {
    const shell = document.getElementById('rankingCompetitionV1');
    if (!shell) return;
    let panel = document.getElementById('rankingHistoryPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'rankingHistoryPanel';
      panel.className = 'glass-card ranking-history-panel';
      const lower = shell.querySelector('.rank-chaos-lower');
      (lower || shell).before(panel);
    }
    const items = [...history].reverse();
    const current = items[0];
    const previous = items[1];
    const movement = current && previous ? previous.rank - current.rank : 0;
    const movementLabel = movement > 0 ? `↑ ${movement} rank${movement === 1 ? '' : 's'}` : movement < 0 ? `↓ ${Math.abs(movement)} rank${movement === -1 ? '' : 's'}` : 'No recorded movement yet';
    panel.innerHTML = `<div class="ranking-history-head"><div><span class="eyebrow">Rank history</span><h3>Recent position trend</h3><p>Stored locally from your ranking visits. Official ranking remains server-calculated.</p></div><strong class="ranking-history-movement">${esc(movementLabel)}</strong></div><div class="ranking-history-list">${items.map((item,index) => `<div class="ranking-history-item"><span>#${item.rank}</span><div><strong>${fmtPoints(item.points)} pts</strong><small>${index === 0 ? 'Latest' : new Date(item.at).toLocaleDateString([], {day:'numeric',month:'short'})}</small></div></div>`).join('') || '<span class="rank-chaos-muted">Open Ranking to start your local trend history.</span>'}</div>`;
  }

  function fmtPoints(value) { return num(value).toFixed(1).replace(/\.0$/, ''); }

  function applyHeaderPolish() {
    const hero = rankingPanel()?.querySelector('.leaderboard-hero');
    hero?.classList.add('ranking-pro-hero');
  }

  function refresh(attempt = 0) {
    css();
    const ready = ensureToolbar();
    applyHeaderPolish();
    if (ready) {
      recordRankHistory();
      applyControls(false);
    }
    if ((!ready || !snapshot()?.rows?.length) && attempt < 25) setTimeout(() => refresh(attempt + 1), 180);
  }

  function boot() {
    css();
    document.addEventListener('click', event => {
      if (event.target.closest?.('.tabs-nav .tab-btn[aria-controls="tab-ranking"], #rankingRefresh, .leaderboard-scope, #rankingNextV5, #rankingPrevV5')) {
        lastQuery = '';
        setTimeout(() => refresh(), 180);
      }
    });
    document.addEventListener('change', event => {
      if (event.target.matches?.('#rankingBranch,#rankingYear')) {
        lastQuery = '';
        setTimeout(() => refresh(), 120);
      }
    });
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
