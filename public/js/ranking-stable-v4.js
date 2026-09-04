(() => {
  if (window.__AIT_RANKING_STABLE_V4__) return;
  window.__AIT_RANKING_STABLE_V4__ = true;

  const token = () => localStorage.getItem('tpo_token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(1).replace(/\.0$/, '');
  let fast = null;
  let syncTimer = null;
  let lastDetailedSignature = '';

  function ensureCss() {
    if (document.querySelector('link[data-ranking-stable-v4]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/ranking-stable-v4.css?v=20260904-1';
    link.dataset.rankingStableV4 = 'true';
    document.head.appendChild(link);
  }

  function movement(c = {}) {
    const n = Number(c.movement) || 0;
    if (n > 0) return { text:`↑${n}`, key:'up', label:`Moved up ${n}` };
    if (n < 0) return { text:`↓${Math.abs(n)}`, key:'down', label:`Moved down ${Math.abs(n)}` };
    return { text:'—', key:'flat', label:'Rank unchanged' };
  }

  function movePill(c = {}) {
    const m = movement(c);
    return `<span class="ranking-v4-move ${m.key}" aria-label="${esc(m.label)}">${m.text}</span>`;
  }

  function momentum(c = {}) {
    const key = String(c.momentum?.key || 'stable').toLowerCase();
    const map = { hot:['🔥','Hot'], rising:['⚡','Rising'], stable:['🟢','Stable'], slipping:['🔻','Slipping'] };
    const [icon,label] = map[key] || map.stable;
    return `<span class="ranking-v4-momentum ${key}">${icon} ${esc(label)}</span>`;
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

  function avatar(row) {
    const initials = (row.name || 'ST').split(/\s+/).filter(Boolean).map(part => part[0]).slice(0,2).join('').toUpperCase();
    return `<span class="leaderboard-avatar" aria-hidden="true"><span class="leaderboard-avatar-fallback">${esc(initials)}</span>${row.avatar_url ? `<img src="${esc(row.avatar_url)}" alt="" loading="eager" decoding="async">` : ''}</span>`;
  }

  function quickBreakdown() {
    return `<details class="leaderboard-entry-details ranking-v4-breakdown"><summary>Score breakdown</summary><div class="ranking-v4-breakdown-wait">Detailed score breakdown is loading in the background. The leaderboard stays usable while it prepares.</div></details>`;
  }

  function quickRow(row) {
    const c = row.competition || {};
    return `<article class="leaderboard-entry ranking-v4-row ${row.is_me ? 'is-me' : ''}" data-student-id="${esc(row.student_id)}">
      <div class="leaderboard-entry-main">
        <div class="leaderboard-rankno"><span>#${row.rank}</span>${movePill(c)}</div>
        <div class="leaderboard-student">${avatar(row)}<div class="leaderboard-student-copy"><strong>${esc(row.name)}${row.is_me ? ' · You' : ''}</strong><small>${esc(row.branch || '—')} · ${esc(row.year || '—')}</small><div class="ranking-v4-state">${momentum(c)}${c.hold_seconds ? `<span>Holding ${duration(c.hold_seconds)}</span>` : ''}</div></div></div>
        <div class="leaderboard-cell branch">${esc(row.branch || '—')}</div>
        <div class="leaderboard-cell year">${esc(row.year || '—')}</div>
        <div class="leaderboard-points-cell"><strong>${fmt(row.points)} pts</strong></div>
      </div>
      ${quickBreakdown()}
    </article>`;
  }

  function ensureStableList() {
    const original = document.getElementById('rankingList');
    if (!original) return null;
    let stable = document.getElementById('rankingStableListV4');
    if (!stable) {
      stable = document.createElement('div');
      stable.id = 'rankingStableListV4';
      stable.className = 'ranking-stable-list-v4';
      original.before(stable);
    }
    original.hidden = true;
    original.setAttribute('aria-hidden', 'true');
    return stable;
  }

  function normalizeName(value) {
    return String(value || '').replace(/\s*·\s*You\s*$/i,'').replace(/\s+/g,' ').trim().toLowerCase();
  }

  function fastRowForClone(entry) {
    if (!fast?.rows?.length) return null;
    const id = entry.dataset.studentId;
    if (id) {
      const direct = fast.rows.find(row => String(row.student_id) === String(id));
      if (direct) return direct;
    }
    const name = normalizeName(entry.querySelector('.leaderboard-student-copy strong')?.textContent);
    return fast.rows.find(row => normalizeName(row.name) === name) || null;
  }

  function cleanAndAnnotateClone(entry) {
    entry.classList.add('ranking-v4-row','ranking-v4-detailed');
    entry.querySelectorAll('.rank-chaos-inline,.ranking-meter-inline,.ranking-move-pill,.ranking-meter-pill').forEach(node => node.remove());
    const row = fastRowForClone(entry);
    if (!row) return;
    entry.dataset.studentId = row.student_id;
    const c = row.competition || {};
    const rank = entry.querySelector('.leaderboard-rankno');
    if (rank) {
      rank.innerHTML = `<span>#${row.rank}</span>${movePill(c)}`;
    }
    const copy = entry.querySelector('.leaderboard-student-copy');
    if (copy && !copy.querySelector('.ranking-v4-state')) {
      copy.insertAdjacentHTML('beforeend', `<div class="ranking-v4-state">${momentum(c)}${c.hold_seconds ? `<span>Holding ${duration(c.hold_seconds)}</span>` : ''}</div>`);
    }
  }

  function syncDetailedRows() {
    const original = document.getElementById('rankingList');
    const stable = ensureStableList();
    if (!original || !stable) return false;
    const entries = [...original.querySelectorAll('.leaderboard-entry:not(.ranking-fast-row)')];
    if (!entries.length) return false;
    const signature = `${entries.length}:${original.innerHTML.length}:${entries[0]?.textContent?.slice(0,80) || ''}`;
    if (signature === lastDetailedSignature) return true;
    lastDetailedSignature = signature;
    const fragment = document.createDocumentFragment();
    entries.forEach(entry => {
      const clone = entry.cloneNode(true);
      cleanAndAnnotateClone(clone);
      fragment.appendChild(clone);
    });
    stable.replaceChildren(fragment);
    stable.dataset.mode = 'detailed';
    return true;
  }

  function renderFast(data) {
    fast = data;
    window.__AIT_RANKING_FAST_SNAPSHOT__ = data;
    const stable = ensureStableList();
    if (!stable) return;
    const rows = (data.rows || []).slice(0,15);
    if (rows.length && stable.dataset.mode !== 'detailed') {
      stable.innerHTML = rows.map(quickRow).join('');
      stable.dataset.mode = 'fast';
    }
    const count = document.getElementById('rankingCount');
    if (count) count.textContent = `${data.rows?.length || 0} students`;
    const summary = document.getElementById('rankingMySummary');
    if (summary && data.current) {
      const c = data.current.competition || {};
      summary.innerHTML = `<span>Your rank</span><strong>#${data.current.rank} ${movePill(c)}</strong><small>${fmt(data.current.points)} points · ${esc(c.momentum?.label || 'Stable')}</small>`;
    }
  }

  async function fetchFast(force = false) {
    if (fast && !force) return fast;
    const response = await fetch('/api/student/rankings-view/fast', {
      cache:'no-store',
      headers:{ Authorization:`Bearer ${token()}`, 'Cache-Control':'no-cache', Pragma:'no-cache' }
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) throw new Error(json?.error?.message || 'Fast ranking unavailable');
    return json.data;
  }

  function watchDetailed() {
    if (syncTimer) clearInterval(syncTimer);
    let attempts = 0;
    syncTimer = setInterval(() => {
      attempts += 1;
      syncDetailedRows();
      if (attempts >= 50) {
        clearInterval(syncTimer);
        syncTimer = null;
      }
    }, 300);
  }

  function open() {
    ensureStableList();
    if (fast) renderFast(fast);
    fetchFast(false).then(data => {
      renderFast(data);
      watchDetailed();
    }).catch(() => watchDetailed());
  }

  function boot() {
    ensureCss();
    document.addEventListener('click', event => {
      if (event.target.closest?.('.tabs-nav .tab-btn[aria-controls="tab-ranking"], .tabs-nav .tab-btn[aria-controls="tab-ranking-lazy"]')) setTimeout(open, 20);
      if (event.target.closest?.('#rankingRefresh')) {
        lastDetailedSignature = '';
        const stable = ensureStableList();
        if (stable) stable.dataset.mode = 'fast';
        fetchFast(true).then(data => { renderFast(data); watchDetailed(); }).catch(() => watchDetailed());
      }
    }, true);
    setTimeout(() => {
      if (document.getElementById('tab-ranking')) open();
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
