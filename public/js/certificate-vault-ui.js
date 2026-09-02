(() => {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    const TARGET_BYTES = 300 * 1024;
    const HARD_LIMIT_BYTES = 400 * 1024;
    const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
    const ACCEPTED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png']);
    let preparedBlob = null;
    let previewUrl = '';
    let viewerUrl = '';

    const esc = value => typeof escapeHtml === 'function'
        ? escapeHtml(value)
        : String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

    function kb(bytes) { return `${Math.max(1, Math.round(Number(bytes || 0) / 1024))} KB`; }

    function loadStyles() {
        if (document.querySelector('link[data-certificate-vault-css]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/certificate-vault.css?v=20260902-1';
        link.dataset.certificateVaultCss = 'true';
        document.head.appendChild(link);
    }

    function currentCertificate(id) {
        try { return (currentStudentData?.certificates || []).find(item => item.id === id) || null; }
        catch (_) { return null; }
    }

    function ensureUploadField() {
        const form = document.getElementById('certForm');
        if (!form || document.getElementById('certEvidenceFile')) return;
        const submit = form.querySelector('button[type="submit"]');
        const block = document.createElement('div');
        block.className = 'form-group certificate-evidence-field';
        block.innerHTML = `
            <label class="form-label" for="certEvidenceFile">Certificate image</label>
            <input id="certEvidenceFile" class="form-input" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png">
            <div class="form-hint">JPG, JPEG or PNG only. Your browser optimizes it before upload; PDFs are not accepted.</div>
            <div id="certEvidenceStatus" class="certificate-evidence-status">Choose a clear certificate image.</div>
            <div id="certEvidencePreview" class="certificate-evidence-preview" hidden>
                <img id="certEvidencePreviewImage" alt="Optimized certificate preview">
                <div><strong id="certEvidencePreviewSize"></strong><small>Optimized locally before upload</small></div>
            </div>`;
        submit?.before(block);
        document.getElementById('certEvidenceFile').addEventListener('change', handleFileChoice);
    }

    function ensureViewer() {
        if (document.getElementById('certificateEvidenceViewer')) return;
        const modal = document.createElement('div');
        modal.id = 'certificateEvidenceViewer';
        modal.className = 'modal-backdrop certificate-evidence-viewer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="glass-card modal-card certificate-evidence-viewer-card">
                <div class="modal-header"><div><span class="eyebrow">Private evidence</span><h3>Certificate proof</h3></div><button type="button" class="close-btn" id="closeCertificateEvidenceViewer" aria-label="Close certificate proof">&times;</button></div>
                <div id="certificateEvidenceViewerStatus" class="certificate-evidence-viewer-status">Loading certificate…</div>
                <div class="certificate-evidence-canvas" hidden><img id="certificateEvidenceImage" alt="Certificate proof"></div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('closeCertificateEvidenceViewer').addEventListener('click', closeCertificateEvidence);
        modal.addEventListener('click', event => { if (event.target === modal) closeCertificateEvidence(); });
    }

    function setStatus(message, state = '') {
        const status = document.getElementById('certEvidenceStatus');
        if (!status) return;
        status.className = `certificate-evidence-status${state ? ` is-${state}` : ''}`;
        status.textContent = message;
    }

    function clearPrepared() {
        preparedBlob = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        const preview = document.getElementById('certEvidencePreview');
        if (preview) preview.hidden = true;
        const image = document.getElementById('certEvidencePreviewImage');
        if (image) image.removeAttribute('src');
    }

    function sourceAllowed(file) {
        const extension = String(file.name || '').toLowerCase().split('.').pop();
        return ACCEPTED_SOURCE_TYPES.has(file.type) || ['jpg', 'jpeg', 'png'].includes(extension);
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image. Choose a clear JPG, JPEG or PNG file.')); };
            image.src = url;
        });
    }

    function canvasBlob(canvas, type, quality) {
        return new Promise(resolve => canvas.toBlob(resolve, type, quality));
    }

    async function compressCertificate(file) {
        if (!sourceAllowed(file)) throw new Error('Only JPG, JPEG or PNG certificate images are allowed.');
        if (file.size > MAX_SOURCE_BYTES) throw new Error('Source image is too large. Choose an image under 12 MB.');

        const image = await loadImage(file);
        const originalLong = Math.max(image.naturalWidth, image.naturalHeight);
        const dimensions = [1800, 1600, 1400].filter(size => size <= originalLong);
        if (!dimensions.length) dimensions.push(originalLong);
        const qualities = [0.82, 0.76, 0.70, 0.64, 0.58, 0.52];
        let fallback = null;

        for (const maxSide of dimensions) {
            const scale = Math.min(1, maxSide / originalLong);
            const width = Math.max(1, Math.round(image.naturalWidth * scale));
            const height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { alpha: false });
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.fillStyle = '#fff';
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);

            for (const quality of qualities) {
                let blob = await canvasBlob(canvas, 'image/webp', quality);
                if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', quality);
                if (!blob) continue;
                if (blob.size <= HARD_LIMIT_BYTES && (!fallback || blob.size > fallback.size)) fallback = blob;
                if (blob.size <= TARGET_BYTES) return blob;
            }
        }

        if (fallback && fallback.size <= HARD_LIMIT_BYTES) return fallback;
        throw new Error('This image cannot be optimized below 400 KB without hurting readability. Crop unnecessary borders and try again.');
    }

    async function handleFileChoice(event) {
        clearPrepared();
        const file = event.target.files?.[0];
        if (!file) return setStatus('Choose a clear certificate image.');
        setStatus(`Optimizing ${file.name} on this device…`, 'working');
        try {
            preparedBlob = await compressCertificate(file);
            previewUrl = URL.createObjectURL(preparedBlob);
            document.getElementById('certEvidencePreviewImage').src = previewUrl;
            document.getElementById('certEvidencePreviewSize').textContent = `${kb(file.size)} → ${kb(preparedBlob.size)}`;
            document.getElementById('certEvidencePreview').hidden = false;
            setStatus(`Ready to upload · ${kb(preparedBlob.size)} optimized image`, 'success');
        } catch (error) {
            event.target.value = '';
            setStatus(error.message, 'error');
            if (typeof showToast === 'function') showToast(error.message, 'error');
        }
    }

    async function vaultSubmit(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const form = event.currentTarget;
        const token = localStorage.getItem('tpo_token');
        const id = document.getElementById('certId').value;
        const existing = id ? currentCertificate(id) : null;
        const button = form.querySelector('button[type="submit"]');

        if (!id && !preparedBlob) {
            setStatus('Certificate image is required for a new certificate.', 'error');
            return typeof showToast === 'function' && showToast('Add a JPG, JPEG or PNG certificate image.', 'error');
        }

        const payload = {
            name: document.getElementById('certName').value.trim(),
            issuer: document.getElementById('certIssuer').value.trim(),
            date: document.getElementById('certDate').value,
            mode: document.getElementById('certMode').value
        };
        const url = id ? `/api/student/certificates/${id}` : '/api/student/certificates';

        if (typeof setButtonLoading === 'function') setButtonLoading(button, true, preparedBlob ? 'Saving & uploading' : 'Saving certificate');
        try {
            const response = await fetch(url, {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(typeof apiError === 'function' ? apiError(result) : (result.error?.message || result.error || 'Could not save certificate.'));
            const certificateId = id || result.certificate?.id;
            if (!certificateId) throw new Error('Certificate saved but its ID was not returned. Refresh and try adding proof.');

            if (preparedBlob) {
                const uploadForm = new FormData();
                uploadForm.append('certificate', preparedBlob, preparedBlob.type === 'image/jpeg' ? 'certificate.jpg' : 'certificate.webp');
                const evidenceResponse = await fetch(`/api/student/certificates/${certificateId}/evidence`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: uploadForm
                });
                const evidenceResult = await evidenceResponse.json();
                if (!evidenceResponse.ok || !evidenceResult.success) {
                    document.getElementById('certId').value = certificateId;
                    throw new Error(evidenceResult.error?.message || 'Certificate details were saved, but proof upload failed. Retry the image upload.');
                }
            }

            clearPrepared();
            document.getElementById('certEvidenceFile').value = '';
            if (typeof closeCertificateModal === 'function') closeCertificateModal();
            if (typeof showToast === 'function') showToast(preparedBlob ? 'Certificate and proof saved.' : (existing?.evidence_path ? 'Certificate updated. Existing proof kept.' : 'Certificate saved.'), 'success');
            await loadDashboardData();
        } catch (error) {
            setStatus(error.message || 'Could not save certificate proof.', 'error');
            if (typeof showToast === 'function') showToast(error.message || 'Could not save certificate.', 'error');
        } finally {
            if (typeof setButtonLoading === 'function') setButtonLoading(button, false);
        }
    }

    function vaultRenderCertificates(list) {
        const container = document.getElementById('certificatesList');
        if (!container) return;
        if (!list?.length) {
            container.innerHTML = '<div class="glass-card certificate-vault-empty">No certificates added yet. Add a certificate with a clear JPG, JPEG or PNG proof.</div>';
            return;
        }
        container.innerHTML = list.map(item => {
            const hasProof = Boolean(item.evidence_path);
            return `<div class="glass-card item-card certificate-vault-card">
                <div class="item-details">
                    <div class="certificate-vault-title"><h4>${esc(item.name)}</h4><span class="badge badge-${item.mode === 'offline' ? 'offline' : 'online'}">${esc(item.mode || 'online')}</span></div>
                    <p><strong>Issued by:</strong> ${esc(item.issuer)}</p>
                    <p class="certificate-vault-date">📅 ${esc(item.date)}</p>
                    <span class="certificate-proof-state ${hasProof ? 'has-proof' : 'no-proof'}">${hasProof ? `✓ Proof saved${item.evidence_size_bytes ? ` · ${kb(item.evidence_size_bytes)}` : ''}` : 'Proof not uploaded yet'}</span>
                </div>
                <div class="item-actions certificate-vault-actions">
                    ${hasProof ? `<button class="btn btn-primary btn-sm" type="button" onclick="openCertificateEvidence('${item.id}')">View proof</button>` : `<button class="btn btn-primary btn-sm" type="button" onclick="editCertificate('${item.id}')">Add proof</button>`}
                    <button class="btn btn-secondary btn-sm" type="button" onclick="editCertificate('${item.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" type="button" onclick="deleteCertificate('${item.id}')">Delete</button>
                </div>
            </div>`;
        }).join('');
    }

    async function openCertificateEvidence(id) {
        ensureViewer();
        const modal = document.getElementById('certificateEvidenceViewer');
        const status = document.getElementById('certificateEvidenceViewerStatus');
        const canvas = modal.querySelector('.certificate-evidence-canvas');
        const image = document.getElementById('certificateEvidenceImage');
        if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        viewerUrl = '';
        image.removeAttribute('src');
        canvas.hidden = true;
        status.hidden = false;
        status.textContent = 'Loading private certificate proof…';
        modal.classList.add('active');
        try {
            const response = await fetch(`/api/student/certificates/${id}/evidence`, { headers: { Authorization: `Bearer ${localStorage.getItem('tpo_token')}` } });
            if (!response.ok) {
                let result = null;
                try { result = await response.json(); } catch (_) {}
                throw new Error(result?.error?.message || 'Could not open certificate proof.');
            }
            const blob = await response.blob();
            viewerUrl = URL.createObjectURL(blob);
            image.src = viewerUrl;
            status.hidden = true;
            canvas.hidden = false;
        } catch (error) {
            status.textContent = error.message;
        }
    }

    function closeCertificateEvidence() {
        const modal = document.getElementById('certificateEvidenceViewer');
        modal?.classList.remove('active');
        if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        viewerUrl = '';
    }

    function patchCertificateModal() {
        const originalOpen = window.openCertificateModal;
        if (typeof originalOpen !== 'function' || originalOpen.__certificateVaultWrapped) return;
        const wrapped = function(id = null) {
            originalOpen(id);
            ensureUploadField();
            clearPrepared();
            const input = document.getElementById('certEvidenceFile');
            if (input) input.value = '';
            const item = id ? currentCertificate(id) : null;
            if (item?.evidence_path) setStatus(`Existing proof saved${item.evidence_size_bytes ? ` · ${kb(item.evidence_size_bytes)}` : ''}. Choose another image only to replace it.`, 'success');
            else setStatus(id ? 'No proof uploaded yet. Add a clear JPG, JPEG or PNG image.' : 'Certificate image is required for a new certificate.');
        };
        wrapped.__certificateVaultWrapped = true;
        window.openCertificateModal = wrapped;
        try { openCertificateModal = wrapped; } catch (_) {}
    }

    function install() {
        loadStyles();
        ensureUploadField();
        ensureViewer();
        patchCertificateModal();
        const form = document.getElementById('certForm');
        if (form && !form.dataset.certificateVaultSubmit) {
            form.dataset.certificateVaultSubmit = 'true';
            form.addEventListener('submit', vaultSubmit, true);
        }
        window.openCertificateEvidence = openCertificateEvidence;
        window.closeCertificateEvidence = closeCertificateEvidence;
        window.renderCertificates = vaultRenderCertificates;
        try { renderCertificates = vaultRenderCertificates; } catch (_) {}
        try {
            if (currentStudentData?.certificates) vaultRenderCertificates(currentStudentData.certificates);
        } catch (_) {}
    }

    install();
})();
