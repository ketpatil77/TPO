(() => {
  if (!document.body.classList.contains('admin-dashboard-page')) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let proofUrl = '';

  function ensureViewer() {
    if (document.getElementById('tpoCertificateProofViewer')) return;
    const viewer = document.createElement('div');
    viewer.id = 'tpoCertificateProofViewer';
    viewer.className = 'certificate-proof-viewer';
    viewer.innerHTML = `<div class="certificate-proof-viewer-card"><div class="certificate-proof-viewer-head"><strong>Certificate proof</strong><button type="button" class="btn btn-secondary btn-sm" data-close-proof>Close</button></div><div id="tpoCertificateProofStatus">Loading proof…</div><img id="tpoCertificateProofImage" alt="Certificate proof" hidden></div>`;
    viewer.addEventListener('click', event => {
      if (event.target === viewer || event.target.closest('[data-close-proof]')) closeProof();
    });
    document.body.appendChild(viewer);
  }

  function closeProof() {
    document.getElementById('tpoCertificateProofViewer')?.classList.remove('active');
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    proofUrl = '';
  }

  async function openProof(id) {
    ensureViewer();
    const viewer = document.getElementById('tpoCertificateProofViewer');
    const status = document.getElementById('tpoCertificateProofStatus');
    const image = document.getElementById('tpoCertificateProofImage');
    status.hidden = false;
    status.textContent = 'Loading private proof…';
    image.hidden = true;
    viewer.classList.add('active');
    try {
      const response = await fetch(`/api/admin/certificates/${encodeURIComponent(id)}/proof`);
      if (!response.ok) {
        let json = null;
        try { json = await response.json(); } catch (_) {}
        throw new Error(json?.error?.message || 'Could not open proof.');
      }
      const blob = await response.blob();
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      proofUrl = URL.createObjectURL(blob);
      image.src = proofUrl;
      image.hidden = false;
      status.hidden = true;
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function reviewCertificate(id, status) {
    const note = status === 'rejected' ? (prompt('Reason for rejection:') || '').trim() : '';
    if (status === 'rejected' && !note) return;
    const response = await fetch(`/api/admin/certificates/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note })
    });
    const json = await response.json();
    if (!response.ok) return showToast?.(json?.error?.message || 'Certificate review failed.', 'error');
    showToast?.(status === 'verified' ? 'Certificate verified.' : status === 'rejected' ? 'Certificate rejected.' : 'Certificate moved to pending.', 'success');
    const studentId = document.querySelector('[data-certificate-review-section]')?.dataset.studentId;
    if (studentId) loadReviewSection(studentId);
  }

  async function loadReviewSection(studentId) {
    const host = document.querySelector('[data-certificate-review-section]');
    if (!host || host.dataset.studentId !== String(studentId)) return;
    host.innerHTML = '<div class="candidate-empty">Loading certificate proofs…</div>';
    try {
      const response = await fetch(`/api/admin/certificates/student/${encodeURIComponent(studentId)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message || 'Could not load certificate proofs.');
      const rows = json.data || [];
      host.innerHTML = rows.length ? `<div class="certificate-review-grid">${rows.map(item => {
        const status = item.verification_status || 'pending';
        return `<article class="certificate-review-card"><div class="certificate-review-head"><div><h4>${esc(item.name || 'Certificate')}</h4><p>${esc(item.issuer || 'Issuer not specified')} · ${esc(item.date || '—')}</p></div><span class="certificate-review-status ${esc(status)}">${esc(status)}</span></div><p>${item.has_proof ? `Proof uploaded${item.evidence_bytes ? ` · ${Math.round(item.evidence_bytes/1024)} KB` : ''}` : 'No proof uploaded'}</p>${item.verification_note ? `<p><strong>Note:</strong> ${esc(item.verification_note)}</p>` : ''}<div class="certificate-review-actions">${item.has_proof ? `<button class="btn btn-secondary btn-sm" data-proof="${esc(item.id)}">View proof</button>` : ''}<button class="btn btn-primary btn-sm" data-review="verified" data-id="${esc(item.id)}" ${item.has_proof ? '' : 'disabled'}>Verify</button><button class="btn btn-danger btn-sm" data-review="rejected" data-id="${esc(item.id)}">Reject</button>${status !== 'pending' ? `<button class="btn btn-secondary btn-sm" data-review="pending" data-id="${esc(item.id)}">Reset</button>` : ''}</div></article>`;
      }).join('')}</div>` : '<div class="candidate-empty">No certificates recorded.</div>';
    } catch (error) {
      host.innerHTML = `<div class="candidate-empty">${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('click', event => {
    const proof = event.target.closest('[data-proof]');
    if (proof) { event.preventDefault(); openProof(proof.dataset.proof); return; }
    const review = event.target.closest('[data-review][data-id]');
    if (review) { event.preventDefault(); reviewCertificate(review.dataset.id, review.dataset.review); }
  });

  function installWrapper() {
    const original = window.openStudentModal;
    if (typeof original !== 'function' || original.__certificateReviewWrapped) return;
    const wrapped = function(studentId) {
      original(studentId);
      const content = document.getElementById('modalContent');
      if (!content) return;
      let section = content.querySelector('[data-certificate-review-section]');
      if (!section) {
        section = document.createElement('section');
        section.className = 'candidate-section certificate-review-section';
        section.innerHTML = '<div class="candidate-section-head"><h3>Certificate verification</h3><span>TPO review</span></div><div data-certificate-review-section></div>';
        content.appendChild(section);
      }
      const host = section.querySelector('[data-certificate-review-section]');
      host.dataset.studentId = String(studentId);
      loadReviewSection(studentId);
    };
    wrapped.__certificateReviewWrapped = true;
    window.openStudentModal = wrapped;
    try { openStudentModal = wrapped; } catch (_) {}
  }

  const timer = setInterval(() => {
    installWrapper();
    if (window.openStudentModal?.__certificateReviewWrapped) clearInterval(timer);
  }, 200);
  setTimeout(() => clearInterval(timer), 8000);
  ensureViewer();
})();
