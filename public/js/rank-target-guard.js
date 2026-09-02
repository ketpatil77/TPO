(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  let activeSummary = null;
  let requestSerial = 0;
  let scheduled = false;

  const token = () => localStorage.getItem('tpo_token');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const fmt = value => Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');

  function keepSingleCard(summary) {
    const cards = [...summary.querySelectorAll('.rank-next-card')];
    if (!cards.length) return null;
    cards.slice(1).forEach(card => card.remove());
    return cards[0];
  }

  async function renderTarget(summary, card, serial) {
    try {
      const response = await fetch('/api/student/rankings-view/profile?branch=all&year=all', {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Ranking unavailable');
      if (serial !== requestSerial || summary !== activeSummary || !summary.isConnected || !card.isConnected) return;

      const data = json.data || {};
      const me = data.current;
      if (!me) {
        card.remove();
        return;
      }

      const target = (data.rows || []).find(row => row.rank < me.rank && Number(row.points) > Number(me.points));
      if (!target) {
        card.innerHTML = '<div><strong>You’re #1 college-wide 👑</strong><br><span>Defend it by keeping your profile current.</span></div>';
      } else {
        const gap = Math.max(.01, Number(target.points) - Number(me.points));
        const pct = Math.max(8, Math.min(96, Math.round(Number(me.points) / (Number(target.points) || 1) * 100)));
        card.innerHTML = `<div><strong>${fmt(gap)} more points to challenge #${target.rank}</strong><br><span>${esc(target.name)}</span></div><div class="rank-next-progress"><i style="width:${pct}%"></i></div>`;
      }
      card.removeAttribute('aria-busy');
      keepSingleCard(summary);
    } catch (_) {
      if (serial === requestSerial && card.isConnected) card.remove();
    }
  }

  function ensureSingleTarget() {
    scheduled = false;
    const summary = document.getElementById('rankingMySummary');
    if (!summary) {
      activeSummary = null;
      return;
    }

    let card = keepSingleCard(summary);
    if (summary === activeSummary && card) return;

    activeSummary = summary;
    requestSerial += 1;
    const serial = requestSerial;

    if (!card) {
      card = document.createElement('div');
      card.className = 'rank-next-card';
      card.setAttribute('aria-busy', 'true');
      card.innerHTML = '<div><strong>Calculating next rank target…</strong></div>';
      summary.appendChild(card);
    }

    keepSingleCard(summary);
    renderTarget(summary, card, serial);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(ensureSingleTarget);
  }

  function boot() {
    const root = document.getElementById('dashboardContent') || document.body;
    new MutationObserver(() => {
      const summary = document.getElementById('rankingMySummary');
      if (summary) keepSingleCard(summary);
      schedule();
    }).observe(root, { childList: true, subtree: true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
