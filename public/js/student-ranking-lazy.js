(() => {
  if (!document.body.classList.contains('student-dashboard-page') || window.__AIT_RANKING_LAZY_V2__) return;
  window.__AIT_RANKING_LAZY_V2__ = true;

  let loaded = false;
  let loading = false;

  const realButton = () => document.querySelector('.tabs-nav .tab-btn[aria-controls="tab-ranking"]');
  const realPanel = () => document.getElementById('tab-ranking');

  function cleanDuplicate() {
    if (!realButton() || !realPanel()) return null;
    document.querySelectorAll('.tabs-nav .tab-btn[aria-controls="tab-ranking-lazy"], #tab-ranking-lazy').forEach(node => node.remove());
    loaded = true;
    loading = false;
    return realButton();
  }

  function addScript(src, marker, optional = false) {
    return new Promise((resolve, reject) => {
      const selector = `script[data-${marker}]`;
      const existing = document.querySelector(selector);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve(existing);
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', error => optional ? resolve(null) : reject(error), { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(`data-${marker}`, 'true');
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(script); }, { once:true });
      script.addEventListener('error', error => optional ? resolve(null) : reject(error), { once:true });
      document.body.appendChild(script);
    });
  }

  function installPlaceholder() {
    const authoritative = cleanDuplicate();
    if (authoritative) return authoritative;
    const existing = document.querySelector('.tabs-nav .tab-btn[aria-controls="tab-ranking-lazy"]');
    if (existing) return existing;
    const tabs = document.querySelector('.tabs-nav');
    const dashboard = document.getElementById('dashboardContent');
    if (!tabs || !dashboard) return null;

    const button = document.createElement('button');
    button.className = 'tab-btn';
    button.type = 'button';
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected','false');
    button.setAttribute('aria-controls','tab-ranking-lazy');
    button.dataset.featureKey = 'ranking';
    button.dataset.featureStatus = 'hot';
    button.innerHTML = '<span class="ranking-tab-label">Ranking</span>';
    const anchor = tabs.querySelector('[aria-controls="tab-competitions"]') || tabs.querySelector('[aria-controls="tab-research"]') || tabs.lastElementChild;
    anchor?.after(button);

    const panel = document.createElement('div');
    panel.id = 'tab-ranking-lazy';
    panel.className = 'tab-content';
    panel.setAttribute('role','tabpanel');
    panel.innerHTML = '<section class="glass-card" style="padding:18px"><span class="eyebrow">Student Profile Points</span><h2 style="margin:.35rem 0">Leaderboard</h2><p style="margin:0;color:var(--text-muted)">Ranking loads only when opened so the Student Workspace stays fast on phones.</p></section>';
    dashboard.appendChild(panel);
    button.addEventListener('click', () => {
      if (typeof switchTab === 'function') switchTab('ranking-lazy', button);
      loadRanking(button, panel);
    });
    return button;
  }

  async function loadRanking(button, panel) {
    const authoritative = cleanDuplicate();
    if (authoritative) return authoritative.click();
    if (loaded || loading) return;
    loading = true;
    button.disabled = true;
    const label = button.querySelector('.ranking-tab-label');
    if (label) label.textContent = 'Loading Ranking…';

    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (String(url).includes('/api/student/rankings-view/profile')) {
        return Promise.reject(new Error('Ranking overview deferred until leaderboard is opened.'));
      }
      return nativeFetch(input, init);
    };

    try {
      await addScript('/js/profile-ranking.js?v=20260904-chaos1', 'profile-ranking-module');
      await addScript('/js/leaderboard-compact-score.js?v=20260902-1', 'leaderboard-compact-score-js', true);
      await addScript('/js/ranking-competition-v1.js?v=20260904-1', 'ranking-competition-v1', true);
    } catch (error) {
      loading = false;
      button.disabled = false;
      if (label) label.textContent = 'Ranking';
      const host = panel.querySelector('section');
      if (host) host.innerHTML = '<h2>Ranking unavailable</h2><p>Please refresh once and try again.</p>';
      return;
    } finally {
      window.fetch = nativeFetch;
    }

    loaded = true;
    loading = false;
    panel.remove();
    button.remove();
    document.getElementById('overviewRankSpotlight')?.setAttribute('hidden','');
    realButton()?.click();
    realButton()?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  }

  function boot(attempt = 0) {
    const button = installPlaceholder();
    if (!button && attempt < 20) return setTimeout(() => boot(attempt + 1), 250);
    if (button && new URLSearchParams(location.search).get('tab') === 'ranking') button.click();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), {once:true});
  else boot();
})();