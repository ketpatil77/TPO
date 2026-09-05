(() => {
  if (window.__AIT_ADMIN_SUBMISSION_MODERATION_V3__) return;
  window.__AIT_ADMIN_SUBMISSION_MODERATION_V3__ = true;

  if (!document.querySelector('script[data-flagged-review-queue]')) {
    const queueScript = document.createElement('script');
    queueScript.src = '/js/flagged-review-queue.js?v=20260905-1';
    queueScript.defer = true;
    queueScript.dataset.flaggedReviewQueue = '1';
    document.head.appendChild(queueScript);
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const token = () => localStorage.getItem('tpo_admin_token') || '';
  const adminHeaders = (extra = {}) => {
    const legacyToken = token();
    return legacyToken ? { ...extra, Authorization:`Bearer ${legacyToken}` } : { ...extra };
  };
  const labels = { project:'Project', research:'Research paper', internship:'Internship', certificate:'Certificate' };

  function statusBadge(item = {}) {
    const m = item.moderation || {};
    const status = String(item.moderation_status || '').toLowerCase();
    let label = 'Auto-approved'; let color = '#10b981';
    if (status === 'rejected' || m.staff_rejected) { label = 'Rejected'; color = '#ef4444'; }
    else if (status === 'verified' || m.staff_approved) { label = 'Approved'; color = '#10b981'; }
    else if (m.duplicate) { label = 'Duplicate · 0 pts'; color = '#ef4444'; }
    else if (m.needs_review) { label = 'Needs review · 0 pts'; color = '#f59e0b'; }
    else if (m.audit_sample) { label = `Random audit · ${Number(item.profile_points || 0)} pts`; color = '#3b82f6'; }
    else if (item.profile_points > 0) label = `Auto-approved · ${Number(item.profile_points)} pts`;
    else if (item.moderation_status === 'pending' && item.name) { label = 'Pending verification · 0 pts'; color = '#f59e0b'; }
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:${color}18;color:${color};font-size:11px;font-weight:800">${esc(label)}</span>`;
  }

  function titleFor(type,item) {
    if (type === 'project' || type === 'research') return item.title || labels[type];
    if (type === 'internship') return `${item.company || 'Internship'}${item.role ? ` · ${item.role}` : ''}`;
    return `${item.name || 'Certificate'}${item.issuer ? ` · ${item.issuer}` : ''}`;
  }

  function card(type,item,studentId) {
    const reasons = item.moderation?.reasons || [];
    const audit = item.moderation?.audit_sample ? '<small style="color:#60a5fa">Selected for random audit. It keeps its automatic points unless staff rejects it.</small>' : '';
    return `<article style="border:1px solid var(--border-color);border-radius:10px;padding:10px;display:grid;gap:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><strong>${esc(titleFor(type,item))}</strong>${statusBadge(item)}</div>
      ${reasons.length ? `<small style="color:var(--text-muted)">${esc(reasons.join(' '))}</small>` : '<small style="color:var(--text-muted)">Automatic checks found no obvious quality problem.</small>'}
      ${audit}
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="btn btn-success btn-sm" data-moderation-review="approve" data-type="${esc(type)}" data-student-id="${esc(studentId)}" data-record-id="${esc(item.id)}">Approve</button>
        <button type="button" class="btn btn-danger btn-sm" data-moderation-review="reject" data-type="${esc(type)}" data-student-id="${esc(studentId)}" data-record-id="${esc(item.id)}">Reject</button>
      </div>
    </article>`;
  }

  async function loadModeration(studentId) {
    const host = document.getElementById('adminSubmissionModerationPanel');
    if (!host) return;
    host.innerHTML = '<p style="color:var(--text-muted)">Running automatic quality checks…</p>';
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}/moderation`, {
        credentials:'same-origin',
        headers:adminHeaders()
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(typeof json.error === 'string' ? json.error : json.error?.message || 'Moderation scan failed.');
      const groups = [['project',json.data.projects||[]],['research',json.data.research||[]],['internship',json.data.internships||[]],['certificate',json.data.certificates||[]]];
      const summary = json.data.summary || {};
      const flagged = Number(summary.flagged ?? groups.reduce((sum,[,rows]) => sum + rows.filter(row => row.moderation?.needs_review).length,0));
      host.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap"><div><strong>Automatic integrity scan</strong><div style="color:var(--text-muted);font-size:12px">Clean entries score automatically. Suspicious entries score 0 until approved. Certificates score only after verification.</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="badge ${flagged ? 'badge-offline':'badge-online'}">${flagged} flagged</span><span class="badge badge-info">Trust ${Number(summary.trust_score ?? 100)}/100</span></div></div>` + groups.map(([type,rows]) => rows.length ? `<details ${rows.some(row=>row.moderation?.needs_review||row.moderation?.audit_sample)?'open':''}><summary><strong>${esc(labels[type])}s (${rows.length})</strong></summary><div style="display:grid;gap:8px;margin-top:8px">${rows.map(item=>card(type,item,studentId)).join('')}</div></details>` : '').join('');
    } catch (error) {
      host.innerHTML = `<p style="color:#ef4444">${esc(error.message)}</p>`;
    }
  }

  function askRejectReason(type) {
    const value = window.prompt(`Why are you rejecting this ${String(labels[type] || 'record').toLowerCase()}?\n\nThe student will see this reason.`, 'Invalid, duplicate, misleading, or unsupported information');
    if (value === null) return null;
    const clean = value.trim().replace(/\s+/g,' ');
    if (clean.length < 5 || clean.length > 300) { showToast?.('Reason must be 5 to 300 characters.', 'error'); return null; }
    return clean;
  }

  async function review(button) {
    const decision = button.dataset.moderationReview;
    const type = button.dataset.type;
    const studentId = button.dataset.studentId;
    const id = button.dataset.recordId;
    if (!decision || !type || !studentId || !id) return;
    const reason = decision === 'reject' ? askRejectReason(type) : '';
    if (decision === 'reject' && !reason) return;
    if (!confirm(`${decision === 'approve' ? 'Approve' : 'Reject'} this ${labels[type] || 'record'}?${reason ? `\n\nReason: ${reason}` : ''}\n\nProfile Points will recalculate immediately.`)) return;
    const original = button.textContent;
    button.disabled = true; button.textContent = decision === 'approve' ? 'Approving…' : 'Rejecting…';
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}/moderation/${encodeURIComponent(type)}/${encodeURIComponent(id)}/review`, {
        method:'POST',
        credentials:'same-origin',
        headers:adminHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({ decision, reason })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(typeof json.error === 'string' ? json.error : json.error?.message || 'Review failed.');
      showToast?.(`${labels[type]} ${decision === 'approve' ? 'approved' : 'rejected'}. Ranking recalculated.`, 'success');
      await loadModeration(studentId);
      if (typeof loadAdminStudents === 'function') await loadAdminStudents();
    } catch (error) {
      showToast?.(error.message, 'error');
      button.disabled = false; button.textContent = original;
    }
  }

  async function impersonateFromTpo(button) {
    const input = document.getElementById('impersonatePrn');
    const prn = input?.value.trim();
    if (!prn) return showToast?.('Enter a PRN to login.', 'error');

    // Open synchronously while the click still has a user gesture. Mobile browsers otherwise
    // treat the student tab as a popup and block it after the API request completes.
    const studentWindow = window.open('about:blank', '_blank');
    if (!studentWindow) return showToast?.('Student window was blocked. Allow pop-ups for this portal and retry. Your TPO session is unchanged.', 'error');
    try {
      studentWindow.opener = null;
      studentWindow.document.title = 'Opening student profile…';
      studentWindow.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Opening student profile…</p>';
    } catch (_) {}

    const original = button.textContent;
    button.disabled = true; button.textContent = 'Logging in…';
    try {
      // Admin authentication is now cookie-first (HttpOnly adminToken). Keep support for an
      // older localStorage bearer token if one exists, but never require it.
      const response = await fetch(`/api/admin/students/${encodeURIComponent(prn)}/impersonate`, {
        method:'POST',
        credentials:'same-origin',
        headers:adminHeaders()
      });
      const json = await response.json();
      if (!response.ok || !json.success || !json.token) {
        const message = typeof json.error === 'string' ? json.error : json.error?.message || 'Unable to open student profile.';
        if (response.status === 401 || response.status === 403) throw new Error('Your TPO session has expired. Sign in again.');
        throw new Error(message);
      }
      input.value = '';
      studentWindow.location.replace(`/dashboard?impersonate_token=${encodeURIComponent(json.token)}`);
      showToast?.('Student profile opened in a separate support tab. TPO remains signed in here.', 'success');
    } catch (error) {
      try { studentWindow.close(); } catch (_) {}
      showToast?.(error.message || 'Unable to open student profile.', 'error');
    } finally {
      button.disabled = false; button.textContent = original;
    }
  }

  function install() {
    if (typeof window.openStudentModal !== 'function' || window.openStudentModal.__moderationV3Wrapped) return false;
    const original = window.openStudentModal;
    const wrapped = function(studentId) {
      const result = original.apply(this, arguments);
      const content = document.getElementById('modalContent');
      if (content) {
        let panel = document.getElementById('adminSubmissionModerationPanel');
        if (!panel) {
          panel = document.createElement('section'); panel.id='adminSubmissionModerationPanel';
          panel.style.cssText='margin:0 0 1rem;padding:1rem;border:1px solid var(--border-color);border-radius:12px;background:var(--surface-muted)';
          content.prepend(panel);
        }
        loadModeration(studentId);
      }
      return result;
    };
    wrapped.__moderationV3Wrapped = true;
    window.openStudentModal = wrapped;
    document.addEventListener('click', event => {
      const reviewButton = event.target.closest('[data-moderation-review]');
      if (reviewButton) { event.preventDefault(); event.stopPropagation(); review(reviewButton); }
    });
    document.addEventListener('click', event => {
      const button = event.target.closest('#btnImpersonate');
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      impersonateFromTpo(button);
    }, true);
    return true;
  }

  if (!install()) {
    let tries=0; const timer=setInterval(() => { if (install() || ++tries > 40) clearInterval(timer); },100);
  }
})();
