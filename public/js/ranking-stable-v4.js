(() => {
  if (window.__AIT_RANKING_STABLE_V5__) return;
  window.__AIT_RANKING_STABLE_V5__ = true;

  const PAGE_SIZE = 25;
  const token = () => localStorage.getItem('tpo_token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(1).replace(/\.0$/, '');
  let snapshot = null;
  let page = 1;
  let selectedScope = 'college';
  let myBranch = '';
  let myYear = '';
  let detailsCache = new Map();
  let loadingFast = null;

  function ensureCss() {
    let link = document.querySelector('link[data-ranking-stable-v4]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.rankingStableV4 = 'true';
      document.head.appendChild(link);
    }
    link.href = '/css/ranking-stable-v4.css?v=20260904-v5';
  }

  function movement(c = {}) {
    const n = Number(c.movement) || 0;
    if (n > 0) return { text:`↑${n}`, key:'up', label:`Moved up ${n} rank${n === 1 ? '' : 's'}` };
    if (n < 0) return { text:`↓${Math.abs(n)}`, key:'down', label:`Moved down ${Math.abs(n)} rank${Math.abs(n) === 1 ? '' : 's'}` };
    return { text:'—', key:'flat', label:'Rank unchanged' };
  }

  function movePill(c = {}) {
    const m = movement(c);
    return `<span class="ranking-v5-move ${m.key}" title="${esc(m.label)}" aria-label="${esc(m.label)}">${m.text}</span>`;
  }

  function momentum(c = {}) {
    const key = String(c.momentum?.key || 'stable').toLowerCase();
    const map = { hot:['🔥','Hot'], rising:['⚡','Rising'], stable:['🟢','Stable'], slipping:['🔻','Slipping'] };
    const [icon,label] = map[key] || map.stable;
    return `<span class="ranking-v5-momentum ${key}">${icon} ${esc(label)}</span>`;
  }

  function duration(seconds) {
    let s = Math.max(0, Math.floor(Number(seconds) || 0));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function initials(name) {
    const parts = String(name || 'Student').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length-1][0]}` : (parts[0] || 'ST').slice(0,2)).toUpperCase();
  }

  function avatar(row, eager = false) {
    return `<span class="leaderboard-avatar" aria-hidden="true"><span class="leaderboard-avatar-fallback">${esc(initials(row.name))}</span>${row.avatar_url ? `<img src="${esc(row.avatar_url)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` : ''}</span>`;
  }

  function ensureStableList() {
    const original = document.getElementById('rankingList');
    if (!original) return null;
    let stable = document.getElementById('rankingStableListV4');
    if (!stable) {
      stable = document.createElement('div');
      stable.id = 'rankingStableListV4';
      stable.className = 'ranking-stable-list-v5';
      original.before(stable);
    }
    original.hidden = true;
    original.setAttribute('aria-hidden','true');
    return stable;
  }

  function ensurePager() {
    const pager = document.getElementById('rankingPager');
    if (!pager) return null;
    pager.hidden = false;
    pager.classList.add('ranking-v5-pager');
    pager.innerHTML = `
      <button type="button" class="btn btn-secondary" id="rankingPrevV5">Previous</button>
      <small id="rankingPageInfoV5" aria-live="polite"></small>
      <button type="button" class="btn btn-secondary" id="rankingNextV5">Next</button>`;
    return pager;
  }

  function rankRows(rows) {
    const sorted = [...rows].sort((a,b) => Number(b.points||0)-Number(a.points||0) || String(a.name||'').localeCompare(String(b.name||'')));
    let lastScore = null, lastRank = 0;
    return sorted.map((row,index) => {
      if (lastScore === null || Number(row.points) !== lastScore) lastRank = index + 1;
      lastScore = Number(row.points);
      return {...row, rank:lastRank};
    });
  }

  function filters() {
    return {
      branch: document.getElementById('rankingBranch')?.value || 'all',
      year: document.getElementById('rankingYear')?.value || 'all'
    };
  }

  function filteredRows() {
    if (!snapshot) return [];
    const {branch,year} = filters();
    const rows = snapshot.rows.filter(row =>
      (branch === 'all' || String(row.branch||'').toUpperCase() === String(branch).toUpperCase()) &&
      (year === 'all' || String(row.year||'').toLowerCase() === String(year).toLowerCase())
    );
    return rankRows(rows);
  }

  function currentIn(rows) {
    return rows.find(row => row.is_me || row.student_id === snapshot?.current?.student_id) || null;
  }

  function rowHtml(row) {
    const c = row.competition || {};
    const scopeHint = selectedScope === 'college' ? '' : '<span class="ranking-v5-scope-hint">college movement</span>';
    return `<article class="leaderboard-entry ranking-v5-row ${row.is_me ? 'is-me':''}" data-student-id="${esc(row.student_id)}">
      <div class="leaderboard-entry-main">
        <div class="leaderboard-rankno ranking-v5-rank"><span>#${row.rank}</span>${movePill(c)}</div>
        <div class="leaderboard-student">${avatar(row)}<div class="leaderboard-student-copy">
          <strong>${esc(row.name)}${row.is_me ? ' · You':''}</strong>
          <small>${esc(row.branch || '—')} · ${esc(row.year || '—')}</small>
          <div class="ranking-v5-state">${momentum(c)}${c.hold_seconds ? `<span>Holding ${duration(c.hold_seconds)}</span>`:''}${scopeHint}</div>
        </div></div>
        <div class="leaderboard-cell branch">${esc(row.branch || '—')}</div>
        <div class="leaderboard-cell year">${esc(row.year || '—')}</div>
        <div class="leaderboard-points-cell"><strong>${fmt(row.points)} pts</strong></div>
      </div>
      <details class="leaderboard-entry-details ranking-v5-breakdown" data-student-id="${esc(row.student_id)}">
        <summary>Score breakdown</summary>
        <div class="ranking-v5-breakdown-body"><span>Open to load this student's verified score details.</span></div>
      </details>
    </article>`;
  }

  function podiumCard(row, place) {
    if (!row) return '<div></div>';
    const klass = place === 1 ? 'first' : place === 2 ? 'second' : 'third';
    const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';
    return `<article class="glass-card leaderboard-podium-card ${klass} ${row.is_me ? 'is-me':''}">
      <span class="leaderboard-medal">${medal}</span>${avatar(row,true)}
      <h3>${esc(row.name)}${row.is_me ? ' · You':''}</h3><p>${esc(row.branch||'—')} · ${esc(row.year||'—')}</p>
      <span class="leaderboard-podium-points">${fmt(row.points)} pts</span></article>`;
  }

  function renderPodium(rows) {
    const target = document.getElementById('rankingPodium');
    if (!target) return;
    const top = rows.slice(0,3);
    const order = top.length >= 3 ? [[top[1],2],[top[0],1],[top[2],3]] : top.map((row,i)=>[row,i+1]);
    target.innerHTML = order.map(([row,place])=>podiumCard(row,place)).join('');
  }

  function render() {
    const stable = ensureStableList();
    if (!stable || !snapshot) return;
    const rows = filteredRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(Math.max(1,page),pages);
    const start = (page-1)*PAGE_SIZE;
    const visible = rows.slice(start,start+PAGE_SIZE);
    const current = currentIn(rows);

    stable.innerHTML = visible.length ? visible.map(rowHtml).join('') : '<div class="leaderboard-empty">No students in this group.</div>';
    renderPodium(rows);

    const count = document.getElementById('rankingCount');
    if (count) count.textContent = `${rows.length} students`;

    const summary = document.getElementById('rankingMySummary');
    if (summary) summary.innerHTML = current
      ? `<span>Your rank</span><strong>#${current.rank} ${movePill(current.competition||{})}</strong><small>${fmt(current.points)} points · ${rows.length} students</small>`
      : '<span>Your rank</span><strong>—</strong><small>Outside selected group</small>';

    const pager = ensurePager();
    if (pager) {
      const prev = document.getElementById('rankingPrevV5');
      const next = document.getElementById('rankingNextV5');
      const info = document.getElementById('rankingPageInfoV5');
      if (prev) prev.disabled = page <= 1;
      if (next) next.disabled = page >= pages;
      if (info) info.textContent = rows.length ? `Page ${page} of ${pages} · Showing ${start+1}–${Math.min(start+PAGE_SIZE,rows.length)} of ${rows.length}` : 'No students';
    }
    setScopeActive();
  }

  function setScopeActive() {
    const {branch,year} = filters();
    let scope = 'custom';
    if (branch === 'all' && year === 'all') scope = 'college';
    else if (myBranch && branch === myBranch && year === 'all') scope = 'branch';
    else if (myYear && branch === 'all' && year === myYear) scope = 'year';
    selectedScope = scope;
    document.querySelectorAll('#tab-ranking .leaderboard-scope').forEach(btn => btn.classList.toggle('active',btn.dataset.scope===scope));
  }

  function applyScope(scope) {
    const branch = document.getElementById('rankingBranch');
    const year = document.getElementById('rankingYear');
    if (!branch || !year) return;
    if (scope === 'college') { branch.value='all'; year.value='all'; }
    if (scope === 'branch') { branch.value=myBranch || 'all'; year.value='all'; }
    if (scope === 'year') { branch.value='all'; year.value=myYear || 'all'; }
    selectedScope = scope;
    page = 1;
    render();
  }

  function categoryGrid(row) {
    const order = ['academics','certificates','projects','research','competitions','internships','skills','profile'];
    return `<div class="ranking-breakdown-grid ranking-breakdown-grid-v3">${order.map(key => {
      const earned = Number(row.breakdown?.[key] || 0);
      const pending = (key === 'certificates' || key === 'competitions') ? Number(row.pending_breakdown?.[key] || 0) : 0;
      return `<span class="ranking-category-score ${pending?'has-pending':''}"><small>${esc(key)}</small><strong>${fmt(earned)}</strong>${pending?`<em>+${fmt(pending)} pending</em>`:'<em>counted</em>'}</span>`;
    }).join('')}</div>`;
  }

  function evidenceHtml(row) {
    const order = ['academics','certificates','projects','research','competitions','internships','skills','profile'];
    return order.map(key => {
      const earned = row.explanations?.[key] || [];
      const pending = row.pending_explanations?.[key] || [];
      if (!earned.length && !pending.length) return '';
      const items = [
        ...earned.map(item => `<div class="ranking-v5-evidence"><div><strong>${esc(item.label||key)}</strong><small>${esc(item.reason||'')}</small></div><b>+${fmt(item.points)}</b></div>`),
        ...pending.map(item => `<div class="ranking-v5-evidence pending"><div><strong>${esc(item.label||key)}</strong><small>${esc(item.reason||'Pending verification')}</small></div><b>+${fmt(item.points)} pending</b></div>`)
      ].join('');
      return `<section class="ranking-v5-detail-group"><h4>${esc(key)}</h4>${items}</section>`;
    }).join('');
  }

  function renderDetailsBody(row) {
    return `<div class="ranking-v5-score-head"><strong>${fmt(row.points)} Profile Points</strong>${row.pending_points ? `<span>+${fmt(row.pending_points)} pending verification</span>`:''}</div>${categoryGrid(row)}<div class="ranking-v5-evidence-list">${evidenceHtml(row)}</div>`;
  }

  async function loadDetails(details) {
    if (!details || details.dataset.loaded === '1' || details.dataset.loading === '1') return;
    const studentId = details.dataset.studentId;
    const body = details.querySelector('.ranking-v5-breakdown-body');
    if (!studentId || !body) return;
    if (detailsCache.has(studentId)) {
      body.innerHTML = renderDetailsBody(detailsCache.get(studentId));
      details.dataset.loaded = '1';
      return;
    }
    details.dataset.loading='1';
    body.innerHTML='<span>Loading score breakdown…</span>';
    try {
      const response = await fetch(`/api/student/rankings-view/details/${encodeURIComponent(studentId)}`, {
        cache:'no-store',
        headers:{Authorization:`Bearer ${token()}`,'Cache-Control':'no-cache',Pragma:'no-cache'}
      });
      const json = await response.json().catch(()=>({}));
      if (!response.ok || !json.success) throw new Error(json?.error?.message || 'Score breakdown unavailable');
      detailsCache.set(studentId,json.data);
      body.innerHTML = renderDetailsBody(json.data);
      details.dataset.loaded='1';
    } catch (error) {
      body.innerHTML=`<span>${esc(error.message)}</span>`;
    } finally {
      details.dataset.loading='0';
    }
  }

  async function fetchFast(force=false) {
    if (snapshot && !force) return snapshot;
    if (loadingFast && !force) return loadingFast;
    loadingFast = fetch('/api/student/rankings-view/fast', {
      cache:'no-store',
      headers:{Authorization:`Bearer ${token()}`,'Cache-Control':'no-cache',Pragma:'no-cache'}
    }).then(async response => {
      const json=await response.json().catch(()=>({}));
      if (!response.ok || !json.success) throw new Error(json?.error?.message || 'Ranking unavailable');
      snapshot=json.data;
      const me=snapshot.current;
      myBranch=me?.branch || '';
      myYear=me?.year || '';
      return snapshot;
    }).finally(()=>{loadingFast=null;});
    return loadingFast;
  }

  function open(force=false) {
    ensureStableList();
    fetchFast(force).then(()=>render()).catch(error=>{
      const stable=ensureStableList();
      if (stable) stable.innerHTML=`<div class="leaderboard-empty"><strong>Ranking unavailable</strong><p>${esc(error.message)}</p></div>`;
    });
  }

  function intercept(event) {
    const rankingTab = event.target.closest?.('.tabs-nav .tab-btn[aria-controls="tab-ranking"]');
    if (rankingTab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof switchTab === 'function') switchTab('ranking',rankingTab);
      setTimeout(()=>open(false),0);
      return;
    }

    const scope = event.target.closest?.('#tab-ranking .leaderboard-scope');
    if (scope) {
      event.preventDefault(); event.stopImmediatePropagation();
      applyScope(scope.dataset.scope);
      return;
    }

    const refresh = event.target.closest?.('#rankingRefresh');
    if (refresh) {
      event.preventDefault(); event.stopImmediatePropagation();
      page=1; detailsCache.clear(); open(true);
      return;
    }

    const prev = event.target.closest?.('#rankingPrevV5');
    if (prev) { event.preventDefault(); if (page>1) {page-=1;render();document.querySelector('#rankingStableListV4')?.scrollIntoView({block:'start'});} return; }
    const next = event.target.closest?.('#rankingNextV5');
    if (next) { event.preventDefault(); const total=Math.ceil(filteredRows().length/PAGE_SIZE); if(page<total){page+=1;render();document.querySelector('#rankingStableListV4')?.scrollIntoView({block:'start'});} return; }
  }

  function onChange(event) {
    if (!event.target.matches?.('#rankingBranch,#rankingYear')) return;
    event.stopImmediatePropagation();
    page=1;
    setScopeActive();
    render();
  }

  function onToggle(event) {
    const details = event.target.closest?.('#rankingStableListV4 .ranking-v5-breakdown');
    if (details?.open) loadDetails(details);
  }

  function boot() {
    ensureCss();
    document.addEventListener('click',intercept,true);
    document.addEventListener('change',onChange,true);
    document.addEventListener('toggle',onToggle,true);
    setTimeout(()=>{
      if (document.getElementById('tab-ranking')) {
        ensureStableList();
        ensurePager();
      }
    },350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();