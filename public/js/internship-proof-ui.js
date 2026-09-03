(() => {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    let proofInput = null;
    let wrapping = false;
    let viewerUrl = '';

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

    function ensureViewer() {
        if (document.getElementById('internshipEvidenceViewer')) return;
        const modal = document.createElement('div');
        modal.id = 'internshipEvidenceViewer';
        modal.className = 'modal-backdrop certificate-evidence-viewer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="glass-card modal-card certificate-evidence-viewer-card">
                <div class="modal-header"><div><span class="eyebrow">Private evidence</span><h3>Internship proof</h3></div><button type="button" class="close-btn" id="closeInternshipEvidenceViewer" aria-label="Close internship proof">&times;</button></div>
                <div id="internshipEvidenceViewerStatus" class="certificate-evidence-viewer-status">Loading internship proof…</div>
                <div class="certificate-evidence-canvas" hidden><img id="internshipEvidenceImage" alt="Internship proof"></div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('closeInternshipEvidenceViewer').addEventListener('click', closeInternshipEvidence);
        modal.addEventListener('click', event => { if (event.target === modal) closeInternshipEvidence(); });
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
                const item = items[index];
                if (!item) return;

                if (!card.querySelector('.internship-proof-chip')) {
                    const chip = document.createElement('span');
                    chip.className = `internship-proof-chip ${item.evidence_path ? 'has-proof' : 'missing-proof'}`;
                    const status = item.verification_status || 'pending';
                    chip.textContent = item.evidence_path ? `Proof: ${status}` : `Proof missing${item.proof_deadline ? ` · due ${new Date(item.proof_deadline).toLocaleString()}` : ''}`;
                    card.querySelector('.item-details')?.appendChild(chip);
                }

                const actions = card.querySelector('.item-actions');
                if (!actions || actions.querySelector('.internship-proof-action')) return;
                const proofButton = document.createElement('button');
                proofButton.type = 'button';
                proofButton.className = 'btn btn-primary btn-sm internship-proof-action';
                proofButton.textContent = item.evidence_path ? 'View proof' : 'Add proof';
                proofButton.addEventListener('click', () => {
                    if (item.evidence_path) openInternshipEvidence(item.id);
                    else if (typeof window.editInternship === 'function') window.editInternship(item.id);
                });
                actions.prepend(proofButton);
            });
        }).catch(() => {}).finally(() => { root.dataset.proofStatusLoading = '0'; });
    }

    async function openInternshipEvidence(id) {
        ensureViewer();
        const modal = document.getElementById('internshipEvidenceViewer');
        const status = document.getElementById('internshipEvidenceViewerStatus');
        const canvas = modal.querySelector('.certificate-evidence-canvas');
        const image = document.getElementById('internshipEvidenceImage');
        if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        viewerUrl = '';
        image.removeAttribute('src');
        canvas.hidden = true;
        status.hidden = false;
        status.textContent = 'Loading private internship proof…';
        modal.classList.add('active');
        try {
            const response = await fetch(`/api/student/internship-evidence/${encodeURIComponent(id)}`);
            if (!response.ok) {
                let result = null;
                try { result = await response.json(); } catch (_) {}
                throw new Error(result?.error?.message || 'Could not open internship proof.');
            }
            const blob = await response.blob();
            viewerUrl = URL.createObjectURL(blob);
            image.src = viewerUrl;
            status.hidden = true;
            canvas.hidden = false;
        } catch (error) {
            status.textContent = error.message || 'Could not open internship proof.';
        }
    }

    function closeInternshipEvidence() {
        const modal = document.getElementById('internshipEvidenceViewer');
        if (modal) modal.classList.remove('active');
        if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        viewerUrl = '';
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

    window.openInternshipEvidence = openInternshipEvidence;
    window.closeInternshipEvidence = closeInternshipEvidence;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
