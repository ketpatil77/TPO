(() => {
    const isAdmin = document.body.classList.contains('admin-dashboard-page');
    const isObserver = document.body.classList.contains('observer-shell');
    if (!isAdmin && !isObserver) return;

    const apiBase = isAdmin ? '/api/admin/proof-review' : '/api/observer/proof-review';
    let rows = [];

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
        return `<div class="section-header proof-review-header"><div><span class="eyebrow">Evidence review</span><h2>Proof verification</h2><p class="section-note">Review certificate and internship proofs. Only uploaded proofs appear here; the 48-hour missing-proof rule is handled separately.</p></div><button type="button" class="btn btn-secondary btn-sm" data-proof-refresh>Refresh</button></div>
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

    function bindControls() {
        const root = scopeRoot();
        if (!root) return;
        root.querySelector('[data-proof-refresh]')?.addEventListener('click', loadQueue);
        root.querySelector('[data-proof-type]')?.addEventListener('change', loadQueue);
        root.querySelector('[data-proof-branch]')?.addEventListener('change', loadQueue);
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
            const note = action === 'rejected' ? (window.prompt('Reason for rejection (optional):', '') ?? '') : '';
            button.disabled = true;
            try {
                const response = await fetch(`${apiBase}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: action, note })
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(window.apiError ? window.apiError(data) : 'Review failed.');
                if (window.showToast) window.showToast(data.message || 'Proof review updated.', 'success');
                await loadQueue();
            } catch (error) {
                if (window.showToast) window.showToast(error.message, 'error');
                else alert(error.message);
            } finally {
                button.disabled = false;
            }
        });
    }

    async function loadQueue() {
        const root = scopeRoot();
        if (!root) return;
        const type = root.querySelector('[data-proof-type]')?.value || 'all';
        const branch = root.querySelector('[data-proof-branch]')?.value || 'all';
        const params = new URLSearchParams();
        if (type !== 'all') params.set('type', type);
        if (isAdmin && branch !== 'all') params.set('branch', branch);
        const body = root.querySelector('[data-proof-body]');
        if (body) body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">Loading pending proofs…</td></tr>';
        try {
            const response = await fetch(`${apiBase}/pending${params.size ? `?${params}` : ''}`, { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(window.apiError ? window.apiError(data) : 'Could not load pending proofs.');
            rows = Array.isArray(data.data) ? data.data : [];
            renderRows();
        } catch (error) {
            if (body) body.innerHTML = `<tr><td colspan="6" class="proof-review-empty">${esc(error.message)}</td></tr>`;
        }
    }

    function renderRows() {
        const root = scopeRoot();
        if (!root) return;
        const body = root.querySelector('[data-proof-body]');
        const count = root.querySelector('[data-proof-count]');
        if (count) count.textContent = `${rows.length} pending`;
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">No pending uploaded proofs in this scope.</td></tr>';
            return;
        }
        body.innerHTML = rows.map(row => `<tr>
            <td data-label="Student"><strong>${esc(row.student_name)}</strong><small>${esc(row.student_prn)}</small></td>
            <td data-label="Branch"><strong>${esc(row.branch)}</strong>${row.class ? `<small>${esc(row.class)}</small>` : ''}</td>
            <td data-label="Type"><span class="proof-review-type">${esc(row.type)}</span></td>
            <td data-label="Entry"><strong>${esc(row.entry_name)}</strong>${row.details ? `<small>${esc(row.details)}</small>` : ''}</td>
            <td data-label="Uploaded">${row.evidence_uploaded_at ? esc(new Date(row.evidence_uploaded_at).toLocaleString()) : '—'}</td>
            <td data-label="Action"><div class="proof-review-actions"><button class="btn btn-secondary btn-sm" data-proof-action="view" data-type="${esc(row.type)}" data-id="${esc(row.id)}">View</button><button class="btn btn-primary btn-sm" data-proof-action="approved" data-type="${esc(row.type)}" data-id="${esc(row.id)}">Approve</button><button class="btn btn-danger btn-sm" data-proof-action="rejected" data-type="${esc(row.type)}" data-id="${esc(row.id)}">Reject</button></div></td>
        </tr>`).join('');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeSection, { once: true });
    else makeSection();
})();
