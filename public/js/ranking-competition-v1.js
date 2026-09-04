(() => {
  if (window.__AIT_RANKING_COMPETITION_V1__) return;
  window.__AIT_RANKING_COMPETITION_V1__ = true;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(1).replace(/\.0$/, '');
  const token = () => localStorage.getItem('tpo_token') || '';
  let snapshot = null;
  let timer = null;
  let loading = false;

  function ensureCss() {
    if (document.querySelector('link[data-ranking-competition-v1]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/ranking-competition-v1.css?v=20260904-1';
    link.dataset.rankingCompetitionV1 = 'true';
    document.head.appendChild(link);
  }

  function isCollegeView() {
    return (document.getElementById('rankingBranch')?.value || 'all') === 'all'
      && (document.getElementById('rankingYear')?.value || 'all') === 'all';
  }

  function formatDuration(seconds, live = false) {
    let s = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(s / 86400); s %= 86400;
    const hours = Math.floor(s / 3600); s %= 3600;
    const minutes = Math.floor(s / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return live ? `${minutes}m` : `${Math.max(1, minutes)}m`;
  }

  function movementHtml(value) {
    const n = Number(value) || 0;
    if (n > 0) return `<span class="rank-chaos-move up" aria-label="Moved up ${n} ranks">↑${n}</span>`;
    if (n < 0) return `<span class="rank-chaos-move down" aria-label="Moved down ${Math.abs(n)} ranks">↓${Math.abs(n)}</span>`;
    return '<span class="rank-chaos-move flat" aria-label="Rank unchanged">—</span>';
  }

  function momentumHtml(value) {
    const key = String(value?.key || value || 'stable').toLowerCase();
    const map = { hot:['🔥','Hot'], rising:['⚡','Rising'], slipping:['🔻','Slipping'], stable:['🟢','Stable'] };
    const [icon, label] = map[key] || map.stable;
    return `<span class="rank-chaos-momentum ${key}">${icon} ${esc(label)}</span>`;
  }

  function badgeHtml(badge) {
    if (!badge) return '';
    return `<span class="rank-chaos-badge">${esc(badge.icon || '◆')} ${esc(badge.label || badge.key || '')}</span>`;
  }

  function installShell() {
    const host = document.querySelector('#tab-ranking .leaderboard-shell');
    const hero = document.querySelector('#tab-ranking .leaderboard-hero');
    if (!host || !hero) return null;
    let shell = document.getElementById('rankingCompetitionV1');
    if (shell) return shell;
    shell = document.createElement('section');
    shell.id = 'rankingCompetitionV1';
    shell.className = 'rank-chaos-shell';
    shell.innerHTML = `
      <div class="rank-chaos-scope-note" id="rankChaosScopeNote" hidden>
        Competitive streaks and rank-defense stats are college-wide. Switch to <button type="button" id="rankChaosCollege">College</button> to view them.
      </div>
      <div class="rank-chaos-grid" id="rankChaosGrid"></div>
      <div class="rank-chaos-lower">
        <section class="glass-card rank-chaos-panel">
          <div class="rank-chaos-heading"><div><span class="eyebrow">Leaderboard pulse</span><h3>Recent battles</h3></div><span class="rank-chaos-live">LIVE</span></div>
          <div id="rankChaosEvents" class="rank-chaos-events"></div>
        </section>
        <section class="glass-card rank-chaos-panel">
          <div class="rank-chaos-heading"><div><span class="eyebrow">Defense board</span><h3>Longest current holds</h3></div></div>
          <div id="rankChaosTopHolds" class="rank-chaos-holds"></div>
        </section>
      </div>`;
    hero.after(shell);
    shell.querySelector('#rankChaosCollege')?.addEventListener('click', () => {
      const branch = document.getElementById('rankingBranch');
      const year = document.getElementById('rankingYear');
      if (branch) branch.value = 'all';
      if (year) year.value = 'all';
      document.querySelector('#tab-ranking .leaderboard-scope[data-scope="college"]')?.click();
      setTimeout(refresh, 250);
    });
    return shell;
  }

  function rivalText(current, rows) {
    if (!current) return { ahead:'No rival data', behind:'No rival data' };
    const idx = rows.findIndex(row => row.student_id === current.student_id);
    const above = idx >= 0 ? [...rows.slice(0, idx)].reverse().find(row => row.rank < current.rank) : null;
    const below = idx >= 0 ? rows.slice(idx + 1).find(row => row.rank > current.rank) : null;
    return {
      ahead: above ? `#${above.rank} ${above.name} · ${fmt(Math.max(0, above.points-current.points))} pts ahead` : 'You hold the top rank',
      behind: below ? `#${below.rank} ${below.name} · ${fmt(Math.max(0, current.points-below.points))} pts behind` : 'No lower rival in this board'
    };
  }

  function renderCards() {
    const grid = document.getElementById('rankChaosGrid');
    const note = document.getElementById('rankChaosScopeNote');
    if (!grid || !note) return;
    if (!isCollegeView()) {
      note.hidden = false;
      grid.hidden = true;
      document.querySelector('.rank-chaos-lower')?.setAttribute('hidden','');
      return;
    }
    note.hidden = true;
    grid.hidden = false;
    document.querySelector('.rank-chaos-lower')?.removeAttribute('hidden');

    const current = snapshot?.current;
    if (!current) {
      grid.innerHTML = '<div class="glass-card rank-chaos-empty">Competition stats will appear after the college ranking baseline is recorded.</div>';
      return;
    }
    const c = current.competition || {};
    const rivals = rivalText(current, snapshot.rows || []);
    const badge = c.hold_badge;
    const pressure = c.pressure
      ? `<span class="rank-chaos-alert danger">⚠ ${esc(rivals.behind)}</span>`
      : c.safe_lead
        ? `<span class="rank-chaos-alert safe">🛡 ${fmt(c.gap_behind)} pt lead</span>`
        : `<span class="rank-chaos-alert neutral">${esc(rivals.behind)}</span>`;
    const badges = (c.badges || []).slice(0,5).map(badgeHtml).join('');
    grid.innerHTML = `
      <article class="glass-card rank-chaos-card rank-chaos-primary">
        <span class="eyebrow">Your movement</span>
        <div class="rank-chaos-mainline"><strong>#${current.rank}</strong>${movementHtml(c.movement)}${momentumHtml(c.momentum)}</div>
        <small>${fmt(current.points)} Profile Points · ${c.weekly_gain > 0 ? `+${fmt(c.weekly_gain)} this week` : 'No points gained this week'}</small>
      </article>
      <article class="glass-card rank-chaos-card">
        <span class="eyebrow">Rank defense</span>
        <strong class="rank-chaos-hold" data-hold-seconds="${Number(c.hold_seconds)||0}">Holding #${current.rank} for ${formatDuration(c.hold_seconds, true)}</strong>
        <div class="rank-chaos-badge-row">${badgeHtml(badge)}${c.unbeaten ? '<span class="rank-chaos-badge stable">🛡 Unmoved 7d+</span>' : ''}</div>
      </article>
      <article class="glass-card rank-chaos-card">
        <span class="eyebrow">Rival pressure</span>
        <strong>${esc(rivals.ahead)}</strong>
        ${pressure}
      </article>
      <article class="glass-card rank-chaos-card">
        <span class="eyebrow">Personal records</span>
        <strong>Best #${c.best_rank || current.rank}</strong>
        <small>Longest hold: #${c.longest_hold_rank || current.rank} for ${formatDuration(c.longest_hold_seconds)}</small>
        <small>${c.growth_streak_weeks ? `🔥 ${c.growth_streak_weeks}-week growth streak` : 'Build points this week to start a growth streak'}</small>
      </article>
      ${badges ? `<div class="rank-chaos-achievements" aria-label="Achievements">${badges}</div>` : ''}`;
  }

  function renderEvents() {
    const host = document.getElementById('rankChaosEvents');
    if (!host) return;
    const events = snapshot?.events || [];
    host.innerHTML = events.length ? events.slice(0,8).map(event => `
      <div class="rank-chaos-event">
        <span class="rank-chaos-event-dot" aria-hidden="true"></span>
        <div><strong>${esc(event.message || 'Leaderboard updated')}</strong><small>${event.created_at ? new Date(event.created_at).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</small></div>
      </div>`).join('') : '<p class="rank-chaos-muted">Major leaderboard events will appear here.</p>';
  }

  function renderTopHolds() {
    const host = document.getElementById('rankChaosTopHolds');
    if (!host) return;
    const rows = snapshot?.top_holds || [];
    host.innerHTML = rows.length ? rows.slice(0,5).map((row,index) => `
      <div class="rank-chaos-hold-row">
        <span>${index+1}</span>
        <div><strong>${esc(row.name)}</strong><small>#${row.rank} · ${fmt(row.points)} pts</small></div>
        <b>${formatDuration(row.competition?.hold_seconds ?? row.hold_seconds)}</b>
      </div>`).join('') : '<p class="rank-chaos-muted">Hold records start from the new ranking baseline.</p>';
  }

  function annotateLeaderboard() {
    if (!snapshot || !isCollegeView()) return;
    const entries = [...document.querySelectorAll('#rankingList .leaderboard-entry')];
    const rows = snapshot.rows || [];
    entries.forEach((entry,index) => {
      entry.querySelectorAll('.rank-chaos-inline').forEach(node => node.remove());
      const row = rows[index];
      if (!row) return;
      const rank = entry.querySelector('.leaderboard-rankno');
      const points = entry.querySelector('.leaderboard-points-cell');
      const c = row.competition || {};
      if (rank) rank.insertAdjacentHTML('beforeend', `<span class="rank-chaos-inline">${movementHtml(c.movement)}</span>`);
      if (points) {
        const badge = c.hold_badge ? `${esc(c.hold_badge.icon || '')} ${esc(c.hold_badge.label || '')}` : '';
        points.insertAdjacentHTML('beforeend', `<small class="rank-chaos-inline rank-chaos-inline-meta">${badge || esc(c.momentum?.label || 'Stable')}${c.hold_seconds ? ` · ${formatDuration(c.hold_seconds)}` : ''}</small>`);
      }
    });
  }

  function render() {
    installShell();
    renderCards();
    renderEvents();
    renderTopHolds();
    annotateLeaderboard();
  }

  async function refresh() {
    if (loading || !document.getElementById('tab-ranking')) return;
    installShell();
    if (!isCollegeView()) return render();
    loading = true;
    try {
      const response = await fetch('/api/student/rankings-view/competition', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token()}`, 'Cache-Control':'no-cache', Pragma:'no-cache' }
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json?.error?.message || 'Competition stats unavailable');
      snapshot = json.data;
      render();
    } catch (error) {
      const grid = document.getElementById('rankChaosGrid');
      if (grid) grid.innerHTML = `<div class="glass-card rank-chaos-empty"><strong>Competition stats unavailable</strong><span>${esc(error.message)}</span></div>`;
    } finally {
      loading = false;
    }
  }

  function tickHoldTimers() {
    document.querySelectorAll('[data-hold-seconds]').forEach(node => {
      const next = (Number(node.dataset.holdSeconds) || 0) + 60;
      node.dataset.holdSeconds = String(next);
      const rank = snapshot?.current?.rank || '—';
      node.textContent = `Holding #${rank} for ${formatDuration(next, true)}`;
    });
  }

  function boot() {
    ensureCss();
    document.addEventListener('click', event => {
      const target = event.target.closest?.('#rankingRefresh, #rankingShowMore, .leaderboard-scope, .tabs-nav .tab-btn[aria-controls="tab-ranking"]');
      if (!target) return;
      const needsNetwork = target.id === 'rankingRefresh' || target.matches('[aria-controls="tab-ranking"]') || target.matches('.leaderboard-scope');
      setTimeout(() => needsNetwork ? refresh() : annotateLeaderboard(), needsNetwork ? 650 : 100);
    });
    document.addEventListener('change', event => {
      if (!event.target.matches?.('#rankingBranch, #rankingYear')) return;
      setTimeout(() => isCollegeView() ? refresh() : render(), 100);
    });
    setTimeout(refresh, 700);
    timer = setInterval(tickHoldTimers, 60000);
    window.addEventListener('pagehide', () => clearInterval(timer), { once:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();