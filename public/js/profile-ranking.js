(() => {
    const branches = ['all','AIML','CT','EE','ME','CE','E&C'];
    const years = ['all','First Year','Second Year','Third Year','Final Year'];
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const token = () => localStorage.getItem('tpo_token');
    let installed = false;

    function optionList(values, selected) {
        return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${value === 'all' ? 'All' : escapeHtml(value)}</option>`).join('');
    }

    function install() {
        if (installed || !document.body.classList.contains('student-dashboard-page')) return;
        const tabs = document.querySelector('.tabs-nav');
        const dashboardContent = document.getElementById('dashboardContent');
        if (!tabs || !dashboardContent) return;
        installed = true;

        const button = document.createElement('button');
        button.className = 'tab-btn';
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', 'tab-ranking');
        button.textContent = 'Profile Ranking';
        const competitionTab = tabs.querySelector('[aria-controls="tab-competitions"]');
        const researchTab = tabs.querySelector('[aria-controls="tab-research"]');
        (competitionTab || researchTab || tabs.lastElementChild)?.after(button);

        const panel = document.createElement('div');
        panel.id = 'tab-ranking';
        panel.className = 'tab-content';
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = `
            <div class="ranking-hero glass-card">
                <div><span class="eyebrow">Profile Points · Beta</span><h2>Student Profile Leaderboard</h2><p>Ranked from academics and profile evidence. Competition points count only after TPO/TPC verification.</p></div>
                <div id="rankingMySummary" class="ranking-my-summary"><span>Your position</span><strong>—</strong><small>Loading cohort</small></div>
            </div>
            <div class="ranking-toolbar glass-card">
                <div><label class="form-label" for="rankingBranch">Branch</label><select id="rankingBranch" class="form-select">${optionList(branches, 'all')}</select></div>
                <div><label class="form-label" for="rankingYear">Year</label><select id="rankingYear" class="form-select">${optionList(years, 'all')}</select></div>
                <button id="rankingRefresh" class="btn btn-secondary" type="button">Refresh ranking</button>
            </div>
            <div id="rankingPodium" class="ranking-podium"></div>
            <div class="ranking-list-heading"><div><span class="eyebrow">Full cohort</span><h3>Leaderboard</h3></div><span id="rankingCount" class="badge badge-info">0 students</span></div>
            <div id="rankingList" class="ranking-list" aria-live="polite"><div class="panel-empty">Loading profile points…</div></div>
            <details class="glass-card ranking-rules"><summary>How Profile Points are calculated</summary><div id="rankingRules"></div></details>`;
        dashboardContent.appendChild(panel);

        button.addEventListener('click', () => { switchTab('ranking', button); loadRanking(); });
        document.getElementById('rankingBranch').addEventListener('change', loadRanking);
        document.getElementById('rankingYear').addEventListener('change', loadRanking);
        document.getElementById('rankingRefresh').addEventListener('click', loadRanking);

        if (new URLSearchParams(location.search).get('tab') === 'ranking') {
            switchTab('ranking', button);
            loadRanking();
        }
    }

    async function loadRanking() {
        const list = document.getElementById('rankingList');
        if (!list) return;
        list.innerHTML = '<div class="panel-empty">Calculating profile points…</div>';
        const branchSelect = document.getElementById('rankingBranch');
        const yearSelect = document.getElementById('rankingYear');
        const params = new URLSearchParams();
        if (branchSelect.dataset.initialized === 'true') params.set('branch', branchSelect.value);
        if (yearSelect.dataset.initialized === 'true') params.set('year', yearSelect.value);
        try {
            const suffix = params.toString() ? `?${params}` : '';
            const response = await fetch(`/api/student/rankings/profile${suffix}`, { headers: { Authorization: `Bearer ${token()}` } });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Could not calculate ranking.');
            render(json.data);
        } catch (error) {
            list.innerHTML = `<div class="panel-empty"><strong>Ranking unavailable</strong><p>${escapeHtml(error.message)}</p></div>`;
        }
    }

    function render(data) {
        const branchSelect = document.getElementById('rankingBranch');
        const yearSelect = document.getElementById('rankingYear');
        if (branches.includes(data.filters.branch) && branchSelect.dataset.initialized !== 'true') branchSelect.value = data.filters.branch;
        if (years.includes(data.filters.year) && yearSelect.dataset.initialized !== 'true') yearSelect.value = data.filters.year;
        branchSelect.dataset.initialized = yearSelect.dataset.initialized = 'true';

        const current = data.current;
        const summary = document.getElementById('rankingMySummary');
        summary.innerHTML = current
            ? `<span>Your position</span><strong>#${current.rank}</strong><small>${current.points} points · ${escapeHtml(data.filters.branch)} / ${escapeHtml(data.filters.year)}</small>`
            : `<span>Your position</span><strong>—</strong><small>You are outside this selected cohort.</small>`;

        const top = data.rows.slice(0, 3);
        document.getElementById('rankingPodium').innerHTML = top.map((row, index) => `<article class="glass-card podium-card podium-${index + 1}"><span class="podium-rank">#${row.rank}</span><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.branch)} · ${escapeHtml(row.year || '—')}</p><strong>${row.points} pts</strong></article>`).join('');
        document.getElementById('rankingCount').textContent = `${data.rows.length} students`;

        document.getElementById('rankingList').innerHTML = data.rows.length ? data.rows.map(row => `
            <article class="glass-card ranking-row ${row.is_me ? 'ranking-row-me' : ''}">
                <div class="ranking-rank">#${row.rank}</div>
                <div class="ranking-person"><strong>${escapeHtml(row.name)}${row.is_me ? ' · You' : ''}</strong><span>${escapeHtml(row.branch)} · ${escapeHtml(row.year || '—')}</span></div>
                <div class="ranking-points"><strong>${row.points}</strong><span>points</span></div>
                <details class="ranking-breakdown"><summary>Score breakdown</summary><div class="ranking-breakdown-grid">${Object.entries(row.breakdown).map(([key, value]) => `<span><small>${escapeHtml(key.replace(/_/g, ' '))}</small><strong>${value}</strong></span>`).join('')}</div></details>
            </article>`).join('') : '<div class="panel-empty">No students in this cohort.</div>';

        const rules = data.rules || {};
        document.getElementById('rankingRules').innerHTML = `<p>${escapeHtml(rules.note || '')}</p>${Object.entries(rules).filter(([key]) => !['status','note'].includes(key)).map(([key, value]) => `<div class="ranking-rule"><strong>${escapeHtml(key)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}`;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
