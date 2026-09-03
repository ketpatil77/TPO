(() => {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    let proofInput = null;
    let wrapping = false;

    function ensureField() {
        const form = document.getElementById('internshipForm');
        if (!form || document.getElementById('internshipProof')) return;
        const submit = form.querySelector('button[type="submit"]');
        if (!submit) return;
        const group = document.createElement('div');
        group.className = 'form-group internship-proof-field';
        group.innerHTML = '<label class="form-label" for="internshipProof">Internship proof</label><input type="file" id="internshipProof" class="form-input" accept="image/jpeg,image/png,.jpg,.jpeg,.png"><div class="form-hint">JPG/PNG, maximum 400 KB. Proof is required within 48 hours. TPO/TPC verification happens after upload.</div><div id="internshipProofStatus" class="form-hint" aria-live="polite"></div>';
        submit.before(group);
        proofInput = group.querySelector('#internshipProof');
    }

    async function uploadProof(entryId, file) {
        const status = document.getElementById('internshipProofStatus');
        if (status) status.textContent = 'Uploading proof...';
        const body = new FormData();
        body.append('evidence', file);
        const response = await window.fetch(`/api/student/internship-evidence/${encodeURIComponent(entryId)}`, { method: 'POST', body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(window.apiError ? window.apiError(data) : 'Proof upload failed.');
        if (status) status.textContent = 'Proof uploaded. Verification status: pending.';
        return data;
    }

    function installFetchBridge() {
        if (wrapping || window.__internshipProofFetchWrapped) return;
        wrapping = true;
        const previousFetch = window.fetch.bind(window);
        window.fetch = async function proofAwareFetch(input, init = {}) {
            const url = typeof input === 'string' ? input : input?.url || '';
            const method = String(init.method || 'GET').toUpperCase();
            const isInternshipSave = (method === 'POST' && url === '/api/student/internships') || (method === 'PUT' && /^\/api\/student\/internships\/[^/]+$/.test(url));
            if (!isInternshipSave) return previousFetch(input, init);

            ensureField();
            const file = proofInput?.files?.[0] || null;
            const headers = new Headers(init.headers || {});
            if (file) headers.set('X-Proof-Attached', '1');
            const response = await previousFetch(input, { ...init, headers });
            if (!response.ok || !file) return response;

            const copy = response.clone();
            const payload = await copy.json().catch(() => null);
            const entryId = payload?.internship?.id;
            if (!entryId) return response;
            try {
                await uploadProof(entryId, file);
                if (proofInput) proofInput.value = '';
            } catch (error) {
                await previousFetch(`/api/student/proof-missing-notice/internship/${encodeURIComponent(entryId)}`, { method: 'POST' }).catch(() => {});
                if (window.showToast) window.showToast(error.message, 'error');
                else console.error(error);
            }
            return response;
        };
        window.__internshipProofFetchWrapped = true;
        wrapping = false;
    }

    function decorateInternships() {
        const root = document.getElementById('internshipsList');
        if (!root || root.dataset.proofStatusLoading === '1') return;
        root.dataset.proofStatusLoading = '1';
        window.fetch('/api/student/profile').then(response => response.json()).then(payload => {
            const items = payload?.data?.internships || [];
            const cards = [...root.querySelectorAll('.item-card')];
            cards.forEach((card, index) => {
                if (card.querySelector('.internship-proof-chip')) return;
                const item = items[index];
                if (!item) return;
                const chip = document.createElement('span');
                chip.className = `internship-proof-chip ${item.evidence_path ? 'has-proof' : 'missing-proof'}`;
                const status = item.verification_status || 'pending';
                chip.textContent = item.evidence_path ? `Proof: ${status}` : `Proof missing${item.proof_deadline ? ` · due ${new Date(item.proof_deadline).toLocaleString()}` : ''}`;
                card.querySelector('.item-details')?.appendChild(chip);
            });
        }).catch(() => {}).finally(() => { root.dataset.proofStatusLoading = '0'; });
    }

    function boot() {
        ensureField();
        installFetchBridge();
        decorateInternships();
        const root = document.getElementById('internshipsList');
        if (root && 'MutationObserver' in window) new MutationObserver(() => window.setTimeout(decorateInternships, 0)).observe(root, { childList: true });
        document.addEventListener('click', event => {
            if (event.target.closest('[onclick*="openInternshipModal"], [onclick*="editInternship"]')) window.setTimeout(ensureField, 0);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
