(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  let loaded = false;
  let loading = false;

  function addScript(src, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-${marker}]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve(existing);
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(`data-${marker}`, 'true');
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(script); }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.body.appendChild(script);
    });
  }

  function installPlaceholder() {
    if (document.getElementById('tab-ranking-lazy')) return document.querySelector('[aria-controls="tab-ranking-lazy"]');
    const tabs = document.querySelector('.tabs-nav');
    const dashboard = document.getElementById('dashboardContent');
    if (!tabs || !dashboard) return null;

    const button = document.createElement('button');
    button.className = 'tab-btn';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.setAttribute('aria-controls', 'tab-ranking-lazy');
    button.textContent = 'Ranking';
    const competitionTab = tabs.querySelector('[aria-controls="tab-competitions"]');
    const researchTab = tabs.querySelector('[aria-controls="tab-research"]');
    (competitionTab || researchTab || tabs.lastElementChild)?.after(button);

    const panel = document.createElement('div');
    panel.id = 'tab-ranking-lazy';
    panel.className = 'tab-content';
    panel.setAttribute('role', 'tabpanel');
    panel.innerHTML = '<section class="glass-card" style="padding:18px"><span class="eyebrow">Student Profile Points</span><h2 style="margin:.35rem 0">Leaderboard</h2><p style="margin:0;color:var(--text-muted)">Ranking loads only when opened so the Student Workspace stays fast on phones.</p></section>';
    dashboard.appendChild(panel);

    button.addEventListener('click', () => {
      if (typeof switchTab === 'function') switchTab('ranking-lazy', button);
      loadRanking(button, panel);
    });
    return button;
  }

  async function loadRanking(placeholderButton, placeholderPanel) {
    if (loaded || loading) return;
    loading = true;
    placeholderButton.disabled = true;
    const originalText = placeholderButton.textContent;
    placeholderButton.textContent = 'Loading Ranking…';

    const nativeFetch = window.fetch.bind(window);
    // profile-ranking.js historically starts two expensive overview ranking requests while it installs.
    // Block only those install-time ranking calls. Once the module is installed we restore fetch and
    // allow the single explicit leaderboard request triggered by the student's click.
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (String(url).includes('/api/student/rankings-view/profile')) {
        return Promise.reject(new Error('Ranking overview deferred until leaderboard is opened.'));
      }
      return nativeFetch(input, init);
    };

    try {
      await addScript('/js/profile-ranking.js?v=20260902-3', 'profile-ranking-module');
    } catch (error) {
      window.fetch = nativeFetch;
      loading = false;
      placeholderButton.disabled = false;
      placeholderButton.textContent = originalText;
      const host = placeholderPanel.querySelector('section');
      if (host) host.innerHTML = '<h2>Ranking unavailable</h2><p>Please refresh once and try again.</p>';
      return;
    }

    window.fetch = nativeFetch;
    loaded = true;
    loading = false;

    const realButton = [...document.querySelectorAll('.tabs-nav .tab-btn')].find(btn => btn.getAttribute('aria-controls') === 'tab-ranking');
    placeholderPanel.remove();
    placeholderButton.remove();
    document.getElementById('overviewRankSpotlight')?.setAttribute('hidden', '');

    if (realButton) {
      realButton.click();
      realButton.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
    }
  }

  function boot() {
    const button = installPlaceholder();
    if (!button) {
      const observer = new MutationObserver(() => {
        const next = installPlaceholder();
        if (next) {
          observer.disconnect();
          if (new URLSearchParams(location.search).get('tab') === 'ranking') next.click();
        }
      });
      observer.observe(document.body, { childList:true, subtree:true });
      setTimeout(() => observer.disconnect(), 12000);
      return;
    }
    if (new URLSearchParams(location.search).get('tab') === 'ranking') button.click();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
