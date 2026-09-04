(() => {
  if (window.__AIT_RANKING_EXPERIENCE_V2__) return;
  window.__AIT_RANKING_EXPERIENCE_V2__ = true;

  const CACHE_KEY = 'ait-ranking-defense-hidden';
  const token = () => localStorage.getItem('tpo_token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(1).replace(/\.0$/, '');
  let quickSnapshot = null;
  let quickPromise = null;

  function ensureCss() {
    if (document.querySelector('link[data-ranking-experience-v2]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/ranking-experience-v2.css?v=20260904-v2';
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

  function quickRowHtml(row, currentId) {
    const c = row.competition || {};
    const move = Number(c.movement) > 0 ? `↑${c.movement}` : Number(c.movement) < 0 ? `↓${Math.abs(c.movement)}` : '—';
    const initials = (row.name || 'ST').split(/\s+/).filter(Boolean).map(x => x[0]).slice(0,2).join('').toUpperCase();
    return `<article class="leaderboard-entry ranking-fast-row ${row.student_id === currentId ? 'is-me' : ''}">
      <div class="leaderboard-entry-main">
        <div class="leaderboard-rankno">#${row.rank}</div>
        <div class="leaderboard-student"><span class="leaderboard-avatar" aria-hidden="true"><span class="leaderboard-avatar-fallback">${esc(initials)}</span></span><div class="leaderboard-student-copy"><strong>${esc(row.name)}${row.student_id === currentId ? ' · You' : ''}</strong><small>Latest standing · ${esc(c.momentum?.label || 'Stable')}</small></div></div>
        <div class="leaderboard-cell branch">${move}</div>
        <div class="leaderboard-cell year">${c.hold_seconds ? `Holding ${formatDuration(c.hold_seconds)}` : 'New hold'}</div>
        <div class="leaderboard-points-cell">${fmt(row.points)} pts</div>
      </div>
    </article>`;
  }

  function renderQuickPreview(data) {
    if (!data || !document.getElementById('tab-ranking')) return;
    const list = document.getElementById('rankingList');
    const summary = document.getElementById('rankingMySummary');
    const count = document.getElementById('rankingCount');
    if (!list || !summary) return;
    const current = data.current;
    if (current) summary.innerHTML = `<span>Your rank</span><strong>#${current.rank}</strong><small>${fmt(current.points)} points · updating full leaderboard</small>`;
    const rows = (data.rows || []).slice(0,15);
    if (rows.length) list.innerHTML = `<div class="ranking-fast-note">Latest ranking snapshot shown instantly. Detailed profile scores are updating.</div>${rows.map(row => quickRowHtml(row, current?.student_id)).join('')}`;
    if (count) count.textContent = `${data.rows?.length || 0} students`;
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
    const current = quickSnapshot?.current || window.__AIT_RANKING_FAST_SNAPSHOT__?.current;
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
        localStorage.setItem(CACHE_KEY, next ? '1' : '0');
        applyDefenseVisibility(panel, next);
      });
    }
    applyDefenseVisibility(panel, localStorage.getItem(CACHE_KEY) === '1');
    return true;
  }

  function hydrateExtras(attempt = 0) {
    moveRankingNextToProfile();
    const badgesReady = renderStrengthBadges();
    const toggleReady = installDefenseToggle();
    if ((!badgesReady || !toggleReady) && attempt < 16) setTimeout(() => hydrateExtras(attempt + 1), 180);
  }

  function openFast() {
    moveRankingNextToProfile();
    if (quickSnapshot) renderQuickPreview(quickSnapshot);
    else fetchQuickSnapshot().then(renderQuickPreview).catch(() => {});
    setTimeout(() => hydrateExtras(), 40);
  }

  function schedulePrefetch() {
    const run = () => fetchQuickSnapshot().catch(() => {});
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2200 });
    else setTimeout(run, 1200);
  }

  function boot() {
    ensureCss();
    moveRankingNextToProfile();
    document.addEventListener('click', event => {
      if (event.target.closest?.('.tabs-nav .tab-btn[aria-controls="tab-ranking"], .tabs-nav .tab-btn[aria-controls="tab-ranking-lazy"]')) openFast();
      if (event.target.closest?.('#rankingRefresh')) fetchQuickSnapshot(true).then(data => { quickSnapshot = data; setTimeout(hydrateExtras, 40); }).catch(() => {});
    }, true);
    window.addEventListener('focus', moveRankingNextToProfile);
    schedulePrefetch();
    setTimeout(hydrateExtras, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();