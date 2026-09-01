(() => {
  const branches = ['all','AIML','CT','EE','ME','CE','E&C'];
  const years = ['all','First Year','Second Year','Third Year','Final Year'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const token = () => localStorage.getItem('tpo_token');
  const categoryOrder = ['academics','certificates','projects','research','competitions','internships','skills','profile'];
  let installed = false;
  let rankingButton = null;

  function options(values) {
    return values.map(value => `<option value="${esc(value)}">${value === 'all' ? 'All' : esc(value)}</option>`).join('');
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
    rankingButton.textContent = 'Profile Ranking';
    const competitionTab = tabs.querySelector('[aria-controls="tab-competitions"]');
    const researchTab = tabs.querySelector('[aria-controls="tab-research"]');
    (competitionTab || researchTab || tabs.lastElementChild)?.after(rankingButton);

    const panel = document.createElement('div');
    panel.id = 'tab-ranking';
    panel.className = 'tab-content';
    panel.setAttribute('role', 'tabpanel');
    panel.innerHTML = `
      <div class="ranking-hero glass-card ranking-trust-hero">
        <div>
          <span class="eyebrow">Transparent Profile Points</span>
          <h2>Student Profile Leaderboard</h2>
          <p>CGPA and profile achievements count automatically from the published formula. Only competition points wait for TPO/TPC verification.</p>
          <div class="ranking-trust-strip"><span>College CGPA automatic</span><span>Profile records auto-counted</span><span>Competitions verified</span><span id="rankingRuleVersion">Rules —</span></div>
        </div>
        <div id="rankingMySummary" class="ranking-my-summary"><span>Your position</span><strong>—</strong><small>Loading cohort</small></div>
      </div>
      <div class="ranking-toolbar glass-card">
        <div><label class="form-label" for="rankingBranch">Branch</label><select id="rankingBranch" class="form-select">${options(branches)}</select></div>
        <div><label class="form-label" for="rankingYear">Year</label><select id="rankingYear" class="form-select">${options(years)}</select></div>
        <button id="rankingRefresh" class="btn btn-secondary" type="button">Recalculate</button>
      </div>
      <div id="rankingPodium" class="ranking-podium"></div>
      <div class="ranking-list-heading"><div><span class="eyebrow">Full cohort</span><h3>Leaderboard</h3><p class="ranking-caption">Tap “Why this score?” to audit every point. Only pending competitions are excluded until verified.</p></div><span id="rankingCount" class="badge badge-info">0 students</span></div>
      <div id="rankingList" class="ranking-list" aria-live="polite"><div class="panel-empty">Loading Profile Points…</div></div>
      <details class="glass-card ranking-rules" open><summary>Published scoring rules</summary><div id="rankingRules"></div></details>`;
    dashboard.appendChild(panel);

    rankingButton.addEventListener('click', () => { switchTab('ranking', rankingButton); loadRanking(); });
    document.getElementById('rankingBranch').addEventListener('change', loadRanking);
    document.getElementById('rankingYear').addEventListener('change', loadRanking);
    document.getElementById('rankingRefresh').addEventListener('click', loadRanking);

    installOverviewSpotlight();
    loadOverviewSpotlight();
    if (new URLSearchParams(location.search).get('tab') === 'ranking') {
      switchTab('ranking', rankingButton);
      loadRanking();
    }
  }

  function installOverviewSpotlight() {
    const overview = document.getElementById('tab-overview');
    if (!overview || document.getElementById('overviewRankSpotlight')) return;
    const card = document.createElement('section');
    card.id = 'overviewRankSpotlight';
    card.className = 'glass-card overview-rank-spotlight';
    card.innerHTML = `
      <div class="overview-rank-copy">
        <span class="eyebrow">Profile standing</span>
        <h2 id="overviewRankHeadline">Calculating your standing…</h2>
        <p id="overviewRankSubline">Your Profile Points update automatically as you build your profile.</p>
        <div id="overviewRankTrust" class="overview-rank-trust"></div>
      </div>
      <div class="overview-rank-score"><span>Profile Points</span><strong id="overviewRankPoints">—</strong><small id="overviewRankEvidence">Loading competition status</small></div>
      <button id="overviewRankOpen" class="btn btn-secondary btn-sm" type="button">See exactly why</button>`;
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
      document.getElementById('overviewRankTrust').innerHTML = `<span>CGPA from college</span><span>${esc(cohort.rules?.version || 'Rules')}</span><span>Profile auto-counted</span><span>${pending} competition pending</span>`;
    } catch (error) {
      headline.textContent = 'Profile standing temporarily unavailable';
      document.getElementById('overviewRankSubline').textContent = error.message;
    }
  }

  async function loadRanking() {
    const list = document.getElementById('rankingList');
    if (!list) return;
    list.innerHTML = '<div class="panel-empty">Calculating Profile Points…</div>';
    const branch = document.getElementById('rankingBranch');
    const year = document.getElementById('rankingYear');
    const params = new URLSearchParams();
    if (branch.dataset.initialized === 'true') params.set('branch', branch.value);
    if (year.dataset.initialized === 'true') params.set('year', year.value);
    try {
      const data = await fetchRanking(params.toString() ? `?${params}` : '');
      render(data);
    } catch (error) {
      list.innerHTML = `<div class="panel-empty"><strong>Ranking unavailable</strong><p>${esc(error.message)}</p></div>`;
    }
  }

  function linksHtml(item) {
    return (item.links || []).map((href, index) => `<a href="${esc(href)}" target="_blank" rel="noopener">${index ? 'Evidence link' : 'Open evidence'}</a>`).join('');
  }

  function evidenceItem(item, pendingCompetition = false) {
    const links = linksHtml(item);
    return `<div class="ranking-evidence-item ${pendingCompetition ? 'ranking-evidence-pending' : ''}">
      <div><div class="ranking-evidence-title"><strong>${esc(item.label)}</strong>${pendingCompetition ? '<span class="pending-point-pill">Competition pending</span>' : ''}</div><small>${esc(item.reason || '')}</small>${links ? `<div class="ranking-evidence-links">${links}</div>` : ''}</div>
      <div class="ranking-evidence-points ${pendingCompetition ? 'pending' : ''}">+${fmt(item.points)}${pendingCompetition ? '<small> after verification</small>' : ''}</div>
    </div>`;
  }

  function groupHtml(row, key) {
    const earned = Number(row.breakdown?.[key] || 0);
    const waiting = key === 'competitions' ? Number(row.pending_breakdown?.competitions || 0) : 0;
    const earnedItems = row.explanations?.[key] || [];
    const pendingItems = key === 'competitions' ? (row.pending_explanations?.competitions || []) : [];
    const earnedBody = earnedItems.length ? earnedItems.map(item => evidenceItem(item, false)).join('') : '';
    const pendingBody = pendingItems.length ? `<div class="pending-evidence-divider"><span>Competitions waiting for verification</span><strong>+${fmt(waiting)} possible</strong></div>${pendingItems.map(item => evidenceItem(item, true)).join('')}` : '';
    const empty = !earnedItems.length && !pendingItems.length ? '<p class="ranking-empty-reason">No records in this category yet.</p>' : '';
    return `<section class="ranking-reason-group ${waiting ? 'has-pending' : ''}">
      <div class="ranking-reason-head"><strong>${esc(key.replace(/_/g,' '))}</strong><div><span>${fmt(earned)} pts</span>${waiting ? `<em>+${fmt(waiting)} competition pending</em>` : ''}</div></div>
      ${earnedBody}${pendingBody}${empty}
    </section>`;
  }

  function categoryGrid(row) {
    return categoryOrder.map(key => {
      const earned = Number(row.breakdown?.[key] || 0);
      const waiting = key === 'competitions' ? Number(row.pending_breakdown?.competitions || 0) : 0;
      return `<span class="ranking-category-score ${waiting ? 'has-pending' : ''}"><small>${esc(key)}</small><strong>${fmt(earned)}</strong>${waiting ? `<em>+${fmt(waiting)} pending</em>` : '<em>counted</em>'}</span>`;
    }).join('');
  }

  function rowHtml(row) {
    const pendingCompetitions = row.competition_counts?.pending || 0;
    return `<article class="glass-card ranking-row ${row.is_me ? 'ranking-row-me' : ''}">
      <div class="ranking-rank">#${row.rank}</div>
      <div class="ranking-person"><strong>${esc(row.name)}${row.is_me ? ' · You' : ''}</strong><span>${esc(row.branch)} · ${esc(row.year || '—')}</span><small>${pendingCompetitions ? `${pendingCompetitions} competition${pendingCompetitions === 1 ? '' : 's'} pending verification` : 'Profile points fully counted'}</small></div>
      <div class="ranking-points"><strong>${fmt(row.points)}</strong><span>Profile Points</span>${row.pending_points ? `<small>+${fmt(row.pending_points)} competition points possible</small>` : '<small>Current total</small>'}</div>
      <details class="ranking-breakdown ranking-why"><summary>Why this score?</summary>
        <div class="ranking-score-explainer"><strong>${fmt(row.points)} points</strong><span>Everything here counts automatically except unverified competitions.</span>${row.pending_points ? `<strong class="potential">+${fmt(row.pending_points)} competition pending</strong><span>${fmt(row.potential_points)} if those competitions are verified</span>` : ''}</div>
        <div class="ranking-breakdown-grid ranking-breakdown-grid-v3">${categoryGrid(row)}</div>
        <div class="ranking-explanation-list">${categoryOrder.map(key => groupHtml(row, key)).join('')}</div>
      </details>
    </article>`;
  }

  function render(data) {
    const branch = document.getElementById('rankingBranch');
    const year = document.getElementById('rankingYear');
    if (branches.includes(data.filters.branch) && branch.dataset.initialized !== 'true') branch.value = data.filters.branch;
    if (years.includes(data.filters.year) && year.dataset.initialized !== 'true') year.value = data.filters.year;
    branch.dataset.initialized = year.dataset.initialized = 'true';
    document.getElementById('rankingRuleVersion').textContent = `Rules ${data.rules?.version || 'v3'}`;

    const current = data.current;
    document.getElementById('rankingMySummary').innerHTML = current
      ? `<span>Your position</span><strong>#${current.rank}</strong><small><b>${fmt(current.points)} points</b>${current.pending_points ? ` · +${fmt(current.pending_points)} competition points pending` : ''}</small>`
      : '<span>Your position</span><strong>—</strong><small>You are outside this selected cohort.</small>';

    document.getElementById('rankingPodium').innerHTML = data.rows.slice(0,3).map((row, index) => `<article class="glass-card podium-card podium-${index+1}"><span class="podium-rank">#${row.rank}</span><h3>${esc(row.name)}</h3><p>${esc(row.branch)} · ${esc(row.year || '—')}</p><strong>${fmt(row.points)} pts</strong>${row.pending_points ? `<small>+${fmt(row.pending_points)} competition points pending</small>` : '<small>Current total</small>'}</article>`).join('');
    document.getElementById('rankingCount').textContent = `${data.rows.length} students`;
    document.getElementById('rankingList').innerHTML = data.rows.length ? data.rows.map(rowHtml).join('') : '<div class="panel-empty">No students in this cohort.</div>';

    const rules = data.rules || {};
    document.getElementById('rankingRules').innerHTML = `<div class="ranking-rule-banner"><strong>${esc(rules.version || '')}</strong><span>${esc(rules.note || '')}</span></div>${Object.entries(rules).filter(([key]) => !['version','note'].includes(key)).map(([key,value]) => `<div class="ranking-rule"><strong>${esc(key.replace(/_/g,' '))}</strong><span>${esc(value)}</span></div>`).join('')}`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();