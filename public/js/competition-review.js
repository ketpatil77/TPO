(() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const isAdmin = () => document.body.classList.contains('admin-dashboard-page');
    const isTPC = () => document.body.classList.contains('observer-shell');
    let role = null;

    function install() {
        if (isAdmin()) return installAdmin();
        if (isTPC()) return installTPC();
    }

    function installAdmin() {
        if (document.getElementById('tab-competition-review')) return;
        role = 'admin';
        const tabs = document.querySelector('.admin-tabs');
        if (!tabs) return;
        const button = document.createElement('button');
        button.className = 'tab-btn';
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', 'tab-competition-review');
        button.textContent = 'Competition Verification';
        const readiness = tabs.querySelector('[aria-controls="tab-readiness"]');
        (readiness || tabs.lastElementChild)?.after(button);

        const panel = document.createElement('div');
        panel.id = 'tab-competition-review';
        panel.className = 'tab-content';
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = reviewShell(true);
        tabs.parentElement.insertBefore(panel, document.getElementById('tab-workflow') || null);
        button.addEventListener('click', () => { switchAdminTab('competition-review', button); loadReviews(); });
        bindFilters();
    }

    function installTPC() {
        if (document.getElementById('observerTab-competitions')) return;
        role = 'observer';
        const tabs = document.querySelector('.observer-tabs');
        if (!tabs) return;
        const button = document.createElement('button');
        button.className = 'tab-btn';
        button.type = 'button';
        button.dataset.tab = 'competitions';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', 'observerTab-competitions');
        button.textContent = 'Competition Verification';
        tabs.appendChild(button);

        const panel = document.createElement('section');
        panel.id = 'observerTab-competitions';
        panel.className = 'tab-content';
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = reviewShell(false);
        tabs.parentElement.insertBefore(panel, document.getElementById('observerTab-dob') || null);
        button.addEventListener('click', () => {
            document.querySelectorAll('.observer-tabs .tab-btn').forEach(item => {
                item.classList.toggle('active', item === button);
                item.setAttribute('aria-selected', String(item === button));
            });
            document.querySelectorAll('[id^="observerTab-"]').forEach(tab => tab.classList.toggle('active', tab === panel));
            loadReviews();
        });
        bindFilters();
    }

    function reviewShell(showBranch) {
        return `<div class="review-hero glass-card"><div><span class="eyebrow">Verified evidence</span><h2>Competition Verification</h2><p>${showBranch ? 'TPO can verify competitions for every branch.' : 'TPC can verify only students from your own department.'}</p></div><div id="competitionReviewCount" class="review-count"><strong>0</strong><span>records</span></div></div>
        <div class="review-toolbar glass-card">
            <div><label class="form-label" for="competitionReviewStatus">Status</label><select id="competitionReviewStatus" class="form-select"><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="all">All</option></select></div>
            ${showBranch ? '<div><label class="form-label" for="competitionReviewBranch">Branch</label><select id="competitionReviewBranch" class="form-select"><option value="all">All branches</option><option>AIML</option><option>CT</option><option>EE</option><option>ME</option><option>CE</option><option>E&amp;C</option></select></div>' : ''}
            <button id="competitionReviewRefresh" class="btn btn-secondary" type="button">Refresh</button>
        </div>
        <div id="competitionReviewList" class="competition-review-list" aria-live="polite"><div class="panel-empty">Open this tab to load records.</div></div>`;
    }

    function bindFilters() {
        setTimeout(() => {
            document.getElementById('competitionReviewStatus')?.addEventListener('change', loadReviews);
            document.getElementById('competitionReviewBranch')?.addEventListener('change', loadReviews);
            document.getElementById('competitionReviewRefresh')?.addEventListener('click', loadReviews);
        }, 0);
    }

    async function loadReviews() {
        const host = document.getElementById('competitionReviewList');
        if (!host || !role) return;
        host.innerHTML = '<div class="panel-empty">Loading competition records…</div>';
        const params = new URLSearchParams({ status: document.getElementById('competitionReviewStatus')?.value || 'pending' });
        const branch = document.getElementById('competitionReviewBranch')?.value;
        if (branch) params.set('branch', branch);
        try {
            const response = await fetch(`/api/${role === 'admin' ? 'admin' : 'observer'}/competitions?${params}`);
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Unable to load records.');
            renderReviews(json.data || []);
        } catch (error) {
            host.innerHTML = `<div class="panel-empty"><strong>Could not load verification queue</strong><p>${esc(error.message)}</p></div>`;
        }
    }

    function renderReviews(rows) {
        const host = document.getElementById('competitionReviewList');
        const count = document.getElementById('competitionReviewCount');
        if (count) count.innerHTML = `<strong>${rows.length}</strong><span>records</span>`;
        if (!rows.length) {
            host.innerHTML = '<div class="panel-empty"><strong>No records here</strong><p>Nothing matches the selected verification filter.</p></div>';
            return;
        }
        host.innerHTML = rows.map(item => `
            <article class="glass-card competition-review-card">
                <div class="review-card-head"><div><span class="eyebrow">${esc(item.student.branch)} · ${esc(item.student.year || '—')}</span><h3>${esc(item.title)}</h3><p>${esc(item.student.name)} · ${esc(item.student.prn)}</p></div><span class="verification-pill verification-${esc(item.verification_status || 'pending')}">${esc(item.verification_status || 'pending')}</span></div>
                <div class="review-facts"><span><small>Organizer</small><strong>${esc(item.organizer)}</strong></span><span><small>Level</small><strong>${esc(item.level)}</strong></span><span><small>Result</small><strong>${esc(item.result_status)}${item.position_text ? ' · ' + esc(item.position_text) : ''}</strong></span><span><small>Date</small><strong>${esc(item.participated_on)}</strong></span></div>
                ${item.project_title ? `<div class="review-line"><small>Project / solution</small><strong>${esc(item.project_title)}</strong></div>` : ''}
                ${item.notes ? `<details class="review-notes"><summary>Student notes</summary><p>${esc(item.notes)}</p></details>` : ''}
                <div class="review-links">${item.source_url ? `<a class="btn btn-secondary btn-sm" href="${esc(item.source_url)}" target="_blank" rel="noopener">Official page</a>` : ''}${item.proof_url ? `<a class="btn btn-secondary btn-sm" href="${esc(item.proof_url)}" target="_blank" rel="noopener">Open proof</a>` : ''}</div>
                ${item.verification_note ? `<div class="review-verification-note"><strong>${esc(item.verified_role || 'Staff')} note</strong><span>${esc(item.verification_note)}</span></div>` : ''}
                <div class="review-actions"><button class="btn btn-primary btn-sm" data-verify="${esc(item.id)}">Verify</button><button class="btn btn-danger btn-sm" data-reject="${esc(item.id)}">Reject</button></div>
            </article>`).join('');
        host.querySelectorAll('[data-verify]').forEach(button => button.addEventListener('click', () => decide(button.dataset.verify, 'verified')));
        host.querySelectorAll('[data-reject]').forEach(button => button.addEventListener('click', () => decide(button.dataset.reject, 'rejected')));
    }

    async function decide(id, status) {
        let note = '';
        if (status === 'rejected') {
            note = prompt('Why is this competition record being rejected? The student will see this reason.') || '';
            if (note.trim().length < 3) return;
        } else if (!confirm('Verify this competition record? Verified competitions can contribute to Profile Points.')) return;

        const payload = status === 'rejected' ? { status, note: note.trim() } : { status };
        try {
            const response = await fetch(`/api/${role === 'admin' ? 'admin' : 'observer'}/competitions/${encodeURIComponent(id)}/verification`, {
                method: 'PUT',
                headers: { 'Content-Type':'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Unable to update verification.');
            if (window.showToast) window.showToast(json.message || 'Verification updated.', 'success');
            else if (window.showObserverToast) window.showObserverToast(json.message || 'Verification updated.', 'success');
            loadReviews();
        } catch (error) {
            if (window.showToast) window.showToast(error.message, 'error');
            else alert(error.message);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
