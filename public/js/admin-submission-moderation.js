(() => {
  if (window.__AIT_ADMIN_SUBMISSION_MODERATION__) return;
  window.__AIT_ADMIN_SUBMISSION_MODERATION__ = true;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const token = () => localStorage.getItem('tpo_admin_token') || '';
  const labels = { project:'Project', research:'Research paper', internship:'Internship', certificate:'Certificate' };

  function riskBadge(m = {}) {
    const level = String(m.level || 'low').toLowerCase();
    const label = level === 'high' ? 'High risk' : level === 'medium' ? 'Needs review' : m.audit_sample ? 'Random audit' : 'Auto-approved';
    const color = level === 'high' ? '#ef4444' : level === 'medium' ? '#f59e0b' : m.audit_sample ? '#3b82f6' : '#10b981';
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:${color}18;color:${color};font-size:11px;font-weight:800">${esc(label)} · ${Number(m.score||0)}</span>`;
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
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><strong>${esc(titleFor(type,item))}</strong>${riskBadge(item.moderation)}</div>
      ${reasons.length ? `<small style="color:var(--text-muted)">${esc(reasons.join(' '))}</small>` : '<small style="color:var(--text-muted)">Automatic checks found no obvious quality problem.</small>'}
      ${audit}
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-danger btn-sm" data-moderation-delete="${esc(type)}" data-student-id="${esc(studentId)}" data-record-id="${esc(item.id)}">Delete</button></div>
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
      host.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap"><div><strong>Automatic integrity scan</strong><div style="color:var(--text-muted);font-size:12px">Low-risk items are handled automatically. Staff only needs suspicious records and occasional audits.</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="badge ${flagged ? 'badge-offline' : 'badge-online'}">${flagged} flagged</span><span class="badge badge-info">Trust ${Number(summary.trust_score ?? 100)}/100</span>${audits ? `<span class="badge badge-info">${audits} audit sample</span>` : ''}</div></div>` + groups.map(([type,rows]) => rows.length ? `<details ${rows.some(row=>row.moderation?.needs_review||row.moderation?.audit_sample)?'open':''}><summary><strong>${esc(labels[type])}s (${rows.length})</strong></summary><div style="display:grid;gap:8px;margin-top:8px">${rows.map(item=>card(type,item,studentId)).join('')}</div></details>` : '').join('');
    } catch (error) {
      host.innerHTML = `<p style="color:#ef4444">${esc(error.message)}</p>`;
    }
  }

  async function removeRecord(button) {
    const type = button.dataset.moderationDelete;
    const studentId = button.dataset.studentId;
    const id = button.dataset.recordId;
    if (!type || !studentId || !id) return;
    if (!confirm(`Delete this ${labels[type] || 'record'}? This removes its Profile Points immediately and records the action in the audit log.`)) return;
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Deleting…';
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}/moderation/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { method:'DELETE', headers:{ Authorization:`Bearer ${token()}` } });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Delete failed.');
      showToast?.(`${labels[type]} deleted. Ranking will recalculate.`, 'success');
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
          panel = document.createElement('section');
          panel.id = 'adminSubmissionModerationPanel';
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
