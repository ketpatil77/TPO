(() => {
    const branches = ['all','AIML','CT','EE','ME','CE','E&C'];
    const years = ['all','First Year','Second Year','Third Year','Final Year'];
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const token = () => localStorage.getItem('tpo_token');
    const profileEvidenceVerified = row => Math.max(0, Number(row?.evidence_counts?.verified || 0) - 1);
    let installed = false;
    let rankingButton = null;

    function optionList(values, selected) {
        return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${value === 'all' ? 'All' : escapeHtml(value)}</option>`).join('');
    }

    function install() {
        if (installed || !document.body.classList.contains('student-dashboard-page')) return;
        const tabs = document.querySelector('.tabs-nav');
        const dashboardContent = document.getElementById('dashboardContent');
        if (!tabs || !dashboardContent) return;
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
                    <p>College-supplied CGPA counts automatically. Student-added achievements count only after TPO/TPC verification, using the same published rules for everyone.</p>
                    <div class="ranking-trust-strip">
                        <span>College CGPA authoritative</span><span>Automatic calculation</span><span>No manual rank editing</span><span id="rankingRuleVersion">Rules —</span>
                    </div>
                </div>
                <div id="rankingMySummary" class="ranking-my-summary"><span>Your position</span><strong>—</strong><small>Loading cohort</small></div>
            </div>
            <div class="ranking-toolbar glass-card">
                <div><label class="form-label" for="rankingBranch">Branch</label><select id="rankingBranch" class="form-select">${optionList(branches, 'all')}</select></div>
                <div><label class="form-label" for="rankingYear">Year</label><select id="rankingYear" class="form-select">${optionList(years, 'all')}</select></div>
                <button id="rankingRefresh" class="btn btn-secondary" type="button">Recalculate</button>
            </div>
            <div id="rankingPodium" class="ranking-podium"></div>
            <div class="ranking-list-heading"><div><span class="eyebrow">Full cohort</span><h3>Leaderboard</h3><p class="ranking-caption">Tap “Why this score?” to audit the exact points.</p></div><span id="rankingCount" class="badge badge-info">0 students</span></div>
            <div id="rankingList" class="ranking-list" aria-live="polite"><div class="panel-empty">Loading Profile Points…</div></div>
            <details class="glass-card ranking-rules" open><summary>Published scoring rules</summary><div id="rankingRules"></div></details>`;
        dashboardContent.appendChild(panel);

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
                <p id="overviewRankSubline">College CGPA plus verified profile achievements determine your Profile Points.</p>
                <div id="overviewRankTrust" class="overview-rank-trust"></div>
            </div>
            <div class="overview-rank-score"><span>Profile Points</span><strong id="overviewRankPoints">—</strong><small id="overviewRankEvidence">Verified profile evidence</small></div>
            <button id="overviewRankOpen" class="btn btn-secondary btn-sm" type="button">See exactly why</button>`;
        overview.prepend(card);
        document.getElementById('overviewRankOpen').addEventListener('click', () => {
            if (!rankingButton) return;
            switchTab('ranking', rankingButton);
            rankingButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            loadRanking();
        });
    }

    async function fetchRanking(params = '') {
        const response = await fetch(`/api/student/rankings/profile${params}`, { headers: { Authorization: `Bearer ${token()}` } });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Could not calculate ranking.');
        return json.data;
    }

    async function loadOverviewSpotlight() {
        const headline = document.getElementById('overviewRankHeadline');
        if (!headline) return;
        try {
            const [cohort, college] = await Promise.all([
                fetchRanking(''),
                fetchRanking('?branch=all&year=all')
            ]);
            const me = cohort.current;
            const collegeMe = college.current;
            if (!me) throw new Error('Your profile is outside the active ranking cohort.');
            const cohortSize = cohort.rows.length || 1;
            const percentile = Math.max(1, Math.ceil((me.rank / cohortSize) * 100));
            const branchLabel = cohort.filters.branch === 'all' ? 'college' : cohort.filters.branch;
            const yearLabel = cohort.filters.year === 'all' ? '' : ` ${cohort.filters.year}`;
            const headlineText = me.rank === 1
                ? `You’re #1 in ${branchLabel}${yearLabel}`
                : me.rank <= 3
                    ? `You’re Top 3 in ${branchLabel}${yearLabel}`
                    : `You’re in the Top ${percentile}% of ${branchLabel}${yearLabel}`;
            headline.textContent = headlineText;
            document.getElementById('overviewRankSubline').textContent = collegeMe
                ? `Cohort rank #${me.rank} of ${cohort.rows.length} · College-wide rank #${collegeMe.rank} of ${college.rows.length}`
                : `Cohort rank #${me.rank} of ${cohort.rows.length}`;
            document.getElementById('overviewRankPoints').textContent = Number(me.points || 0).toFixed(2).replace(/\.00$/, '');
            document.getElementById('overviewRankEvidence').textContent = `${profileEvidenceVerified(me)} verified profile records · ${me.evidence_counts?.pending || 0} pending`;
            document.getElementById('overviewRankTrust').innerHTML = `
                <span>CGPA from college</span>
                <span>${escapeHtml(cohort.rules?.version || 'Rules v2')}</span>
                <span>Auto-calculated</span>
                <span>Manual score edits disabled</span>`;
        } catch (error) {
            headline.textContent = 'Profile standing temporarily unavailable';
            document.getElementById('overviewRankSubline').textContent = error.message;
        }
    }

    async function loadRanking() {
        const list = document.getElementById('rankingList');
        if (!list) return;
        list.innerHTML = '<div class="panel-empty">Calculating Profile Points…</div>';
        const branchSelect = document.getElementById('rankingBranch');
        const yearSelect = document.getElementById('rankingYear');
        const params = new URLSearchParams();
        if (branchSelect.dataset.initialized === 'true') params.set('branch', branchSelect.value);
        if (yearSelect.dataset.initialized === 'true') params.set('year', yearSelect.value);
        try {
            const suffix = params.toString() ? `?${params}` : '';
            const data = await fetchRanking(suffix);
            render(data);
        } catch (error) {
            list.innerHTML = `<div class="panel-empty"><strong>Ranking unavailable</strong><p>${escapeHtml(error.message)}</p></div>`;
        }
    }

    function evidenceItem(item) {
        const links = (item.links || []).map((href, index) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${index ? 'Evidence link' : 'Open evidence'}</a>`).join('');
        let reason = item.reason || '';
        if (/verified academic record/i.test(reason)) reason = reason.replace(/Verified academic record/i, 'College-supplied academic record');
        if (/must be verified by TPO\/TPC before CGPA points count/i.test(reason)) reason = 'CGPA is supplied by the college and counts automatically.';
        return `<div class="ranking-evidence-item">
            <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(reason)}</small>${links ? `<div class="ranking-evidence-links">${links}</div>` : ''}</div>
            <div class="ranking-evidence-points">+${Number(item.points || 0).toFixed(2).replace(/\.00$/, '')}</div>
        </div>`;
    }

    function explanationGroups(row) {
        return Object.entries(row.explanations || {}).map(([key, items]) => {
            const categoryPoints = row.breakdown?.[key] || 0;
            const body = items?.length ? items.map(evidenceItem).join('') : '<p class="ranking-empty-reason">No verified evidence currently contributes points here.</p>';
            return `<section class="ranking-reason-group">
                <div class="ranking-reason-head"><strong>${escapeHtml(key.replace(/_/g, ' '))}</strong><span>${Number(categoryPoints).toFixed(2).replace(/\.00$/, '')} pts</span></div>
                ${body}
            </section>`;
        }).join('');
    }

    function render(data) {
        const branchSelect = document.getElementById('rankingBranch');
        const yearSelect = document.getElementById('rankingYear');
        if (branches.includes(data.filters.branch) && branchSelect.dataset.initialized !== 'true') branchSelect.value = data.filters.branch;
        if (years.includes(data.filters.year) && yearSelect.dataset.initialized !== 'true') yearSelect.value = data.filters.year;
        branchSelect.dataset.initialized = yearSelect.dataset.initialized = 'true';
        document.getElementById('rankingRuleVersion').textContent = `Rules ${data.rules?.version || 'v2'}`;

        const current = data.current;
        const summary = document.getElementById('rankingMySummary');
        summary.innerHTML = current
            ? `<span>Your position</span><strong>#${current.rank}</strong><small>${current.points} points · ${profileEvidenceVerified(current)} verified profile records · CGPA from college</small>`
            : `<span>Your position</span><strong>—</strong><small>You are outside this selected cohort.</small>`;

        const top = data.rows.slice(0, 3);
        document.getElementById('rankingPodium').innerHTML = top.map((row, index) => `<article class="glass-card podium-card podium-${index + 1}">
            <span class="podium-rank">#${row.rank}</span><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.branch)} · ${escapeHtml(row.year || '—')}</p><strong>${row.points} pts</strong>
            <small>${profileEvidenceVerified(row)} verified profile records · college CGPA</small>
        </article>`).join('');
        document.getElementById('rankingCount').textContent = `${data.rows.length} students`;

        document.getElementById('rankingList').innerHTML = data.rows.length ? data.rows.map(row => `
            <article class="glass-card ranking-row ${row.is_me ? 'ranking-row-me' : ''}">
                <div class="ranking-rank">#${row.rank}</div>
                <div class="ranking-person"><strong>${escapeHtml(row.name)}${row.is_me ? ' · You' : ''}</strong><span>${escapeHtml(row.branch)} · ${escapeHtml(row.year || '—')}</span><small>${profileEvidenceVerified(row)} verified profile records · ${row.evidence_counts?.pending || 0} pending</small></div>
                <div class="ranking-points"><strong>${row.points}</strong><span>Profile Points</span></div>
                <details class="ranking-breakdown ranking-why"><summary>Why this score?</summary>
                    <div class="ranking-breakdown-grid">${Object.entries(row.breakdown).map(([key, value]) => `<span><small>${escapeHtml(key.replace(/_/g, ' '))}</small><strong>${value}</strong></span>`).join('')}</div>
                    <div class="ranking-explanation-list">${explanationGroups(row)}</div>
                </details>
            </article>`).join('') : '<div class="panel-empty">No students in this cohort.</div>';

        const rules = data.rules || {};
        document.getElementById('rankingRules').innerHTML = `<div class="ranking-rule-banner"><strong>${escapeHtml(rules.version || '')}</strong><span>CGPA is college-supplied and authoritative. ${escapeHtml(rules.note || '')}</span></div>${Object.entries(rules).filter(([key]) => !['status','note','version'].includes(key)).map(([key, value]) => `<div class="ranking-rule"><strong>${escapeHtml(key.replace(/_/g, ' '))}</strong><span>${escapeHtml(value)}</span></div>`).join('')}`;
        loadOverviewSpotlight();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();