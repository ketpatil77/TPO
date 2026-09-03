(() => {
    const isAdmin = document.body.classList.contains('admin-dashboard-page');
    const isObserver = document.body.classList.contains('observer-shell');
    if (!isAdmin && !isObserver) return;

    const apiBase = isAdmin ? '/api/admin/proof-review' : '/api/observer/proof-review';
    let rows = [];
    let loadSequence = 0;
    const recentlyResolved = new Map();
    const RESOLVED_GUARD_MS = 30000;

    function esc(value) {
        return String(value ?? '').replace(/[&<>'\"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '\"':'&quot;' })[ch]);
    }

    function keyFor(type, id) { return `${String(type)}:${String(id)}`; }
    function rememberResolved(type, id) { recentlyResolved.set(keyFor(type, id), Date.now()); }
    function isRecentlyResolved(type, id) {
        const key = keyFor(type, id);
        const at = recentlyResolved.get(key);
        if (!at) return false;
        if (Date.now() - at > RESOLVED_GUARD_MS) { recentlyResolved.delete(key); return false; }
        return true;
    }

    function makeSection() {
        if (isAdmin) {
            const tabs = document.querySelector('.admin-tabs');
            if (!tabs || document.getElementById('tab-proof-review')) return;
            const btn = document.createElement('button');
            btn.className = 'tab-btn'; btn.type = 'button'; btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', 'false'); btn.setAttribute('aria-controls', 'tab-proof-review'); btn.textContent = 'Proof verification';
            btn.addEventListener('click', () => {
                if (typeof window.switchAdminTab === 'function') window.switchAdminTab('proof-review', btn);
                else {
                    document.querySelectorAll('#adminDashboard .tab-content').forEach(node => node.classList.remove('active'));
                    document.querySelectorAll('.admin-tabs .tab-btn').forEach(node => node.classList.remove('active'));
                    section.classList.add('active'); btn.classList.add('active');
                }
                loadQueue();
            });
            tabs.appendChild(btn);
            const section = document.createElement('div'); section.id = 'tab-proof-review'; section.className = 'tab-content'; section.setAttribute('role', 'tabpanel');
            section.innerHTML = sectionMarkup(true); tabs.after(section);
        } else {
            const tabs = document.querySelector('.observer-tabs');
            if (!tabs || document.getElementById('observerTab-proof-review')) return;
            const btn = document.createElement('button'); btn.className = 'tab-btn'; btn.type = 'button'; btn.dataset.tab = 'proof-review';
            btn.setAttribute('role', 'tab'); btn.setAttribute('aria-selected', 'false'); btn.setAttribute('aria-controls', 'observerTab-proof-review'); btn.textContent = 'Proof verification'; tabs.appendChild(btn);
            const section = document.createElement('section'); section.id = 'observerTab-proof-review'; section.className = 'tab-content'; section.setAttribute('role', 'tabpanel'); section.innerHTML = sectionMarkup(false); tabs.after(section);
            btn.addEventListener('click', () => {
                document.querySelectorAll('#observerDashboard > .tab-content').forEach(node => node.classList.remove('active'));
                document.querySelectorAll('.observer-tabs .tab-btn').forEach(node => { node.classList.remove('active'); node.setAttribute('aria-selected', 'false'); });
                section.classList.add('active'); btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); loadQueue();
            });
        }
        bindControls();
    }

    function sectionMarkup(showBranch) {
        return `<div class="section-header proof-review-header"><div><span class="eyebrow">Evidence review</span><h2>Proof verification</h2><p class="section-note">Review uploaded certificate and internship proofs.</p></div><button type="button" class="btn btn-secondary btn-sm" data-proof-refresh>Refresh</button></div>
        <div class="glass-card proof-review-panel"><div class="proof-review-toolbar"><div class="form-group"><label class="form-label">Type</label><select class="form-select" data-proof-type><option value="all">All proofs</option><option value="internship">Internships</option><option value="certificate">Certificates</option></select></div>${showBranch ? '<div class="form-group"><label class="form-label">Branch</label><select class="form-select" data-proof-branch><option value="all">All branches</option><option>AIML</option><option>CT</option><option>EE</option><option>ME</option><option>CE</option><option>E&amp;C</option></select></div>' : ''}<span class="proof-review-count" data-proof-count>0 pending</span></div><div class="proof-review-table-shell"><table class="proof-review-table"><thead><tr><th>Student</th><th>Branch</th><th>Type</th><th>Entry</th><th>Uploaded</th><th>Action</th></tr></thead><tbody data-proof-body><tr><td colspan="6" class="proof-review-empty">Loading pending proofs…</td></tr></tbody></table></div></div>`;
    }

    function scopeRoot() { return document.getElementById(isAdmin ? 'tab-proof-review' : 'observerTab-proof-review'); }
    function updateCount() { const count = scopeRoot()?.querySelector('[data-proof-count]'); if (count) count.textContent = `${rows.length} pending`; }
    function showEmptyIfNeeded() { const body = scopeRoot()?.querySelector('[data-proof-body]'); if (!body || rows.length || body.querySelector('[data-proof-row]')) return; body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">No pending uploaded proofs in this scope.</td></tr>'; }

    function removeResolvedRow(type, id, action, rowElement) {
        rememberResolved(type, id);
        rows = rows.filter(row => !(String(row.type) === String(type) && String(row.id) === String(id)));
        updateCount();
        if (!rowElement) { renderRows(); return; }
        rowElement.classList.remove('is-resolving'); rowElement.classList.add(action === 'approved' ? 'is-approved' : 'is-rejected'); rowElement.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => { rowElement.classList.add('proof-review-row-leaving'); window.setTimeout(() => { rowElement.remove(); showEmptyIfNeeded(); }, 320); }, 180);
    }

    function writeProofLoadingPage(tab) {
        if (!tab || tab.closed) return;
        try {
            tab.opener = null;
            tab.document.open();
            tab.document.write('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loading proof</title><style>html,body{margin:0;min-height:100%;background:#10151f;color:#e7ebf3;font-family:system-ui,sans-serif}body{display:grid;place-items:center;min-height:100vh}.box{display:flex;align-items:center;gap:12px;padding:16px 18px;border:1px solid #30394a;border-radius:14px;background:#171e2a;box-shadow:0 16px 40px #0006}.spin{width:20px;height:20px;border:2px solid #566174;border-top-color:#70d7c8;border-radius:50%;animation:s .7s linear infinite}@keyframes s{to{transform:rotate(360deg)}}small{display:block;color:#97a2b6;margin-top:3px}</style></head><body><div class="box"><span class="spin"></span><div><strong>Loading proof…</strong><small>Please wait a moment.</small></div></div></body></html>');
            tab.document.close();
        } catch (_) {}
    }

    async function openProof(button, type, id) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Opening…';
        const proofTab = window.open('about:blank', '_blank');
        writeProofLoadingPage(proofTab);

        try {
            const response = await fetch(`${apiBase}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/proof`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
            if (!response.ok) {
                let data = null;
                try { data = await response.json(); } catch (_) {}
                throw new Error(data?.error?.message || 'Could not load proof.');
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            if (!proofTab || proofTab.closed) {
                URL.revokeObjectURL(objectUrl);
                throw new Error('The proof window was blocked or closed. Allow pop-ups and try again.');
            }
            proofTab.location.replace(objectUrl);
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
        } catch (error) {
            if (proofTab && !proofTab.closed) {
                try {
                    proofTab.document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#10151f;color:#e7ebf3;font-family:system-ui,sans-serif;padding:24px;box-sizing:border-box"><div style="max-width:420px;padding:18px;border:1px solid #47323a;border-radius:14px;background:#1b1820"><strong>Could not open proof</strong><p style="color:#c5c9d2">${esc(error.message)}</p></div></div>`;
                } catch (_) {}
            }
            if (window.showToast) window.showToast(error.message, 'error'); else alert(error.message);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    function bindControls() {
        const root = scopeRoot(); if (!root) return;
        root.querySelector('[data-proof-refresh]')?.addEventListener('click', () => loadQueue());
        root.querySelector('[data-proof-type]')?.addEventListener('change', () => loadQueue());
        root.querySelector('[data-proof-branch]')?.addEventListener('change', () => loadQueue());
        root.addEventListener('click', async event => {
            const button = event.target.closest('[data-proof-action]'); if (!button) return;
            const type = button.dataset.type, id = button.dataset.id, action = button.dataset.proofAction;
            if (action === 'view') { await openProof(button, type, id); return; }
            let note = '';
            if (action === 'rejected') { const response = window.prompt('Reason for rejection (optional):', ''); if (response === null) return; note = response; }
            const rowElement = button.closest('[data-proof-row]'); const actionButtons = rowElement?.querySelectorAll('[data-proof-action]') || [button];
            actionButtons.forEach(node => { node.disabled = true; }); rowElement?.classList.add('is-resolving'); button.textContent = action === 'approved' ? 'Approving…' : 'Rejecting…';
            try {
                const response = await fetch(`${apiBase}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ status: action, note }), cache: 'no-store' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) throw new Error(window.apiError ? window.apiError(data) : (data?.error?.message || 'Review failed.'));
                if (String(data?.data?.verification_status || '') !== String(action)) throw new Error('Review was not persisted. Please retry.');
                removeResolvedRow(type, id, action, rowElement);
                if (window.showToast) window.showToast(data.message || 'Proof review updated.', 'success');
                window.setTimeout(() => loadQueue({ silent: true }), 1200);
            } catch (error) {
                rowElement?.classList.remove('is-resolving'); actionButtons.forEach(node => { node.disabled = false; }); renderRows();
                if (window.showToast) window.showToast(error.message, 'error'); else alert(error.message);
            }
        });
    }

    async function loadQueue({ silent = false } = {}) {
        const root = scopeRoot(); if (!root) return;
        const sequence = ++loadSequence; const type = root.querySelector('[data-proof-type]')?.value || 'all'; const branch = root.querySelector('[data-proof-branch]')?.value || 'all';
        const params = new URLSearchParams(); if (type !== 'all') params.set('type', type); if (isAdmin && branch !== 'all') params.set('branch', branch); params.set('_ts', String(Date.now()));
        const body = root.querySelector('[data-proof-body]'); if (!silent && body) body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">Loading pending proofs…</td></tr>';
        try {
            const response = await fetch(`${apiBase}/pending?${params}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
            const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(window.apiError ? window.apiError(data) : 'Could not load pending proofs.'); if (sequence !== loadSequence) return;
            rows = (Array.isArray(data.data) ? data.data : []).filter(row => !isRecentlyResolved(row.type, row.id)); renderRows();
        } catch (error) { if (sequence !== loadSequence) return; if (!silent && body) body.innerHTML = `<tr><td colspan="6" class="proof-review-empty">${esc(error.message)}</td></tr>`; }
    }

    function renderRows() {
        const root = scopeRoot(); if (!root) return; const body = root.querySelector('[data-proof-body]'); updateCount(); if (!body) return;
        if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="proof-review-empty">No pending uploaded proofs in this scope.</td></tr>'; return; }
        body.innerHTML = rows.map(row => `<tr data-proof-row data-type="${esc(row.type)}" data-id="${esc(row.id)}"><td class="proof-review-student" data-label="Student"><strong>${esc(row.student_name)}</strong><small>${esc(row.student_prn)}</small></td><td class="proof-review-branch" data-label="Branch"><strong>${esc(row.branch)}</strong>${row.class ? `<small>${esc(row.class)}</small>` : ''}</td><td class="proof-review-type-cell" data-label="Type"><span class="proof-review-type">${esc(row.type)}</span></td><td class="proof-review-entry" data-label="Entry"><strong>${esc(row.entry_name)}</strong>${row.details ? `<small>${esc(row.details)}</small>` : ''}</td><td class="proof-review-uploaded" data-label="Uploaded"><span class="proof-review-mobile-label">Uploaded</span>${row.evidence_uploaded_at ? esc(new Date(row.evidence_uploaded_at).toLocaleString()) : '—'}</td><td class="proof-review-action-cell" data-label="Action"><div class="proof-review-actions"><button class="proof-action-btn proof-action-view" data-proof-action="view" data-type="${esc(row.type)}" data-id="${esc(row.id)}">View</button><button class="proof-action-btn proof-action-approve" data-proof-action="approved" data-type="${esc(row.type)}" data-id="${esc(row.id)}">Approve</button><button class="proof-action-btn proof-action-reject" data-proof-action="rejected" data-type="${esc(row.type)}" data-id="${esc(row.id)}">Reject</button></div></td></tr>`).join('');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeSection, { once: true }); else makeSection();
})();
