(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeUrl = value => { try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; } catch (_) { return ''; } };
  const statusBadge = item => {
    const status = item?.verification_status;
    if (!status) return '';
    const label = status === 'verified' ? 'Verified' : status === 'rejected' ? 'Rejected' : 'Pending';
    return `<span class="verification-pill verification-${esc(status)}">${label}</span>`;
  };
  const recordLinks = links => {
    const usable = links.filter(Boolean).map(item => ({ label:item.label, url:safeUrl(item.url) })).filter(item => item.url);
    return usable.length ? `<div class="candidate-record-links">${usable.map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.label)}</a>`).join('')}</div>` : '';
  };
  const empty = text => `<div class="candidate-empty">${esc(text)}</div>`;

  function listSection(title, items, renderer) {
    return `<section class="candidate-section"><div class="candidate-section-head"><h3>${esc(title)}</h3><span>${items.length} record${items.length === 1 ? '' : 's'}</span></div>${items.length ? `<div class="candidate-record-grid">${items.map(renderer).join('')}</div>` : empty(`No ${title.toLowerCase()} recorded.`)}</section>`;
  }

  function internshipCard(item) {
    return `<article class="candidate-record-card">${statusBadge(item)}<strong>${esc(item.company || 'Internship')}</strong><p>${esc(item.role || 'Role not specified')}</p><small>${esc(item.mode || '—')} · ${esc(item.start_date || '—')} to ${esc(item.end_date || 'Present')}</small></article>`;
  }
  function certificateCard(item) {
    return `<article class="candidate-record-card">${statusBadge(item)}<strong>${esc(item.name || 'Certificate')}</strong><p>${esc(item.issuer || 'Issuer not specified')}</p><small>${esc(item.mode || '—')} · ${esc(item.date || '—')}</small></article>`;
  }
  function projectCard(item) {
    const summary = item.summary || 'No project summary recorded.';
    return `<article class="candidate-record-card">${statusBadge(item)}<strong>${esc(item.title || 'Project')}</strong><small>${esc(item.technologies || 'Technology details not recorded')}</small><details><summary>View details</summary><p class="record-summary">${esc(summary)}</p></details>${recordLinks([{label:'Open project',url:item.project_url},{label:'Repository',url:item.repository_url}])}</article>`;
  }
  function researchCard(item) {
    return `<article class="candidate-record-card">${statusBadge(item)}<strong>${esc(item.title || 'Research paper')}</strong><p>${esc(item.publication || 'Publication not specified')}</p><small>${esc(item.authors || 'Authors not specified')} · ${esc(item.published_on || '—')}</small>${item.abstract ? `<details><summary>View abstract</summary><p class="record-summary">${esc(item.abstract)}</p></details>` : ''}${recordLinks([{label:'DOI',url:item.doi_url},{label:'Paper',url:item.paper_url}])}</article>`;
  }

  function renderProfile(student, role) {
    const sems = student.cgpa_semesterwise || {};
    const backlogs = student.backlogs_semesterwise || {};
    const resumeUrl = student.resume_url ? `/api/${role === 'admin' ? 'admin' : 'observer'}/students/${encodeURIComponent(student.id)}/resume/open` : '';
    const skills = Array.isArray(student.skills) ? student.skills.map(item => typeof item === 'string' ? item : item.skill).filter(Boolean) : [];
    const internships = student.internships || [];
    const certificates = student.certificates || [];
    const projects = student.projects || [];
    const research = student.research_papers || [];
    const backlogText = Object.entries(backlogs).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key.replace('sem','Semester ')}: ${value}`).join(' · ') || 'None. Clean academic record.';

    const contact = [
      student.email ? `<a href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(student.email)}" target="_blank" rel="noopener"><small>Email</small><strong>${esc(student.email)}</strong></a>` : '',
      student.phone ? `<a href="tel:${esc(student.phone)}"><small>Mobile</small><strong>${esc(student.phone)}</strong></a>` : ''
    ].filter(Boolean).join('');

    return `<div class="candidate-profile-v2">
      <section class="candidate-profile-hero">
        <div><span class="eyebrow">Student profile</span><h2>${esc(student.name || 'Candidate Profile')}</h2><p>${esc(student.branch || '—')} · ${esc(student.class || '—')} · ${esc(student.year || '—')}</p><div class="candidate-profile-meta"><span>PRN: ${esc(student.prn || '—')}</span><span>${student.active_backlogs || 0} active backlog${Number(student.active_backlogs || 0) === 1 ? '' : 's'}</span></div></div>
        <div class="candidate-profile-actions">${resumeUrl ? `<a class="btn btn-primary btn-sm" href="${resumeUrl}" target="_blank" rel="noopener">Open resume</a>` : '<span class="status-pending">Resume not uploaded</span>'}</div>
      </section>

      <div class="candidate-kpi-grid">
        <div class="candidate-kpi"><small>Overall CGPA</small><strong class="good">${student.cgpa_overall ? Number(student.cgpa_overall).toFixed(2) : '—'}</strong></div>
        <div class="candidate-kpi"><small>Active backlogs</small><strong class="${Number(student.active_backlogs || 0) ? 'bad' : 'good'}">${student.active_backlogs || 0}</strong></div>
        <div class="candidate-kpi"><small>SSC marks</small><strong class="warn">${student.ssc_marks !== null && student.ssc_marks !== undefined ? Number(student.ssc_marks).toFixed(1) + '%' : '—'}</strong></div>
        <div class="candidate-kpi"><small>HSC / Diploma</small><strong class="warn">${student.hsc_marks !== null && student.hsc_marks !== undefined ? Number(student.hsc_marks).toFixed(1) + '%' : (student.diploma?.percentage_or_cgpa || '—')}</strong></div>
      </div>

      <section class="candidate-section"><div class="candidate-section-head"><h3>Semester performance</h3><span>College academic record</span></div><div class="candidate-semester-grid">${Array.from({length:8},(_,idx)=>{const i=idx+1; const raw=sems[`sem${i}`]; const done=raw !== undefined && raw !== null && raw !== '' && Number(raw)>0; return `<div class="candidate-semester ${done?'completed':''}"><small>Sem ${i}</small><strong>${done?Number(raw).toFixed(2):'—'}</strong><span>${done?'Recorded':'Pending'}</span></div>`;}).join('')}</div></section>

      <section class="candidate-section"><div class="candidate-section-head"><h3>Contact</h3><span>Direct actions</span></div>${contact ? `<div class="candidate-contact-grid">${contact}</div>` : empty('Contact details pending.')}</section>

      <section class="candidate-section"><div class="candidate-section-head"><h3>Academic notes</h3><span>Backlogs & activities</span></div><div class="candidate-record-card"><strong>Backlog breakdown</strong><p>${esc(backlogText)}</p></div>${student.activities ? `<details style="margin-top:.6rem"><summary>Activities & achievements</summary><p class="candidate-activity-text">${esc(student.activities)}</p></details>` : ''}</section>

      ${skills.length ? `<section class="candidate-section"><div class="candidate-section-head"><h3>Skills</h3><span>${skills.length}</span></div><div class="candidate-chip-list">${skills.slice(0,50).map(skill=>`<span>${esc(skill)}</span>`).join('')}</div></section>` : ''}
      ${listSection('Internships', internships, internshipCard)}
      ${listSection('Certificates', certificates, certificateCard)}
      ${listSection('Projects', projects, projectCard)}
      ${listSection('Research papers', research, researchCard)}
      ${role === 'observer' ? correctionSection() : ''}
    </div>`;
  }

  function correctionSection() {
    const fields = ['Personal details','Contact details','Academic / CGPA','Backlogs','Resume','Skills','Internships','Certificates','Projects','Research papers','Activities'];
    return `<section class="candidate-section candidate-correction-panel"><div class="candidate-section-head"><h3>Request profile correction</h3><span>TPC action</span></div><p style="color:var(--text-muted);font-size:.78rem;margin:0 0 .75rem">Select the incorrect sections and tell the student exactly what must be corrected.</p><form id="observerCorrectionForm"><div class="correction-check-grid">${fields.map(field=>`<label><input type="checkbox" name="correctionField" value="${esc(field)}"> ${esc(field)}</label>`).join('')}</div><label class="form-label" for="observerCorrectionMessage">Correction description</label><textarea id="observerCorrectionMessage" class="form-textarea" rows="3" minlength="5" maxlength="1000" placeholder="Explain exact issue and expected correction." required></textarea><div id="observerCorrectionError" class="form-error" role="alert"></div><button id="observerCorrectionSubmit" class="btn btn-primary" type="submit">Send correction request</button></form></section>`;
  }

  function installAdminOverride() {
    if (!document.body.classList.contains('admin-dashboard-page')) return;
    window.openStudentModal = function(studentId) {
      const student = typeof allStudentsData !== 'undefined' ? allStudentsData.find(item => item.id === studentId) : null;
      if (!student) return;
      const title = document.getElementById('modalStudentName');
      if (title) title.textContent = `${student.name || 'Student'} · ${student.prn || ''}`;
      const content = document.getElementById('modalContent');
      if (content) content.innerHTML = renderProfile(student, 'admin');
      document.getElementById('studentDetailModal')?.classList.add('active');
    };
  }

  function installObserverOverride() {
    if (!document.body.classList.contains('observer-shell')) return;
    window.openObserverStudent = function(index) {
      const student = typeof observerState !== 'undefined' ? observerState.students[index] : null;
      if (!student) return;
      observerState.selectedStudent = student;
      const title = document.getElementById('observerModalTitle');
      if (title) title.textContent = `${student.name || 'Student'} · ${student.prn || ''}`;
      const body = document.getElementById('observerModalBody');
      if (body) body.innerHTML = renderProfile(student, 'observer');
      const form = document.getElementById('observerCorrectionForm');
      if (form && typeof submitObserverCorrection === 'function') form.addEventListener('submit', submitObserverCorrection);
      document.getElementById('observerModal')?.classList.add('active');
    };
  }

  function install() { installAdminOverride(); installObserverOverride(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();