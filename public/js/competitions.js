(() => {
    const TYPES = ['Research Convention / Aavishkar','Hackathon','Ideathon','Innovation / Project Competition','Coding / Programming Contest','Data / AI Challenge','Cybersecurity / CTF','Robotics Competition','Paper Presentation','Technical Quiz','Design / CAD Challenge','Case Study Competition','Business Plan / Startup Pitch','Other Technical / Academic Competition'];
    const LEVELS = ['Department','Institute / College','Inter-College','District','Zonal','University','Inter-University','Regional','State','National','International','Open / Online'];
    const RESULTS = ['Participated','Shortlisted / Selected','Finalist','Rank / Position','Runner-up','Winner','Special Award'];
    let rows = [];
    const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const token = () => localStorage.getItem('tpo_token');
    const errorMessage = value => value?.error?.message || value?.error || value?.message || 'Request failed';
    const options = values => values.map(value => `<option>${e(value)}</option>`).join('');

    function boot() {
        if (!document.body.classList.contains('student-dashboard-page') || document.getElementById('tab-competitions')) return;
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/css/competitions.css?v=20260901-4';
        document.head.append(css);

        const tabs = document.querySelector('.tabs-nav');
        const anchor = tabs?.querySelector('[aria-controls="tab-certificates"]');
        if (!anchor) return;
        const button = document.createElement('button');
        button.className = 'tab-btn';
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', 'tab-competitions');
        button.innerHTML = 'Competitions (<span id="competitionCount">0</span>)';
        button.onclick = () => { switchTab('competitions', button); load(); };
        anchor.after(button);

        const panel = document.createElement('div');
        panel.id = 'tab-competitions';
        panel.className = 'tab-content';
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = `<div class="section-header"><div><span class="eyebrow">Achievements</span><h2>Competitions and hackathons</h2><p class="section-note">Record Aavishkar, hackathons, coding contests, project competitions and other achievements. TPO can verify every branch; TPC can verify students from its own department.</p></div><button id="addCompetition" class="btn btn-primary btn-sm">Add competition</button></div><div class="competition-level-guide glass-card"><strong>Common progression</strong><span>Institute / College → Zonal → University → Inter-University / State → National → International</span></div><div id="competitionsList" class="project-grid competition-grid"></div>`;
        document.getElementById('tab-certificates').after(panel);
        document.getElementById('addCompetition').onclick = () => open();

        const modal = document.createElement('div');
        modal.id = 'competitionModal';
        modal.className = 'modal-backdrop';
        modal.innerHTML = `<div class="glass-card modal-card"><div class="modal-header"><div><span class="eyebrow">Achievement record</span><h3 id="competitionModalTitle">Add competition</h3></div><button id="closeCompetition" class="close-btn" type="button">&times;</button></div><form id="competitionForm"><input id="competitionId" type="hidden"><div class="form-group"><label class="form-label">Competition name</label><input id="cTitle" class="form-input" required maxlength="200" placeholder="e.g. Aavishkar"></div><div class="form-group"><label class="form-label">Organizer</label><input id="cOrg" class="form-input" required maxlength="200"></div><div class="grid-2"><div class="form-group"><label class="form-label">Type</label><select id="cType" class="form-select">${options(TYPES)}</select></div><div class="form-group"><label class="form-label">Level reached</label><select id="cLevel" class="form-select">${options(LEVELS)}</select></div></div><div class="grid-2"><div class="form-group"><label class="form-label">Result</label><select id="cResult" class="form-select">${options(RESULTS)}</select></div><div class="form-group"><label class="form-label">Rank / award</label><input id="cPosition" class="form-input" maxlength="80" placeholder="Optional"></div></div><div class="grid-2"><div class="form-group"><label class="form-label">Date</label><input id="cDate" type="date" class="form-input" required></div><div class="form-group"><label class="form-label">Participation</label><select id="cTeam" class="form-select"><option>Individual</option><option>Team</option></select></div></div><div class="form-group"><label class="form-label">Team size</label><input id="cSize" type="number" min="1" max="25" value="1" class="form-input"></div><div class="form-group"><label class="form-label">Project / solution title</label><input id="cProject" class="form-input" maxlength="250"></div><div class="grid-2"><div class="form-group"><label class="form-label">Official page</label><input id="cSource" type="url" class="form-input" placeholder="https://"></div><div class="form-group"><label class="form-label">Proof / certificate</label><input id="cProof" type="url" class="form-input" placeholder="https://"></div></div><div class="form-group"><label class="form-label">Notes</label><textarea id="cNotes" class="form-textarea" maxlength="1500"></textarea></div><div class="competition-verification-note">New or edited records stay pending until staff verification. Verified competitions can contribute to Profile Points.</div><button class="btn btn-primary" type="submit">Save competition</button></form></div>`;
        document.body.append(modal);
        document.getElementById('closeCompetition').onclick = close;
        document.getElementById('competitionForm').onsubmit = save;
        load();

        if (new URLSearchParams(location.search).get('tab') === 'competitions') switchTab('competitions', button);
    }

    async function load() {
        const host = document.getElementById('competitionsList');
        if (!host) return;
        host.innerHTML = '<div class="panel-empty">Loading…</div>';
        try {
            const response = await fetch('/api/student/competitions', { headers: { Authorization: `Bearer ${token()}` } });
            const json = await response.json();
            if (!response.ok || !json.success) throw Error(errorMessage(json));
            rows = json.data || [];
            render();
        } catch (error) {
            host.innerHTML = `<div class="panel-empty"><strong>Could not load competitions</strong><p>${e(error.message)}</p></div>`;
        }
    }

    function render() {
        document.getElementById('competitionCount').textContent = rows.length;
        const host = document.getElementById('competitionsList');
        if (!rows.length) {
            host.innerHTML = '<div class="panel-empty"><strong>No competitions yet</strong><p>Add your achievements here.</p></div>';
            return;
        }
        host.innerHTML = rows.map(item => {
            const statusLabel = item.verification_status === 'verified'
                ? `Verified${item.verified_role ? ' by ' + e(item.verified_role) : ''}`
                : item.verification_status === 'rejected' ? 'Needs correction' : 'Verification pending';
            const reviewNote = item.verification_note
                ? `<div class="competition-review-note"><strong>${item.verification_status === 'rejected' ? 'Why it was rejected' : 'Verification note'}</strong><span>${e(item.verification_note)}</span></div>` : '';
            return `<article class="glass-card project-card competition-card"><div class="project-card-head"><div><span class="eyebrow">${e(item.participated_on)}</span><h3>${e(item.title)}</h3><p class="competition-organizer">${e(item.organizer)}</p></div><div class="item-actions"><button class="btn btn-secondary btn-sm" data-edit="${e(item.id)}">Edit</button><button class="btn btn-danger btn-sm" data-del="${e(item.id)}">Delete</button></div></div><div class="competition-badges"><span class="competition-badge">${e(item.competition_type)}</span><span class="competition-badge">${e(item.level)}</span><span class="competition-badge">${e(item.result_status)}${item.position_text ? ' · ' + e(item.position_text) : ''}</span></div>${reviewNote}<div class="competition-card-footer"><div>${item.source_url ? `<a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="${e(item.source_url)}">Official page</a>` : ''}${item.proof_url ? `<a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="${e(item.proof_url)}">Proof</a>` : ''}</div><span class="verification-pill verification-${e(item.verification_status || 'pending')}">${statusLabel}</span></div></article>`;
        }).join('');
        host.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => open(button.dataset.edit));
        host.querySelectorAll('[data-del]').forEach(button => button.onclick = () => remove(button.dataset.del));
    }

    function open(id = '') {
        const item = rows.find(row => row.id === id) || {};
        competitionModal.classList.add('active');
        competitionModalTitle.textContent = id ? 'Edit competition' : 'Add competition';
        competitionId.value = item.id || '';
        cTitle.value = item.title || '';
        cOrg.value = item.organizer || '';
        cType.value = item.competition_type || TYPES[0];
        cLevel.value = item.level || 'Institute / College';
        cResult.value = item.result_status || 'Participated';
        cPosition.value = item.position_text || '';
        cDate.value = item.participated_on || '';
        cTeam.value = item.team_type || 'Individual';
        cSize.value = item.team_size || 1;
        cProject.value = item.project_title || '';
        cSource.value = item.source_url || '';
        cProof.value = item.proof_url || '';
        cNotes.value = item.notes || '';
    }

    function close() { competitionModal.classList.remove('active'); }

    async function save(event) {
        event.preventDefault();
        const id = competitionId.value;
        const team = cTeam.value;
        const payload = { title:cTitle.value.trim(), organizer:cOrg.value.trim(), competition_type:cType.value, level:cLevel.value, result_status:cResult.value, position_text:cPosition.value.trim(), participated_on:cDate.value, team_type:team, team_size:team === 'Individual' ? 1 : Number(cSize.value), project_title:cProject.value.trim(), source_url:cSource.value.trim(), proof_url:cProof.value.trim(), notes:cNotes.value.trim() };
        try {
            const response = await fetch('/api/student/competitions' + (id ? '/' + encodeURIComponent(id) : ''), { method:id ? 'PUT' : 'POST', headers:{ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
            const json = await response.json();
            if (!response.ok || !json.success) throw Error(errorMessage(json));
            close();
            await load();
            window.showToast?.(json.message || 'Competition saved.');
        } catch (error) {
            window.showToast?.(error.message, 'error') || alert(error.message);
        }
    }

    async function remove(id) {
        if (!confirm('Delete this competition record?')) return;
        const response = await fetch('/api/student/competitions/' + encodeURIComponent(id), { method:'DELETE', headers:{ Authorization:`Bearer ${token()}` } });
        const json = await response.json();
        if (!response.ok || !json.success) return window.showToast?.(errorMessage(json), 'error');
        load();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
