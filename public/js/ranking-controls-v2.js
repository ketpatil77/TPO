(() => {
  if (window.__AIT_RANKING_CONTROLS_V2__) return;
  window.__AIT_RANKING_CONTROLS_V2__ = true;

  const state = { query:'', sort:'rank' };
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  let nativeFetch = null;
  let timer = null;

  function filters() {
    return {
      branch: document.getElementById('rankingBranch')?.value || 'all',
      year: document.getElementById('rankingYear')?.value || 'all'
    };
  }

  function cgpa(row) { return num(row?.cgpa ?? row?.cgpa_overall); }

  function compare(a,b) {
    if (state.sort === 'cgpa') return cgpa(b)-cgpa(a) || num(b.points)-num(a.points) || String(a.name||'').localeCompare(String(b.name||''));
    if (state.sort === 'points') return num(b.points)-num(a.points) || String(a.name||'').localeCompare(String(b.name||''));
    if (state.sort === 'name') return String(a.name||'').localeCompare(String(b.name||'')) || num(b.points)-num(a.points);
    return num(a.rank)-num(b.rank) || String(a.name||'').localeCompare(String(b.name||''));
  }

  function transform(payload) {
    if (!payload?.data?.rows || (!state.query && state.sort === 'rank')) return payload;
    const f = filters();
    let rows = payload.data.rows.filter(row => {
      const branchOk = f.branch === 'all' || String(row.branch||'').toUpperCase() === String(f.branch).toUpperCase();
      const yearOk = f.year === 'all' || String(row.year||'').toLowerCase() === String(f.year).toLowerCase();
      const text = `${row.name||''} ${row.branch||''} ${row.year||''}`.toLowerCase();
      return branchOk && yearOk && (!state.query || text.includes(state.query));
    });
    rows.sort(compare);
    let last = null;
    let rank = 0;
    rows = rows.map((row,index) => {
      const key = state.sort === 'cgpa' ? cgpa(row) : state.sort === 'points' ? num(row.points) : state.sort === 'name' ? String(row.name||'').toLowerCase() : num(row.rank);
      if (last === null || key !== last) rank = index + 1;
      last = key;
      return {...row, rank};
    });
    return {...payload, data:{...payload.data, rows}};
  }

  function installFetchGuard() {
    if (nativeFetch || typeof window.fetch !== 'function') return;
    nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const response = await nativeFetch(input, init);
      if (!String(url).includes('/api/student/rankings-view/fast') || (!state.query && state.sort === 'rank')) return response;
      try {
        const transformed = transform(await response.clone().json());
        return new Response(JSON.stringify(transformed), {status:response.status,statusText:response.statusText,headers:response.headers});
      } catch (_) { return response; }
    };
  }

  function refresh() {
    document.getElementById('rankingRefresh')?.click();
  }

  function ensureToolbar() {
    const list = document.getElementById('rankingStableListV4');
    if (!list || document.getElementById('rankingProToolbar')) return;
    const toolbar = document.createElement('section');
    toolbar.id = 'rankingProToolbar';
    toolbar.className = 'glass-card ranking-pro-toolbar';
    toolbar.setAttribute('aria-label','Leaderboard controls');
    toolbar.innerHTML = '<div class="ranking-pro-toolbar-head"><div class="ranking-pro-toolbar-copy"><span class="eyebrow">Leaderboard controls</span><strong>Find and compare students</strong></div><span class="ranking-pro-count" aria-live="polite"></span></div><div class="ranking-pro-toolbar-grid"><label class="ranking-pro-search"><span class="sr-only">Search students</span><input id="rankingProSearch" type="search" autocomplete="off" placeholder="Search student name, branch or year" aria-label="Search students"></label><label class="ranking-pro-sort"><span>Sort</span><select id="rankingProSort" aria-label="Sort leaderboard"><option value="rank">Rank</option><option value="points">Profile Points</option><option value="cgpa">CGPA</option><option value="name">Name</option></select></label><button type="button" id="rankingProClear" class="btn btn-secondary ranking-pro-clear" hidden>Clear</button></div><p class="ranking-pro-hint">Search and sorting update the visible leaderboard without changing the underlying Profile Points calculation.</p>';
    list.before(toolbar);
    const search = toolbar.querySelector('#rankingProSearch');
    const sort = toolbar.querySelector('#rankingProSort');
    const clear = toolbar.querySelector('#rankingProClear');
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.query = search.value.trim().toLowerCase(); clear.hidden = !state.query; refresh(); }, 220);
    });
    sort.addEventListener('change', () => { state.sort = sort.value || 'rank'; refresh(); });
    clear.addEventListener('click', () => { search.value=''; sort.value='rank'; state.query=''; state.sort='rank'; clear.hidden=true; refresh(); search.focus(); });
  }

  function boot(attempt=0) {
    installFetchGuard();
    ensureToolbar();
    if (!document.getElementById('rankingProToolbar') && attempt < 30) setTimeout(() => boot(attempt+1),180);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), {once:true}); else boot();
})();
