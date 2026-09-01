(() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const isAdmin = () => document.body.classList.contains('admin-dashboard-page');
    const isTPC = () => document.body.classList.contains('observer-shell');
    let role = null;

    const KIND_LABELS = {
        all: 'All evidence', academics: 'Academics / CGPA', internships: 'Internships', certificates: 'Certificates',
        projects: 'Projects', research: 'Research papers', skills: 'Skills'
    };

    function install() {
        if (isAdmin()) installAdmin();
        else if (isTPC()) installTPC();
    }

    function installAdmin() {
        if (document.getElementById('tab-evidence-review')) return;
        role = 'admin';
        const tabs = document.querySelector('.admin-tabs');
        if (!tabs) return;
        const button = document.createElement('button');
        button.className = 'tab-btn';
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', 'tab-evidence-review');
        button.textContent = 'Profile Verification';
        const competition = tabs.querySelector('[aria-controls="tab-competition-review"]');
        const readiness = tabs.querySelector('[aria-controls="tab-readiness"]');
        (competition || readiness || tabs.lastElementChild)?.after(button);

        const panel = document.createElement('div');
        panel.id = 'tab-evidence-review';
        panel.className = 'tab-content';
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = shell(true);
        tabs.parentElement.insertBefore(panel, document.getElementById('tab-workflow') || null);
        button.addEventListener('click', () => { switchAdminTab('evidence-review', button); loadEvidence(); });
        bind();
    }

    function installTPC() {
        if (document.getElementById('observerTab-evidence-review')) return;
        role = 'observer';
        const tabs = document.querySelector('.observer-tabs');
        if (!tabs) return;
        const button = document.createElement('button');
        button.className = 'tab-btn';
        button.type = 'button';
        button.dataset.tab = 'evidence-review';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', 'observerTab-evidence-review');
        button.textContent = 'Profile Verification';
        tabs.appendChild(button);

        const panel = document.createElement('section');
        panel.id = 'observerTab-evidence-review';
        panel.className = 'tab-content';
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = shell(false);
        tabs.parentElement.insertBefore(panel, document.getElementById('observerTab-dob') || null);
        button.addEventListener('click', () => {
            document.querySelectorAll('.observer-tabs .tab-btn').forEach(item => {
                item.classList.toggle('active', item === button);
                item.setAttribute('aria-selected', String(item === button));
            });
            document.querySelectorAll('[id^="observerTab-"]').forEach(tab => tab.classList.toggle('active', tab === panel));
            loadEvidence();
        });
        bind();
    }

    function shell(showBranch) {
        const kinds = Object.entries(KIND_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
        return `<div class="review-hero glass-card evidence-review-hero">
            <div><span class="eyebrow">Profile Points integrity</span><h2>Profile Evidence Verification</h2><p>${showBranch ? 'TPO verifies academic and profile evidence across the college.' : 'TPC verifies evidence only for students in your department.'} Verification changes eligibility for points, never the point value itself.</p></div>
            <div id="evidenceReviewCount" class="review-count"><strong>0</strong><span>records</span></div>
        </div>
        <div class="review-toolbar glass-card evidence-review-toolbar">
            <div><label class="form-label" for="evidenceReviewStatus">Status</label><select id="evidenceReviewStatus" class="form-select"><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="all">All</option></select></div>
            <div><label class="form-label" for="evidenceReviewKind">Evidence type</label><select id="evidenceReviewKind" class="form-select">${kinds}</select></div>
            ${showBranch ? '<div><label class="form-label" for="evidenceReviewBranch">Branch</label><select id="evidenceReviewBranch" class="form-select"><option value="all">All branches</option><option>AIML</option><option>CT</option><option>EE</option><option>ME</option><option>CE</option><option>E&amp;C</option></select></div>' : ''}
            <button id="evidenceReviewRefresh" class="btn btn-secondary" type="button">Refresh</button>
        </div>
        <div class="evidence-integrity-note glass-card"><strong>Fairness rule</strong><span>Staff can verify or reject evidence. Profile Points are assigned automatically by the published scoring formula. There is no manual score or rank field.</span></div>
        <div id="evidenceReviewList" class="competition-review-list evidence-review-list" aria-live="polite"><div class="panel-empty">Open this tab to load records.</div></div>`;
    }

    function bind() {
        setTimeout(() => {
            document.getElementById('evidenceReviewStatus')?.addEventListener('change', loadEvidence);
            document.getElementById('evidenceReviewKind')?.addEventListener('change', loadEvidence);
            document.getElementById('evidenceReviewBranch')?.addEventListener('change', loadEvidence);
            document.getElementById('evidenceReviewRefresh')?.addEventListener('click', loadEvidence);
        }, 0);
    }

    async function loadEvidence() {
        const host = document.getElementById('evidenceReviewList');
        if (!host || !role) return;
        host.innerHTML = '<div class="panel-empty">Loading profile evidence…</div>';
        const params = new URLSearchParams({
            status: document.getElementById('evidenceReviewStatus')?.value || 'pending',
            kind: document.getElementById('evidenceReviewKind')?.value || 'all'
        });
        const branch = document.getElementById('evidenceReviewBranch')?.value;
        if (branch) params.set('branch', branch);
        try {
            const response = await fetch(`/api/${role === 'admin' ? 'admin' : 'observer'}/rankings/evidence?${params}`);
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Unable to load evidence.');
            render(json.data || [], json.rules_version || '');
        } catch (error) {
            host.innerHTML = `<div class="panel-empty"><strong>Could not load evidence queue</strong><p>${esc(error.message)}</p></div>`;
        }
    }

    function render(rows, rulesVersion) {
        const host = document.getElementById('evidenceReviewList');
        const count = document.getElementById('evidenceReviewCount');
        if (count) count.innerHTML = `<strong>${rows.length}</strong><span>${esc(rulesVersion || 'records')}</span>`;
        if (!rows.length) {
            host.innerHTML = '<div class="panel-empty"><strong>No evidence here</strong><p>Nothing matches the selected verification filters.</p></div>';
            return;
        }
        host.innerHTML = rows.map(item => `
            <article class="glass-card competition-review-card evidence-review-card">
                <div class="review-card-head">
                    <div><span class="eyebrow">${esc(KIND_LABELS[item.kind] || item.kind)} · ${esc(item.student.branch)} · ${esc(item.student.year || '—')}</span><h3>${esc(item.title)}</h3><p>${esc(item.student.name)} · ${esc(item.student.prn)}</p></div>
                    <span class="verification-pill verification-${esc(item.status || 'pending')}">${esc(item.status || 'pending')}</span>
                </div>
                ${item.links?.length ? `<div class="review-links">${item.links.map((link, i) => `<a class="btn btn-secondary btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${i ? 'Open evidence' : 'Primary evidence'}</a>`).join('')}</div>` : '<p class="evidence-no-link">No online evidence link stored. Verify against official/offline records.</p>'}
                <div class="review-actions"><button class="btn btn-primary btn-sm" data-evidence-verify="${esc(item.kind)}|${esc(item.id)}">Verify</button><button class="btn btn-danger btn-sm" data-evidence-reject="${esc(item.kind)}|${esc(item.id)}">Reject</button></div>
            </article>`).join('');
        host.querySelectorAll('[data-evidence-verify]').forEach(button => button.addEventListener('click', () => decide(button.dataset.evidenceVerify, 'verified')));
        host.querySelectorAll('[data-evidence-reject]').forEach(button => button.addEventListener('click', () => decide(button.dataset.evidenceReject, 'rejected')));
    }

    async function decide(key, status) {
        const [kind, id] = String(key).split('|');
        let note = '';
        if (status === 'rejected') {
            note = prompt('Why is this evidence being rejected? The student will see this reason.') || '';
            if (note.trim().length < 3) return;
        } else if (!confirm('Verify this evidence? If the scoring rules award points for it, the leaderboard will recalculate automatically.')) return;
        const payload = status === 'rejected' ? { status, note: note.trim() } : { status };
        try {
            const response = await fetch(`/api/${role === 'admin' ? 'admin' : 'observer'}/rankings/evidence/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/verification`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Unable to update verification.');
            if (window.showToast) window.showToast('Evidence verification updated. Ranking will recalculate automatically.', 'success');
            else if (window.showObserverToast) window.showObserverToast('Evidence verification updated.', 'success');
            loadEvidence();
        } catch (error) {
            if (window.showToast) window.showToast(error.message, 'error'); else alert(error.message);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
