(() => {
  const branches = ['all','AIML','CT','EE','ME','CE','E&C'];
  const years = ['all','First Year','Second Year','Third Year','Final Year'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const token = () => localStorage.getItem('tpo_token');
  const categoryOrder = ['academics','certificates','projects','research','competitions','internships','skills','profile'];
  let installed = false;
  let rankingButton = null;
  let defaultBranch = '';
  let defaultYear = '';

  function options(values) {
    return values.map(value => `<option value="${esc(value)}">${value === 'all' ? 'All' : esc(value)}</option>`).join('');
  }

  function initials(name) {
    const parts = String(name || 'Student').trim().split(/\s+/).filter(Boolean);
    return esc((parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0,2) || 'ST').toUpperCase());
  }

  function install() {
    if (installed || !document.body.classList.contains('student-dashboard-page')) return;
    const tabs = document.querySelector('.tabs-nav');
    const dashboard = document.getElementById('dashboardContent');
    if (!tabs || !dashboard) return;
    installed = true;

    rankingButton = document.createElement('button');
    rankingButton.className = 'tab-btn';
    rankingButton.type = 'button';
    rankingButton.setAttribute('role', 'tab');
    rankingButton.setAttribute('aria-selected', 'false');
    rankingButton.setAttribute('aria-controls', 'tab-ranking');
    rankingButton.textContent = 'Ranking';
    const competitionTab = tabs.querySelector('[aria-controls="tab-competitions"]');
    const researchTab = tabs.querySelector('[aria-controls="tab-research"]');
    (competitionTab || researchTab || tabs.lastElementChild)?.after(rankingButton);

    const panel = document.createElement('div');
    panel.id = 'tab-ranking';
    panel.className = 'tab-content';
    panel.setAttribute('role', 'tabpanel');
    panel.innerHTML = `
      <div class="leaderboard-shell">
        <section class="glass-card leaderboard-hero">
          <div>
            <div class="leaderboard-titleline"><span class="leaderboard-title-icon" aria-hidden="true">🏆</span><div><span class="eyebrow">Student Profile Points</span><h2>Student Leaderboard</h2></div></div>
            <p>See where you stand, understand every point, and build a stronger placement profile.</p>
            <div class="leaderboard-motto"><b>Compete</b> today · <b>Improve</b> tomorrow · <b>Inspire</b> always.</div>
          </div>
          <div id="rankingMySummary" class="leaderboard-my-mini"><span>Your rank</span><strong>—</strong><small>Loading standings</small></div>
        </section>

        <section class="glass-card leaderboard-toolbar" aria-label="Leaderboard filters">
          <div class="leaderboard-scopes" role="group" aria-label="Quick leaderboard scope">
            <button class="leaderboard-scope" type="button" data-scope="college">College</button>
            <button class="leaderboard-scope" type="button" data-scope="branch">My Branch</button>
            <button class="leaderboard-scope" type="button" data-scope="year">My Year</button>
          </div>
          <div><label class="form-label" for="rankingBranch">Branch</label><select id="rankingBranch" class="form-select">${options(branches)}</select></div>
          <div><label class="form-label" for="rankingYear">Year</label><select id="rankingYear" class="form-select">${options(years)}</select></div>
          <button id="rankingRefresh" class="btn btn-secondary" type="button">Refresh</button>
        </section>

        <div id="rankingPodium" class="leaderboard-podium" aria-label="Top three students"></div>

        <div class="leaderboard-section-heading">
          <div><span class="eyebrow">Current standings</span><h3>Leaderboard</h3><p>Open any row to audit the exact scoring breakdown.</p></div>
          <span id="rankingCount" class="badge badge-info">0 students</span>
        </div>

        <section class="glass-card leaderboard-table-card">
          <div class="leaderboard-table-head" aria-hidden="true"><span>Rank</span><span>Student</span><span>Branch</span><span>Year</span><span style="text-align:right">Points</span></div>
          <div id="rankingList" aria-live="polite"><div class="leaderboard-empty">Calculating Profile Points…</div></div>
        </section>

        <div id="rankingPersonalBar" class="glass-card leaderboard-personal-bar" hidden></div>

        <details class="glass-card ranking-rules"><summary>How Profile Points work</summary><div id="rankingRules"></div></details>
      </div>`;
    dashboard.appendChild(panel);

    rankingButton.addEventListener('click', () => { switchTab('ranking', rankingButton); loadRanking(); });
    document.getElementById('rankingBranch').addEventListener('change', () => { setScopeActive('custom'); loadRanking(); });
    document.getElementById('rankingYear').addEventListener('change', () => { setScopeActive('custom'); loadRanking(); });
    document.getElementById('rankingRefresh').addEventListener('click', loadRanking);
    panel.querySelectorAll('.leaderboard-scope').forEach(button => button.addEventListener('click', () => applyScope(button.dataset.scope)));

    installOverviewSpotlight();
    loadOverviewSpotlight();
    if (new URLSearchParams(location.search).get('tab') === 'ranking') {
      switchTab('ranking', rankingButton);
      loadRanking();
    }
  }

  function setScopeActive(scope) {
    document.querySelectorAll('#tab-ranking .leaderboard-scope').forEach(button => button.classList.toggle('active', button.dataset.scope === scope));
  }

  function applyScope(scope) {
    const branch = document.getElementById('rankingBranch');
    const year = document.getElementById('rankingYear');
    if (!branch || !year) return;
    if (scope === 'college') { branch.value = 'all'; year.value = 'all'; }
    if (scope === 'branch') { branch.value = branches.includes(defaultBranch) ? defaultBranch : 'all'; year.value = 'all'; }
    if (scope === 'year') { branch.value = 'all'; year.value = years.includes(defaultYear) ? defaultYear : 'all'; }
    branch.dataset.initialized = year.dataset.initialized = 'true';
    setScopeActive(scope);
    loadRanking();
  }

  function installOverviewSpotlight() {
    const overview = document.getElementById('tab-overview');
    if (!overview || document.getElementById('overviewRankSpotlight')) return;
    const card = document.createElement('section');
    card.id = 'overviewRankSpotlight';
    card.className = 'glass-card overview-rank-spotlight';
    card.innerHTML = `
      <div class="overview-rank-copy"><span class="eyebrow">Profile standing</span><h2 id="overviewRankHeadline">Calculating your standing…</h2><p id="overviewRankSubline">Your Profile Points update automatically as you build your profile.</p><div id="overviewRankTrust" class="overview-rank-trust"></div></div>
      <div class="overview-rank-score"><span>Profile Points</span><strong id="overviewRankPoints">—</strong><small id="overviewRankEvidence">Loading competition status</small></div>
      <button id="overviewRankOpen" class="btn btn-secondary btn-sm" type="button">Open leaderboard</button>`;
    overview.prepend(card);
    document.getElementById('overviewRankOpen').addEventListener('click', () => {
      if (!rankingButton) return;
      switchTab('ranking', rankingButton);
      rankingButton.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
      loadRanking();
    });
  }

  async function fetchRanking(params = '') {
    const response = await fetch(`/api/student/rankings-view/profile${params}`, { headers: { Authorization: `Bearer ${token()}` } });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Could not calculate ranking.');
    return json.data;
  }

  async function loadOverviewSpotlight() {
    const headline = document.getElementById('overviewRankHeadline');
    if (!headline) return;
    try {
      const [cohort, college] = await Promise.all([fetchRanking(''), fetchRanking('?branch=all&year=all')]);
      const me = cohort.current;
      const collegeMe = college.current;
      if (!me) throw new Error('Your profile is outside the active ranking cohort.');
      const size = cohort.rows.length || 1;
      const percentile = Math.max(1, Math.ceil((me.rank / size) * 100));
      const branchLabel = cohort.filters.branch === 'all' ? 'college' : cohort.filters.branch;
      const yearLabel = cohort.filters.year === 'all' ? '' : ` ${cohort.filters.year}`;
      headline.textContent = me.rank === 1 ? `You’re #1 in ${branchLabel}${yearLabel}` : me.rank <= 3 ? `You’re Top 3 in ${branchLabel}${yearLabel}` : `You’re in the Top ${percentile}% of ${branchLabel}${yearLabel}`;
      document.getElementById('overviewRankSubline').textContent = collegeMe ? `Cohort rank #${me.rank} of ${cohort.rows.length} · College-wide rank #${collegeMe.rank} of ${college.rows.length}` : `Cohort rank #${me.rank} of ${cohort.rows.length}`;
      document.getElementById('overviewRankPoints').textContent = fmt(me.points);
      const pending = me.competition_counts?.pending || 0;
      document.getElementById('overviewRankEvidence').textContent = pending ? `${pending} competition${pending === 1 ? '' : 's'} awaiting verification · +${fmt(me.pending_points)} possible` : 'All current competition points settled';
      document.getElementById('overviewRankTrust').innerHTML = `<span>CGPA automatic</span><span>${esc(cohort.rules?.version || 'Rules')}</span><span>Profile auto-counted</span>`;
    } catch (error) {
      headline.textContent = 'Profile standing temporarily unavailable';
      document.getElementById('overviewRankSubline').textContent = error.message;
    }
  }

  async function loadRanking() {
    const list = document.getElementById('rankingList');
    if (!list) return;
    list.innerHTML = '<div class="leaderboard-empty">Calculating Profile Points…</div>';
    const branch = document.getElementById('rankingBranch');
    const year = document.getElementById('rankingYear');
    const params = new URLSearchParams();
    if (branch.dataset.initialized === 'true') params.set('branch', branch.value);
    if (year.dataset.initialized === 'true') params.set('year', year.value);
    try {
      render(await fetchRanking(params.toString() ? `?${params}` : ''));
    } catch (error) {
      list.innerHTML = `<div class="leaderboard-empty"><strong>Ranking unavailable</strong><p>${esc(error.message)}</p></div>`;
    }
  }

  function linksHtml(item) {
    return (item.links || []).map((href, index) => `<a href="${esc(href)}" target="_blank" rel="noopener">${index ? 'Evidence link' : 'Open evidence'}</a>`).join('');
  }

  function evidenceItem(item, pendingCompetition = false) {
    const links = linksHtml(item);
    return `<div class="ranking-evidence-item ${pendingCompetition ? 'ranking-evidence-pending' : ''}"><div><div class="ranking-evidence-title"><strong>${esc(item.label)}</strong>${pendingCompetition ? '<span class="pending-point-pill">Competition pending</span>' : ''}</div><small>${esc(item.reason || '')}</small>${links ? `<div class="ranking-evidence-links">${links}</div>` : ''}</div><div class="ranking-evidence-points ${pendingCompetition ? 'pending' : ''}">+${fmt(item.points)}${pendingCompetition ? '<small> after verification</small>' : ''}</div></div>`;
  }

  function groupHtml(row, key) {
    const earned = Number(row.breakdown?.[key] || 0);
    const waiting = key === 'competitions' ? Number(row.pending_breakdown?.competitions || 0) : 0;
    const earnedItems = row.explanations?.[key] || [];
    const pendingItems = key === 'competitions' ? (row.pending_explanations?.competitions || []) : [];
    const earnedBody = earnedItems.length ? earnedItems.map(item => evidenceItem(item, false)).join('') : '';
    const pendingBody = pendingItems.length ? `<div class="pending-evidence-divider"><span>Competitions waiting for verification</span><strong>+${fmt(waiting)} possible</strong></div>${pendingItems.map(item => evidenceItem(item, true)).join('')}` : '';
    const empty = !earnedItems.length && !pendingItems.length ? '<p class="ranking-empty-reason">No records in this category yet.</p>' : '';
    return `<section class="ranking-reason-group ${waiting ? 'has-pending' : ''}"><div class="ranking-reason-head"><strong>${esc(key.replace(/_/g,' '))}</strong><div><span>${fmt(earned)} pts</span>${waiting ? `<em>+${fmt(waiting)} competition pending</em>` : ''}</div></div>${earnedBody}${pendingBody}${empty}</section>`;
  }

  function categoryGrid(row) {
    return categoryOrder.map(key => {
      const earned = Number(row.breakdown?.[key] || 0);
      const waiting = key === 'competitions' ? Number(row.pending_breakdown?.competitions || 0) : 0;
      return `<span class="ranking-category-score ${waiting ? 'has-pending' : ''}"><small>${esc(key)}</small><strong>${fmt(earned)}</strong>${waiting ? `<em>+${fmt(waiting)} pending</em>` : '<em>counted</em>'}</span>`;
    }).join('');
  }

  function detailsHtml(row) {
    return `<details class="leaderboard-entry-details"><summary>Why this score?</summary><div class="ranking-score-explainer"><strong>${fmt(row.points)} points</strong><span>Everything here counts automatically except unverified competitions.</span>${row.pending_points ? `<strong class="potential">+${fmt(row.pending_points)} competition pending</strong><span>${fmt(row.potential_points)} if verified</span>` : ''}</div><div class="ranking-breakdown-grid ranking-breakdown-grid-v3">${categoryGrid(row)}</div><div class="ranking-explanation-list">${categoryOrder.map(key => groupHtml(row, key)).join('')}</div></details>`;
  }

  function entryHtml(row) {
    const pending = row.competition_counts?.pending || 0;
    return `<article class="leaderboard-entry ${row.is_me ? 'is-me' : ''}"><div class="leaderboard-entry-main"><div class="leaderboard-rankno">#${row.rank}</div><div class="leaderboard-student"><span class="leaderboard-avatar" aria-hidden="true">${initials(row.name)}</span><div class="leaderboard-student-copy"><strong>${esc(row.name)}${row.is_me ? ' · You' : ''}</strong><small>${esc(row.branch)} · ${esc(row.year || '—')}${pending ? ` · ${pending} competition pending` : ''}</small></div></div><div class="leaderboard-cell branch">${esc(row.branch)}</div><div class="leaderboard-cell year">${esc(row.year || '—')}</div><div class="leaderboard-points-cell">${fmt(row.points)} pts</div></div>${detailsHtml(row)}</article>`;
  }

  function podiumCard(row, place) {
    if (!row) return '<div></div>';
    const klass = place === 1 ? 'first' : place === 2 ? 'second' : 'third';
    const label = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';
    return `<article class="glass-card leaderboard-podium-card ${klass} ${row.is_me ? 'is-me' : ''}"><span class="leaderboard-medal">${label}</span><span class="leaderboard-avatar" aria-hidden="true">${initials(row.name)}</span><h3>${esc(row.name)}${row.is_me ? ' · You' : ''}</h3><p>${esc(row.branch)} · ${esc(row.year || '—')}</p><span class="leaderboard-podium-points">${fmt(row.points)} pts</span><small>${row.pending_points ? `+${fmt(row.pending_points)} competition pending` : 'Current total'}</small></article>`;
  }

  function inferScope(data) {
    if (data.filters.branch === 'all' && data.filters.year === 'all') return 'college';
    if (defaultBranch && data.filters.branch === defaultBranch && data.filters.year === 'all') return 'branch';
    if (defaultYear && data.filters.branch === 'all' && data.filters.year === defaultYear) return 'year';
    return 'custom';
  }

  function render(data) {
    const branch = document.getElementById('rankingBranch');
    const year = document.getElementById('rankingYear');
    if (branches.includes(data.filters.branch) && branch.dataset.initialized !== 'true') branch.value = data.filters.branch;
    if (years.includes(data.filters.year) && year.dataset.initialized !== 'true') year.value = data.filters.year;
    branch.dataset.initialized = year.dataset.initialized = 'true';

    const current = data.current;
    const meAnywhere = data.rows.find(row => row.is_me);
    if (meAnywhere) {
      defaultBranch ||= meAnywhere.branch || '';
      defaultYear ||= meAnywhere.year || '';
    }
    setScopeActive(inferScope(data));

    document.getElementById('rankingMySummary').innerHTML = current ? `<span>Your rank</span><strong>#${current.rank}</strong><small>${fmt(current.points)} points · ${data.rows.length} students</small>` : '<span>Your rank</span><strong>—</strong><small>Outside selected group</small>';

    const top = data.rows.slice(0,3);
    const podiumOrder = top.length >= 3 ? [[top[1],2],[top[0],1],[top[2],3]] : top.map((row,index) => [row,index+1]);
    document.getElementById('rankingPodium').innerHTML = podiumOrder.map(([row,place]) => podiumCard(row,place)).join('');
    document.getElementById('rankingCount').textContent = `${data.rows.length} students`;
    document.getElementById('rankingList').innerHTML = data.rows.length ? data.rows.map(entryHtml).join('') : '<div class="leaderboard-empty">No students in this group.</div>';

    const personal = document.getElementById('rankingPersonalBar');
    if (current) {
      personal.hidden = false;
      personal.innerHTML = `<div class="leaderboard-personal-trophy" aria-hidden="true">🏆</div><div class="leaderboard-personal-stat"><span>Your rank in this view</span><strong>#${current.rank} / ${data.rows.length}</strong></div><div class="leaderboard-personal-stat points"><span>Your Profile Points</span><strong>${fmt(current.points)} pts</strong></div>`;
    } else personal.hidden = true;

    const rules = data.rules || {};
    document.getElementById('rankingRules').innerHTML = `<div class="ranking-rule-banner"><strong>${esc(rules.version || '')}</strong><span>${esc(rules.note || '')}</span></div>${Object.entries(rules).filter(([key]) => !['version','note'].includes(key)).map(([key,value]) => `<div class="ranking-rule"><strong>${esc(key.replace(/_/g,' '))}</strong><span>${esc(value)}</span></div>`).join('')}`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();