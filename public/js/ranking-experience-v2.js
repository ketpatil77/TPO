(() => {
  if (window.__AIT_RANKING_EXPERIENCE_V3__) return;
  window.__AIT_RANKING_EXPERIENCE_V3__ = true;

  const DEFENSE_KEY = 'ait-ranking-defense-hidden';
  const token = () => localStorage.getItem('tpo_token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(1).replace(/\.0$/, '');
  let quickSnapshot = window.__AIT_RANKING_FAST_SNAPSHOT__ || null;
  let quickPromise = null;
  let annotateTimer = null;

  function ensureCss() {
    if (document.querySelector('link[data-ranking-experience-v2]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/ranking-experience-v2.css?v=20260904-v3';
    link.dataset.rankingExperienceV2 = 'true';
    document.head.appendChild(link);
  }

  function moveRankingNextToProfile() {
    const tabs = document.querySelector('.tabs-nav');
    if (!tabs) return;
    const profile = tabs.querySelector('[aria-controls="tab-edit-profile"]');
    const ranking = tabs.querySelector('[aria-controls="tab-ranking"], [aria-controls="tab-ranking-lazy"]');
    if (profile && ranking && profile.nextElementSibling !== ranking) profile.after(ranking);
  }

  async function fetchQuickSnapshot(force = false) {
    if (quickSnapshot && !force) return quickSnapshot;
    if (quickPromise && !force) return quickPromise;
    quickPromise = fetch('/api/student/rankings-view/competition', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token()}`, 'Cache-Control':'no-cache', Pragma:'no-cache' }
    }).then(async response => {
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json?.error?.message || 'Ranking snapshot unavailable');
      quickSnapshot = json.data;
      window.__AIT_RANKING_FAST_SNAPSHOT__ = quickSnapshot;
      return quickSnapshot;
    }).finally(() => { quickPromise = null; });
    return quickPromise;
  }

  function formatDuration(seconds) {
    let s = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(s / 86400); s %= 86400;
    const hours = Math.floor(s / 3600); s %= 3600;
    const minutes = Math.floor(s / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function movementMeta(c = {}) {
    const n = Number(c.movement) || 0;
    if (n > 0) return { text:`↑${n}`, key:'up', label:`Moved up ${n} rank${n === 1 ? '' : 's'}` };
    if (n < 0) return { text:`↓${Math.abs(n)}`, key:'down', label:`Moved down ${Math.abs(n)} rank${Math.abs(n) === 1 ? '' : 's'}` };
    return { text:'—', key:'flat', label:'Rank unchanged' };
  }

  function movementPill(c = {}) {
    const move = movementMeta(c);
    return `<span class="ranking-move-pill ${move.key}" aria-label="${esc(move.label)}">${move.text}</span>`;
  }

  function momentumPill(c = {}) {
    const key = String(c.momentum?.key || 'stable').toLowerCase();
    const map = {hot:['🔥','Hot'],rising:['⚡','Rising'],stable:['🟢','Stable'],slipping:['🔻','Slipping']};
    const [icon,label] = map[key] || map.stable;
    return `<span class="ranking-meter-pill ${key}">${icon} ${esc(label)}</span>`;
  }

  function quickRowHtml(row, currentId) {
    const c = row.competition || {};
    const initials = (row.name || 'ST').split(/\s+/).filter(Boolean).map(x => x[0]).slice(0,2).join('').toUpperCase();
    return `<article class="leaderboard-entry ranking-fast-row ${row.student_id === currentId ? 'is-me' : ''}" data-fast-student="${esc(row.student_id)}">
      <div class="leaderboard-entry-main">
        <div class="leaderboard-rankno"><span>#${row.rank}</span>${movementPill(c)}</div>
        <div class="leaderboard-student"><span class="leaderboard-avatar" aria-hidden="true"><span class="leaderboard-avatar-fallback">${esc(initials)}</span></span><div class="leaderboard-student-copy"><strong>${esc(row.name)}${row.student_id === currentId ? ' · You' : ''}</strong><small>${momentumPill(c)}${c.hold_seconds ? `<span class="ranking-hold-inline">Holding ${formatDuration(c.hold_seconds)}</span>` : ''}</small></div></div>
        <div class="leaderboard-cell branch">${esc(row.branch || '')}</div>
        <div class="leaderboard-cell year">${esc(row.year || '')}</div>
        <div class="leaderboard-points-cell">${fmt(row.points)} pts</div>
      </div>
    </article>`;
  }

  function hasDetailedRows() {
    return Boolean(document.querySelector('#rankingList .leaderboard-entry:not(.ranking-fast-row)'));
  }

  function renderQuickPreview(data, force = false) {
    if (!data || !document.getElementById('tab-ranking')) return;
    if (hasDetailedRows() && !force) return;
    const list = document.getElementById('rankingList');
    const summary = document.getElementById('rankingMySummary');
    const count = document.getElementById('rankingCount');
    if (!list || !summary) return;
    const current = data.current;
    if (current) {
      const c = current.competition || {};
      summary.innerHTML = `<span>Your rank</span><strong>#${current.rank} ${movementPill(c)}</strong><small>${fmt(current.points)} points · ${esc(c.momentum?.label || 'Stable')}</small>`;
    }
    const rows = (data.rows || []).slice(0,15);
    if (rows.length) list.innerHTML = `<div class="ranking-fast-note">Latest standings shown instantly. Detailed score breakdowns are loading in the background.</div>${rows.map(row => quickRowHtml(row, current?.student_id)).join('')}`;
    if (count) count.textContent = `${data.rows?.length || 0} students`;
  }

  function keepFastRowsVisible() {
    [0,80,220,500,900,1500,2500].forEach(delay => setTimeout(() => {
      const list = document.getElementById('rankingList');
      if (!list || hasDetailedRows() || !quickSnapshot) return;
      const text = list.textContent || '';
      if (/Calculating Profile Points|Loading standings|Preparing your ranking/i.test(text) || !list.querySelector('.ranking-fast-row')) renderQuickPreview(quickSnapshot, true);
    }, delay));
  }

  function normalizeName(value) {
    return String(value || '').replace(/\s*·\s*You\s*$/i,'').replace(/\s+/g,' ').trim().toLowerCase();
  }

  function findSnapshotRow(entry) {
    if (!quickSnapshot?.rows?.length) return null;
    const name = normalizeName(entry.querySelector('.leaderboard-student-copy strong')?.textContent);
    if (!name) return null;
    return quickSnapshot.rows.find(row => normalizeName(row.name) === name) || null;
  }

  function annotateDetailedRows() {
    if (!quickSnapshot) return false;
    const entries = [...document.querySelectorAll('#rankingList .leaderboard-entry:not(.ranking-fast-row)')];
    if (!entries.length) return false;
    entries.forEach(entry => {
      entry.querySelectorAll('.ranking-meter-inline').forEach(node => node.remove());
      const row = findSnapshotRow(entry);
      if (!row) return;
      const c = row.competition || {};
      const rank = entry.querySelector('.leaderboard-rankno');
      const points = entry.querySelector('.leaderboard-points-cell');
      if (rank) rank.insertAdjacentHTML('beforeend', `<span class="ranking-meter-inline">${movementPill(c)}</span>`);
      if (points) points.insertAdjacentHTML('beforeend', `<small class="ranking-meter-inline ranking-meter-inline-state">${momentumPill(c)}</small>`);
    });
    return true;
  }

  function scheduleDetailedAnnotation() {
    if (annotateTimer) clearInterval(annotateTimer);
    let attempts = 0;
    annotateTimer = setInterval(() => {
      attempts += 1;
      if (annotateDetailedRows() || attempts >= 20) {
        clearInterval(annotateTimer);
        annotateTimer = null;
      }
    }, 500);
  }

  function badgeCandidates(current) {
    if (!current) return [];
    const c = current.competition || {};
    const list = [];
    const push = (key, icon, label, reason, priority) => list.push({key, icon, label, reason, priority});
    (c.badges || []).forEach((badge, index) => push(badge.key || `earned-${index}`, badge.icon || '◆', badge.label || 'Achievement', 'Earned from your current profile and verified activity.', 80-index));
    if (current.rank === 1) push('college-1','🥇','College #1','You currently hold the top college rank.',100);
    else if (current.rank <= 3) push('top-3','🏆','Top 3','You are currently inside the college Top 3.',96);
    if (Number(c.movement) >= 5) push('fast-climber','🚀','Fast Climber',`You recently climbed ${c.movement} ranks.`,92);
    if (c.momentum?.key === 'hot') push('hot','🔥','Hot Streak',`Strong recent momentum with +${fmt(c.weekly_gain)} points this week.`,90);
    else if (c.momentum?.key === 'rising') push('rising','⚡','Rising','Your profile is moving in the right direction.',72);
    if (Number(c.growth_streak_weeks) >= 2) push('growth','📈','Growth Streak',`${c.growth_streak_weeks} straight weeks of profile growth.`,88);
    if (c.unbeaten) push('unbeaten','🛡','Unbeaten','You have held this exact rank for at least 7 days.',94);
    if (c.safe_lead) push('safe-lead','🧱','Protected Lead',`${fmt(c.gap_behind)} points separate you from the next rank.`,68);
    if (c.pressure) push('pressure','🎯','Battle Ready',`The next student is only ${fmt(c.gap_behind)} points behind.`,66);
    const unique = new Map();
    list.sort((a,b)=>b.priority-a.priority).forEach(item => { if (!unique.has(item.key)) unique.set(item.key,item); });
    return [...unique.values()];
  }

  function renderStrengthBadges() {
    const shell = document.getElementById('rankingCompetitionV1');
    const current = quickSnapshot?.current;
    if (!shell || !current) return false;
    let panel = document.getElementById('rankingStrengthBadgesV2');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'rankingStrengthBadgesV2';
      panel.className = 'glass-card ranking-strength-panel';
      const grid = document.getElementById('rankChaosGrid');
      (grid || shell.firstElementChild)?.after(panel);
    }
    const badges = badgeCandidates(current);
    const visible = badges.slice(0,5);
    panel.innerHTML = `<div class="ranking-strength-head"><div><span class="eyebrow">Your strengths</span><h3>Personalized badges</h3><p>Badges adapt to your profile, rank, verified achievements and recent momentum.</p></div>${badges.length > 5 ? `<button id="rankingBadgeToggleV2" class="rank-compact-toggle" type="button" aria-expanded="false">View all</button>` : ''}</div>
      <div class="ranking-strength-badges">${visible.map(item=>`<span class="ranking-strength-badge" title="${esc(item.reason)}"><b>${esc(item.icon)}</b><span>${esc(item.label)}</span></span>`).join('') || '<span class="rank-chaos-muted">Build your profile to unlock personalized badges.</span>'}</div>
      <div id="rankingBadgeDetailsV2" class="ranking-badge-details" hidden>${badges.map(item=>`<div><strong>${esc(item.icon)} ${esc(item.label)}</strong><small>${esc(item.reason)}</small></div>`).join('')}</div>`;
    panel.querySelector('#rankingBadgeToggleV2')?.addEventListener('click', event => {
      const details = panel.querySelector('#rankingBadgeDetailsV2');
      const open = details.hidden;
      details.hidden = !open;
      event.currentTarget.textContent = open ? 'Hide details' : 'View all';
      event.currentTarget.setAttribute('aria-expanded', String(open));
    });
    return true;
  }

  function findDefensePanel() {
    return [...document.querySelectorAll('#rankingCompetitionV1 .rank-chaos-panel')].find(panel => /longest current holds|defense board/i.test(panel.textContent || '')) || null;
  }

  function applyDefenseVisibility(panel, hidden) {
    const body = panel?.querySelector('.rank-chaos-holds');
    const button = panel?.querySelector('[data-defense-toggle-v2]');
    if (body) body.hidden = hidden;
    panel?.classList.toggle('defense-collapsed', hidden);
    if (button) {
      button.textContent = hidden ? 'Show' : 'Hide';
      button.setAttribute('aria-expanded', String(!hidden));
    }
  }

  function installDefenseToggle() {
    const panel = findDefensePanel();
    if (!panel) return false;
    const heading = panel.querySelector('.rank-chaos-heading');
    if (!heading) return false;
    let button = heading.querySelector('[data-defense-toggle-v2]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'rank-compact-toggle';
      button.dataset.defenseToggleV2 = 'true';
      heading.appendChild(button);
      button.addEventListener('click', () => {
        const next = !panel.querySelector('.rank-chaos-holds')?.hidden;
        localStorage.setItem(DEFENSE_KEY, next ? '1' : '0');
        applyDefenseVisibility(panel, next);
      });
    }
    applyDefenseVisibility(panel, localStorage.getItem(DEFENSE_KEY) === '1');
    return true;
  }

  function hydrateExtras(attempt = 0) {
    moveRankingNextToProfile();
    annotateDetailedRows();
    const badgesReady = renderStrengthBadges();
    const toggleReady = installDefenseToggle();
    if ((!badgesReady || !toggleReady) && attempt < 16) setTimeout(() => hydrateExtras(attempt + 1), 180);
  }

  function openFast() {
    moveRankingNextToProfile();
    const show = data => {
      quickSnapshot = data;
      renderQuickPreview(data, true);
      keepFastRowsVisible();
      scheduleDetailedAnnotation();
      setTimeout(hydrateExtras, 40);
    };
    if (quickSnapshot) show(quickSnapshot);
    else fetchQuickSnapshot().then(show).catch(() => {});
  }

  function schedulePrefetch() {
    const run = () => fetchQuickSnapshot().catch(() => {});
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 500);
  }

  function boot() {
    ensureCss();
    moveRankingNextToProfile();
    document.addEventListener('click', event => {
      if (event.target.closest?.('.tabs-nav .tab-btn[aria-controls="tab-ranking"], .tabs-nav .tab-btn[aria-controls="tab-ranking-lazy"]')) openFast();
      if (event.target.closest?.('#rankingRefresh')) fetchQuickSnapshot(true).then(data => {
        quickSnapshot = data;
        renderQuickPreview(data, true);
        keepFastRowsVisible();
        scheduleDetailedAnnotation();
        setTimeout(hydrateExtras, 40);
      }).catch(() => {});
    }, true);
    window.addEventListener('focus', moveRankingNextToProfile);
    schedulePrefetch();
    setTimeout(hydrateExtras, 450);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();