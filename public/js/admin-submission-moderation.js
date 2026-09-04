(() => {
  if (window.__AIT_ADMIN_SUBMISSION_MODERATION__) return;
  window.__AIT_ADMIN_SUBMISSION_MODERATION__ = true;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const token = () => localStorage.getItem('tpo_admin_token') || '';
  const labels = { project:'Project', research:'Research paper', internship:'Internship', certificate:'Certificate' };

  function statusOf(item = {}) {
    const value = String(item.verification_status || 'pending').toLowerCase();
    return value === 'approved' ? 'verified' : value;
  }
  function riskBadge(item = {}) {
    const m = item.moderation || {};
    const status = statusOf(item);
    const level = String(m.level || 'low').toLowerCase();
    let label;
    let color;
    if (status === 'rejected') { label = 'Rejected · 0 pts'; color = '#ef4444'; }
    else if (status === 'verified' && level === 'low') { label = 'Auto-verified'; color = '#10b981'; }
    else if (status === 'verified') { label = 'Staff verified'; color = '#10b981'; }
    else if (level === 'high') { label = 'High risk · 0 pts'; color = '#ef4444'; }
    else if (level === 'medium') { label = 'Needs review · 0 pts'; color = '#f59e0b'; }
    else if (m.audit_sample) { label = 'Random audit'; color = '#3b82f6'; }
    else { label = 'Pending review · 0 pts'; color = '#f59e0b'; }
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:${color}18;color:${color};font-size:11px;font-weight:800">${esc(label)} · risk ${Number(m.score||0)}</span>`;
  }

  function titleFor(type,item) {
    if (type === 'project' || type === 'research') return item.title || labels[type];
    if (type === 'internship') return `${item.company || 'Internship'}${item.role ? ` · ${item.role}` : ''}`;
    return `${item.name || 'Certificate'}${item.issuer ? ` · ${item.issuer}` : ''}`;
  }

  function card(type,item,studentId) {
    const reasons = item.moderation?.reasons || [];
    const audit = item.moderation?.audit_sample ? '<small style="color:#60a5fa">Selected in the stable 5% random audit sample. It still scores unless staff finds a problem.</small>' : '';
    return `<article style="border:1px solid var(--border-color);border-radius:10px;padding:10px;display:grid;gap:7px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><strong>${esc(titleFor(type,item))}</strong>${riskBadge(item)}</div>
      ${reasons.length ? `<small style="color:var(--text-muted)">${esc(reasons.join(' '))}</small>` : '<small style="color:var(--text-muted)">Automatic checks found no obvious quality problem.</small>'}
      ${audit}
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        ${statusOf(item) !== 'verified' ? `<button type="button" class="btn btn-primary btn-sm" data-moderation-review="approved" data-type="${esc(type)}" data-student-id="${esc(studentId)}" data-record-id="${esc(item.id)}">Verify</button>` : ''}
        ${statusOf(item) !== 'rejected' ? `<button type="button" class="btn btn-secondary btn-sm" data-moderation-review="rejected" data-type="${esc(type)}" data-student-id="${esc(studentId)}" data-record-id="${esc(item.id)}">Reject</button>` : ''}
        <button type="button" class="btn btn-danger btn-sm" data-moderation-delete="${esc(type)}" data-student-id="${esc(studentId)}" data-record-id="${esc(item.id)}">Delete with reason</button>
      </div>
    </article>`;
  }

  async function loadModeration(studentId) {
    const host = document.getElementById('adminSubmissionModerationPanel');
    if (!host) return;
    host.innerHTML = '<p style="color:var(--text-muted)">Running automatic quality checks…</p>';
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}/moderation`, { headers:{ Authorization:`Bearer ${token()}` } });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Moderation scan failed.');
      const groups = [
        ['project', json.data.projects || []],
        ['research', json.data.research || []],
        ['internship', json.data.internships || []],
        ['certificate', json.data.certificates || []]
      ];
      const summary = json.data.summary || {};
      const flagged = Number(summary.flagged ?? groups.reduce((sum,[,rows]) => sum + rows.filter(row => row.moderation?.needs_review).length, 0));
      const audits = groups.reduce((sum,[,rows]) => sum + rows.filter(row => row.moderation?.audit_sample).length, 0);
      host.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap"><div><strong>Automatic integrity scan</strong><div style="color:var(--text-muted);font-size:12px">Auto-verified means points are active. Pending, flagged, rejected, or unverified evidence always earns 0 until cleared.</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="badge ${flagged ? 'badge-offline' : 'badge-online'}">${flagged} flagged</span><span class="badge badge-info">Trust ${Number(summary.trust_score ?? 100)}/100</span>${audits ? `<span class="badge badge-info">${audits} audit sample</span>` : ''}</div></div>` + groups.map(([type,rows]) => rows.length ? `<details ${rows.some(row=>row.moderation?.needs_review||row.moderation?.audit_sample)?'open':''}><summary><strong>${esc(labels[type])}s (${rows.length})</strong></summary><div style="display:grid;gap:8px;margin-top:8px">${rows.map(item=>card(type,item,studentId)).join('')}</div></details>` : '').join('');
    } catch (error) {
      host.innerHTML = `<p style="color:#ef4444">${esc(error.message)}</p>`;
    }
  }

  async function reviewRecord(button) {
    const status = button.dataset.moderationReview;
    const type = button.dataset.type;
    const studentId = button.dataset.studentId;
    const id = button.dataset.recordId;
    if (!status || !type || !studentId || !id) return;
    let note = '';
    if (status === 'rejected') {
      note = window.prompt(`Why are you rejecting this ${String(labels[type] || 'record').toLowerCase()}?`, 'Invalid, duplicate, misleading, or unverifiable information') || '';
      note = note.trim().replace(/\s+/g,' ');
      if (note.length < 5) { showToast?.('Give a clear rejection reason.', 'error'); return; }
    }
    if (!confirm(`${status === 'approved' ? 'Verify' : 'Reject'} this ${labels[type] || 'record'}?${note ? `\n\nReason: ${note}` : ''}`)) return;
    const original = button.textContent;
    button.disabled = true; button.textContent = status === 'approved' ? 'Verifying…' : 'Rejecting…';
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}/moderation/${encodeURIComponent(type)}/${encodeURIComponent(id)}/review`, {
        method:'POST', headers:{ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' }, body:JSON.stringify({ status, note })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(typeof json.error === 'string' ? json.error : json.error?.message || 'Review failed.');
      showToast?.(`${labels[type]} ${status === 'approved' ? 'verified' : 'rejected'}.`, 'success');
      await loadModeration(studentId);
      if (typeof loadAdminStudents === 'function') await loadAdminStudents();
    } catch (error) {
      showToast?.(error.message, 'error');
      button.disabled = false; button.textContent = original;
    }
  }

  function askDeletionReason(type) {
    const reason = window.prompt(`Why are you deleting this ${String(labels[type] || 'record').toLowerCase()}?\n\nThis reason will be shown to the student and stored in the audit history.`, 'Invalid or misleading information');
    if (reason === null) return null;
    const clean = reason.trim().replace(/\s+/g, ' ');
    if (clean.length < 5) { showToast?.('Enter a clear deletion reason of at least 5 characters.', 'error'); return null; }
    if (clean.length > 300) { showToast?.('Deletion reason must be 300 characters or fewer.', 'error'); return null; }
    return clean;
  }

  async function removeRecord(button) {
    const type = button.dataset.moderationDelete;
    const studentId = button.dataset.studentId;
    const id = button.dataset.recordId;
    if (!type || !studentId || !id) return;
    const reason = askDeletionReason(type);
    if (!reason) return;
    if (!confirm(`Delete this ${labels[type] || 'record'}?\n\nReason: ${reason}\n\nThe student will be notified and Profile Points will be recalculated.`)) return;
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Deleting…';
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}/moderation/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
        method:'DELETE', headers:{ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' }, body:JSON.stringify({ reason })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(typeof json.error === 'string' ? json.error : json.error?.message || 'Delete failed.');
      showToast?.(`${labels[type]} deleted. Student notified with the reason.`, 'success');
      await loadModeration(studentId);
      if (typeof loadAdminStudents === 'function') await loadAdminStudents();
    } catch (error) {
      showToast?.(error.message, 'error');
      button.disabled = false; button.textContent = original;
    }
  }

  function install() {
    if (typeof window.openStudentModal !== 'function' || window.openStudentModal.__moderationWrapped) return false;
    const original = window.openStudentModal;
    const wrapped = function(studentId) {
      const result = original.apply(this, arguments);
      const content = document.getElementById('modalContent');
      if (content) {
        let panel = document.getElementById('adminSubmissionModerationPanel');
        if (!panel) {
          panel = document.createElement('section'); panel.id = 'adminSubmissionModerationPanel';
          panel.style.cssText = 'margin:0 0 1rem;padding:1rem;border:1px solid var(--border-color);border-radius:12px;background:var(--surface-muted)';
          content.prepend(panel);
        }
        loadModeration(studentId);
      }
      return result;
    };
    wrapped.__moderationWrapped = true;
    window.openStudentModal = wrapped;
    document.addEventListener('click', event => {
      const review = event.target.closest('[data-moderation-review]');
      if (review) { event.preventDefault(); event.stopPropagation(); reviewRecord(review); return; }
      const button = event.target.closest('[data-moderation-delete]');
      if (button) { event.preventDefault(); event.stopPropagation(); removeRecord(button); }
    });
    return true;
  }

  if (!install()) {
    let tries = 0;
    const timer = setInterval(() => { if (install() || ++tries > 40) clearInterval(timer); }, 100);
  }
})();
