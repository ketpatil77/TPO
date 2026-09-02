(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;
  const token = () => localStorage.getItem('tpo_token');
  const fmt = value => Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  let targetText = '';
  let loaded = false;
  let loading = false;

  function paint() {
    const summary = document.getElementById('rankingMySummary');
    if (!summary || !targetText) return;
    let line = summary.querySelector('.leaderboard-mini-target');
    if (!line) {
      line = document.createElement('span');
      line.className = 'leaderboard-mini-target';
      summary.appendChild(line);
    }
    line.textContent = targetText;
  }

  async function load() {
    if (loaded || loading) return;
    loading = true;
    try {
      const response = await fetch('/api/student/rankings-view/profile?branch=all&year=all', { headers: { Authorization: `Bearer ${token()}` } });
      const json = await response.json();
      if (!response.ok || !json.success) return;
      const rows = json.data?.rows || [];
      const me = json.data?.current;
      if (!me) return;
      const target = rows.find(row => row.rank < me.rank && Number(row.points) > Number(me.points));
      targetText = target ? `${fmt(Math.max(.01, Number(target.points) - Number(me.points)))} pts to college #${target.rank}` : 'College #1 👑';
      loaded = true;
      paint();
    } catch (_) {
      // Non-critical enhancement.
    } finally {
      loading = false;
    }
  }

  function boot() {
    const root = document.getElementById('dashboardContent') || document.body;
    new MutationObserver(() => {
      if (document.getElementById('rankingMySummary')) {
        paint();
        load();
      }
    }).observe(root, { childList:true, subtree:true });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();