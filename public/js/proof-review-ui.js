(() => {
    const isAdmin = document.body.classList.contains('admin-dashboard-page');
    const isObserver = document.body.classList.contains('observer-shell');
    if (!isAdmin && !isObserver) return;

    const apiBase = isAdmin ? '/api/admin/proof-review' : '/api/observer/proof-review';
    let rows = [];
    let loadSequence = 0;

    function esc(value) {
        return String(value ?? '').replace(/[&<>'\"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '\"':'&quot;' })[ch]);
    }

    function makeSection() {
        if (isAdmin) {
            const tabs = document.querySelector('.admin-tabs');
            if (!tabs || document.getElementById('tab-proof-review')) return;
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.type = 'button';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', 'false');
            btn.setAttribute('aria-controls', 'tab-proof-review');
            btn.textContent = 'Proof verification';
            btn.addEventListener('click', () => {
                if (typeof window.switchAdminTab === 'function') window.switchAdminTab('proof-review', btn);
                else {
                    document.querySelectorAll('#adminDashboard .tab-content').forEach(node => node.classList.remove('active'));
                    document.querySelectorAll('.admin-tabs .tab-btn').forEach(node => node.classList.remove('active'));
                    section.classList.add('active');
                    btn.classList.add('active');
                }
                loadQueue();
            });
            tabs.appendChild(btn);
            const section = document.createElement('div');
            section.id = 'tab-proof-review';
            section.className = 'tab-content';
            section.setAttribute('role', 'tabpanel');
            section.innerHTML = sectionMarkup(true);
            tabs.after(section);
        } else {
            const tabs = document.querySelector('.observer-tabs');
            if (!tabs || document.getElementById('observerTab-proof-review')) return;
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.type = 'button';
            btn.dataset.tab = 'proof-review';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', 'false');
            btn.setAttribute('aria-controls', 'observerTab-proof-review');
            btn.textContent = 'Proof verification';
            tabs.appendChild(btn);
            const section = document.createElement('section');
            section.id = 'observerTab-proof-review';
            section.className = 'tab-content';
            section.setAttribute('role', 'tabpanel');
            section.innerHTML = sectionMarkup(false);
            tabs.after(section);
            btn.addEventListener('click', () => {
                document.querySelectorAll('#observerDashboard > .tab-content').forEach(node => node.classList.remove('active'));
                document.querySelectorAll('.observer-tabs .tab-btn').forEach(node => { node.classList.remove('active'); node.setAttribute('aria-selected', 'false'); });
                section.classList.add('active');
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                loadQueue();
            });
        }
        bindControls();
    }

    function sectionMarkup(showBranch) {
        return `<div class="section-header proof-review-header"><div><span class="eyebrow">Evidence review</span><h2>Proof verification</h2><p class="section-note">Review uploaded certificate and internship proofs.</p></div><button type="button" class="btn btn-secondary btn-sm" data-proof-refresh>Refresh</button></div>
        <div class="glass-card proof-review-panel">
            <div class="proof-review-toolbar">
                <div class="form-group"><label class="form-label">Type</label><select class="form-select" data-proof-type><option value="all">All proofs</option><option value="internship">Internships</option><option value="certificate">Certificates</option></select></div>
                ${showBranch ? '<div class="form-group"><label class="form-label">Branch</label><select class="form-select" data-proof-branch><option value="all">All branches</option><option>AIML</option><option>CT</option><option>EE</option><option>ME</option><option>CE</option><option>E&amp;C</option></select></div>' : ''}
                <span class="proof-review-count" data-proof-count>0 pending</span>
            </div>
            <div class="proof-review-table-shell"><table class="proof-review-table"><thead><tr><th>Student</th><th>Branch</th><th>Type</th><th>Entry</th><th>Uploaded</th><th>Action</th></tr></thead><tbody data-proof-body><tr><td colspan="6" class="proof-review-empty">Loading pending proofs…</td></tr></tbody></table></div>
        </div>`;
    }

    function scopeRoot() {
        return document.getElementById(isAdmin ? 'tab-proof-review' : 'observerTab-proof-review');
    }

    function updateCount() {
        const count = scopeRoot()?.querySelector('[data-proof-count]');
        if (count) count.textContent = `${rows.length} pending`;
    }

    function showEmptyIfNeeded() {
        const body = scopeRoot()?.querySelector('[data-proof-body]');
        if (!body || rows.length || body.querySelector('[data-proof-row]')) return;
        body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">No pending uploaded proofs in this scope.</td></tr>';
    }

    function removeResolvedRow(type, id, action, rowElement) {
        rows = rows.filter(row => !(String(row.type) === String(type) && String(row.id) === String(id)));
        updateCount();
        if (!rowElement) {
            renderRows();
            return;
        }
        rowElement.classList.remove('is-resolving');
        rowElement.classList.add(action === 'approved' ? 'is-approved' : 'is-rejected');
        rowElement.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => {
            rowElement.classList.add('proof-review-row-leaving');
            window.setTimeout(() => {
                rowElement.remove();
                showEmptyIfNeeded();
            }, 320);
        }, 180);
    }

    function bindControls() {
        const root = scopeRoot();
        if (!root) return;
        root.querySelector('[data-proof-refresh]')?.addEventListener('click', () => loadQueue());
        root.querySelector('[data-proof-type]')?.addEventListener('change', () => loadQueue());
        root.querySelector('[data-proof-branch]')?.addEventListener('change', () => loadQueue());
        root.addEventListener('click', async event => {
            const button = event.target.closest('[data-proof-action]');
            if (!button) return;
            const type = button.dataset.type;
            const id = button.dataset.id;
            const action = button.dataset.proofAction;
            if (action === 'view') {
                window.open(`${apiBase}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/proof`, '_blank', 'noopener');
                return;
            }

            let note = '';
            if (action === 'rejected') {
                const response = window.prompt('Reason for rejection (optional):', '');
                if (response === null) return;
                note = response;
            }

            const rowElement = button.closest('[data-proof-row]');
            const actionButtons = rowElement?.querySelectorAll('[data-proof-action]') || [button];
            actionButtons.forEach(node => { node.disabled = true; });
            rowElement?.classList.add('is-resolving');
            button.textContent = action === 'approved' ? 'Approving…' : 'Rejecting…';

            try {
                const response = await fetch(`${apiBase}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: action, note })
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(window.apiError ? window.apiError(data) : 'Review failed.');

                removeResolvedRow(type, id, action, rowElement);
                if (window.showToast) window.showToast(data.message || 'Proof review updated.', 'success');

                // Reconcile quietly with the server after the optimistic transition. This
                // avoids flashing the whole queue back to "Loading" after every decision.
                window.setTimeout(() => loadQueue({ silent: true }), 700);
            } catch (error) {
                rowElement?.classList.remove('is-resolving');
                actionButtons.forEach(node => { node.disabled = false; });
                renderRows();
                if (window.showToast) window.showToast(error.message, 'error');
                else alert(error.message);
            }
        });
    }

    async function loadQueue({ silent = false } = {}) {
        const root = scopeRoot();
        if (!root) return;
        const sequence = ++loadSequence;
        const type = root.querySelector('[data-proof-type]')?.value || 'all';
        const branch = root.querySelector('[data-proof-branch]')?.value || 'all';
        const params = new URLSearchParams();
        if (type !== 'all') params.set('type', type);
        if (isAdmin && branch !== 'all') params.set('branch', branch);
        params.set('_ts', String(Date.now()));
        const body = root.querySelector('[data-proof-body]');
        if (!silent && body) body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">Loading pending proofs…</td></tr>';
        try {
            const response = await fetch(`${apiBase}/pending?${params}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(window.apiError ? window.apiError(data) : 'Could not load pending proofs.');
            if (sequence !== loadSequence) return;
            rows = Array.isArray(data.data) ? data.data : [];
            renderRows();
        } catch (error) {
            if (sequence !== loadSequence) return;
            if (!silent && body) body.innerHTML = `<tr><td colspan="6" class="proof-review-empty">${esc(error.message)}</td></tr>`;
        }
    }

    function renderRows() {
        const root = scopeRoot();
        if (!root) return;
        const body = root.querySelector('[data-proof-body]');
        updateCount();
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">No pending uploaded proofs in this scope.</td></tr>';
            return;
        }
        body.innerHTML = rows.map(row => `<tr data-proof-row data-type="${esc(row.type)}" data-id="${esc(row.id)}">
            <td class="proof-review-student" data-label="Student"><strong>${esc(row.student_name)}</strong><small>${esc(row.student_prn)}</small></td>
            <td class="proof-review-branch" data-label="Branch"><strong>${esc(row.branch)}</strong>${row.class ? `<small>${esc(row.class)}</small>` : ''}</td>
            <td class="proof-review-type-cell" data-label="Type"><span class="proof-review-type">${esc(row.type)}</span></td>
            <td class="proof-review-entry" data-label="Entry"><strong>${esc(row.entry_name)}</strong>${row.details ? `<small>${esc(row.details)}</small>` : ''}</td>
            <td class="proof-review-uploaded" data-label="Uploaded"><span class="proof-review-mobile-label">Uploaded</span>${row.evidence_uploaded_at ? esc(new Date(row.evidence_uploaded_at).toLocaleString()) : '—'}</td>
            <td class="proof-review-action-cell" data-label="Action"><div class="proof-review-actions"><button class="btn btn-secondary btn-sm" data-proof-action="view" data-type="${esc(row.type)}" data-id="${esc(row.id)}">View</button><button class="btn btn-primary btn-sm" data-proof-action="approved" data-type="${esc(row.type)}" data-id="${esc(row.id)}">Approve</button><button class="btn btn-danger btn-sm" data-proof-action="rejected" data-type="${esc(row.type)}" data-id="${esc(row.id)}">Reject</button></div></td>
        </tr>`).join('');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeSection, { once: true });
    else makeSection();
})();
