const observerState = { students: [], studentPage: 1, rosterPage: 1 };

document.addEventListener('DOMContentLoaded', async () => {
    bindObserverEvents();
    setupStaffAvatar({ buttonId: 'observerAvatarButton', inputId: 'observerAvatarFile', imageId: 'observerAvatarImage', endpoint: '/api/observer/auth/avatar', onError: showObserverToast });
    try {
        const session = await requestJson('/api/observer/auth/me');
        document.getElementById('observerDepartment').textContent = `${session.observer.department} Department TPC`;
        await Promise.all([loadOverview(), loadStudents(), loadRoster(), loadDrives(), loadDobCorrections()]);
    } catch (_) {
        window.location.href = '/';
    }
});

function bindObserverEvents() {
    document.querySelectorAll('.observer-tabs .tab-btn').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('.observer-tabs .tab-btn').forEach(item => {
            item.classList.toggle('active', item === button);
            item.setAttribute('aria-selected', String(item === button));
        });
        document.querySelectorAll('[id^="observerTab-"]').forEach(tab => tab.classList.toggle('active', tab.id === `observerTab-${button.dataset.tab}`));
    }));
    document.getElementById('observerBranch').addEventListener('change', () => { observerState.studentPage = 1; loadStudents(); });
    document.getElementById('observerYear').addEventListener('change', () => { observerState.studentPage = 1; loadStudents(); });
    document.getElementById('observerProfileExport').addEventListener('click', exportObserverProfileCompletion);
    document.getElementById('rosterBranch').addEventListener('change', () => { observerState.rosterPage = 1; loadRoster(); });
    document.getElementById('observerSearch').addEventListener('input', debounce(() => { observerState.studentPage = 1; loadStudents(); }, 250));
    document.getElementById('rosterSearch').addEventListener('input', debounce(() => { observerState.rosterPage = 1; loadRoster(); }, 250));
    document.getElementById('refreshStudents').addEventListener('click', loadStudents);
    document.getElementById('refreshRoster').addEventListener('click', loadRoster);
    document.getElementById('refreshDob').addEventListener('click', loadDobCorrections);
    document.getElementById('closeObserverModal').addEventListener('click', closeObserverModal);
    document.getElementById('observerModal').addEventListener('click', event => { if (event.target.id === 'observerModal') closeObserverModal(); });
    document.getElementById('observerLogout').addEventListener('click', async () => {
        await fetch('/api/observer/auth/logout', { method: 'POST' });
        window.location.href = '/';
    });
}

async function loadOverview() {
    const { data } = await requestJson('/api/observer/overview');
    setText('metricRoster', data.totals.roster);
    setText('metricProfiles', data.totals.profiles);
    setText('metricPending', `${data.totals.pendingProfiles} pending`);
    setText('metricResumes', data.totals.resumes);
    setText('metricInternships', data.totals.internships);
    setText('metricCertificates', data.totals.certificates);
    setText('metricProjects', data.totals.projects);
    setText('metricResearch', data.totals.researchPapers);
    setText('metricDrives', data.totals.activeDrives);
    document.getElementById('branchCards').innerHTML = data.branches.map(branch => {
        const completion = branch.roster ? Math.round((branch.profiles / branch.roster) * 100) : 0;
        return `<article class="branch-card"><div class="branch-card-head"><span class="branch-code">${escapeHtml(branch.code)}</span><span>${completion}% profiles</span></div><h3>${escapeHtml(branch.name)}</h3><div class="progress-track"><span style="width:${Math.min(100, completion)}%"></span></div><div class="branch-facts"><span><strong>${branch.roster}</strong> roster</span><span><strong>${branch.resumes}</strong> resumes</span><span><strong>${branch.averageCgpa}</strong> avg CGPA</span></div></article>`;
    }).join('');
}

async function loadStudents() {
    const params = new URLSearchParams({ page: observerState.studentPage, pageSize: 25, branch: document.getElementById('observerBranch').value, year: document.getElementById('observerYear').value, search: document.getElementById('observerSearch').value.trim() });
    const { data } = await requestJson(`/api/observer/students?${params}`);
    observerState.students = data.students;
    const body = document.getElementById('observerStudents');
    body.innerHTML = data.students.length ? data.students.map((student, index) => `<tr>
        <td><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.prn)}</small></td>
        <td><span class="branch-chip">${escapeHtml(student.branch)}</span><small>${escapeHtml(student.class || '—')} · ${escapeHtml(student.year || '—')}</small></td>
        <td><strong>${Number(student.cgpa_overall || 0).toFixed(2)}</strong><small>Overall CGPA</small></td>
        <td><strong>${student.internships.length} / ${student.certificates.length} / ${student.projects.length} / ${student.research_papers.length}</strong><small>Internships / certificates / projects / papers</small></td>
        <td>${student.resume_url ? `<a class="btn btn-secondary btn-sm resume-open-link" href="/api/observer/students/${encodeURIComponent(student.id)}/resume/open" target="_blank" rel="noopener">Open resume</a>` : '<span class="status-pending">Pending</span>'}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="openObserverStudent(${index})">View profile</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No profiles match current filters.</td></tr>';
    renderPagination('studentPagination', data.page, data.totalPages, page => { observerState.studentPage = page; loadStudents(); });
}

async function exportObserverProfileCompletion() {
    const branch = document.getElementById('observerBranch').value;
    const year = document.getElementById('observerYear').value;
    const params = new URLSearchParams();
    if (branch !== 'all') params.set('branch', branch);
    if (year !== 'all') params.set('year', year);
    const button = document.getElementById('observerProfileExport'); button.disabled = true; button.textContent = 'Generating…';
    try {
        const response = await fetch(`/api/observer/profile-completion/excel?${params}`);
        if (!response.ok) throw new Error('Profile completion export failed.');
        const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = `profile_completion_${branch}_${year}.xlsx`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        showObserverToast('Profile completion Excel downloaded.');
    } catch (error) { showObserverToast(error.message); }
    finally { button.disabled = false; button.textContent = 'Profile completion Excel'; }
}

async function loadRoster() {
    const params = new URLSearchParams({ page: observerState.rosterPage, pageSize: 25, branch: document.getElementById('rosterBranch').value, search: document.getElementById('rosterSearch').value.trim() });
    const { data } = await requestJson(`/api/observer/roster?${params}`);
    document.getElementById('observerRoster').innerHTML = data.rows.length ? data.rows.map(row => `<tr><td><strong>${escapeHtml(row.prn)}</strong></td><td>${escapeHtml(row.name)}</td><td><span class="branch-chip">${escapeHtml(row.branch)}</span></td><td>${escapeHtml(row.class)}</td><td>${escapeHtml(row.year)}</td><td>${row.profileCompleted ? '<span class="status-ready">Profile active</span>' : '<span class="status-pending">Awaiting first login</span>'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No roster records match current filters.</td></tr>';
    renderPagination('rosterPagination', data.page, data.totalPages, page => { observerState.rosterPage = page; loadRoster(); });
}

async function loadDrives() {
    const { data } = await requestJson('/api/observer/drives');
    document.getElementById('observerDrives').innerHTML = data.length ? data.map(drive => `<article class="glass-card drive-observer-card"><div class="drive-title-row"><div><span class="eyebrow">${escapeHtml(drive.status)}</span><h3>${escapeHtml(drive.company)}</h3><p>${escapeHtml(drive.role)}</p></div><span class="branch-chip">${drive.criteria?.min_cgpa ?? 0}+ CGPA</span></div><p class="drive-description">${escapeHtml(drive.jd_text)}</p><div class="drive-facts"><span><strong>${drive.matches}</strong> evaluated</span><span><strong>${drive.eligible}</strong> eligible</span><span><strong>${drive.shortlisted}</strong> shortlisted</span></div><div class="criteria-line">Branches: ${escapeHtml((drive.criteria?.branches || []).join(', ') || 'All')} · Required skills: ${escapeHtml((drive.criteria?.required_skills || []).join(', ') || 'None')}</div></article>`).join('') : '<article class="glass-card empty-state">No placement drives created yet.</article>';
}

window.openObserverStudent = function (index) {
    const student = observerState.students[index];
    if (!student) return;
    observerState.selectedStudent = student;
    setText('observerModalTitle', student.name);

    const sems = student.cgpa_semesterwise || {};

    document.getElementById('observerModalBody').innerHTML = `
        <div class="candidate-modal-header">
            <div>
                <h2 class="candidate-modal-title">${escapeHtml(student.name || 'Candidate Profile')}</h2>
                <div class="candidate-meta-badges">
                    <span class="readonly-pill">PRN: ${escapeHtml(student.prn)}</span>
                    <span class="branch-chip">${escapeHtml(student.branch)}</span>
                    <span class="badge badge-info">${escapeHtml(student.class || '—')} • ${escapeHtml(student.year || '—')}</span>
                </div>
            </div>
            <div>
                ${student.resume_url ? `<a class="btn btn-secondary btn-sm" href="/api/observer/students/${encodeURIComponent(student.id)}/resume/open" target="_blank" rel="noopener">📄 Open Resume</a>` : '<span class="status-pending">No Resume</span>'}
            </div>
        </div>

        <div class="candidate-stats-grid">
            <div class="candidate-stat-card">
                <span class="label">Overall CGPA</span>
                <span class="value stat-emerald">${student.cgpa_overall ? Number(student.cgpa_overall).toFixed(2) : '0.00'}</span>
            </div>
            <div class="candidate-stat-card">
                <span class="label">Active Backlogs</span>
                <span class="value ${student.active_backlogs > 0 ? 'stat-rose' : 'stat-emerald'}">${student.active_backlogs || 0}</span>
            </div>
            <div class="candidate-stat-card">
                <span class="label">SSC Marks</span>
                <span class="value stat-amber">${student.ssc_marks !== null && student.ssc_marks !== undefined ? Number(student.ssc_marks).toFixed(1) + '%' : '—'}</span>
            </div>
            <div class="candidate-stat-card">
                <span class="label">HSC / Diploma</span>
                <span class="value stat-amber">${student.hsc_marks !== null && student.hsc_marks !== undefined ? Number(student.hsc_marks).toFixed(1) + '%' : (student.diploma ? student.diploma.percentage_or_cgpa : '—')}</span>
            </div>
        </div>

        <h4 style="margin-bottom: 0.65rem; color: var(--text-heading);">Semester SGPA Progression</h4>
        <div class="semester-progress-grid">
            ${Array.from({ length: 8 }, (_, idx) => {
                const i = idx + 1;
                const val = sems[`sem${i}`] ? parseFloat(sems[`sem${i}`]).toFixed(2) : null;
                const isComp = val !== null;
                return `
                    <div class="sem-box ${isComp ? 'completed' : 'pending'}">
                        <span class="sem-label">Sem ${i}</span>
                        <div class="sem-score">${isComp ? val : '--'}</div>
                        <span class="sem-status-tag">${isComp ? 'Passed' : 'Pending'}</span>
                    </div>
                `;
            }).join('')}
        </div>

        <section class="record-section"><h4>Contact student</h4><div class="student-contact-actions">${student.email?`<a class="student-contact-link" href="${gmailComposeUrl(student.email)}" target="_blank" rel="noopener"><span>Email</span><strong>${escapeHtml(student.email)}</strong></a>`:''}${student.phone?`<a class="student-contact-link" href="tel:${escapeHtml(student.phone)}"><span>Mobile</span><strong>${escapeHtml(student.phone)}</strong></a>`:''}${!student.email&&!student.phone?'<span class="status-pending">Contact details pending</span>':''}</div></section>
        <section class="record-section"><h4>Skills</h4><div class="chip-list">${student.skills.length ? student.skills.map(skill => `<span>${escapeHtml(skill)}</span>`).join('') : '<em>No skills added.</em>'}</div></section>
        <section class="record-section"><h4>Internships</h4>${student.internships.length ? student.internships.map(item => `<div class="record-line"><strong>${escapeHtml(item.company)}</strong><span>${escapeHtml(item.role)} · ${escapeHtml(item.mode || '—')}</span></div>`).join('') : '<p>No internships added.</p>'}</section>
        <section class="record-section"><h4>Certificates</h4>${student.certificates.length ? student.certificates.map(item => `<div class="record-line"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.issuer || '—')}</span></div>`).join('') : '<p>No certificates added.</p>'}</section>
        <section class="record-section"><h4>Projects</h4>${student.projects.length ? student.projects.map(item => `<div class="record-line"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.technologies || '—')}</span></div>`).join('') : '<p>No projects added.</p>'}</section>
        <section class="record-section"><h4>Research papers</h4>${student.research_papers.length ? student.research_papers.map(item => `<div class="record-line"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.publication)} · ${escapeHtml(item.published_on)}</span></div>`).join('') : '<p>No research papers added.</p>'}</section>
        <section class="record-section"><h4>Activities</h4><p>${escapeHtml(student.activities || 'No activities added.')}</p></section>
        <section class="record-section correction-review"><h4>Request profile correction</h4><p>Tick incorrect sections, then explain what student must fix.</p><form id="observerCorrectionForm"><div class="correction-check-grid">${['Personal details','Contact details','Academic / CGPA','Backlogs','Resume','Skills','Internships','Certificates','Activities'].map(field => `<label><input type="checkbox" name="correctionField" value="${field}"> ${field}</label>`).join('')}</div><label class="form-label" for="observerCorrectionMessage">Correction description</label><textarea id="observerCorrectionMessage" class="form-textarea" rows="3" minlength="5" maxlength="1000" placeholder="Explain exact issue and expected correction." required></textarea><div id="observerCorrectionError" class="form-error" role="alert"></div><button id="observerCorrectionSubmit" class="btn btn-primary" type="submit">Send correction request</button></form></section>
        <div class="modal-actions">${student.resume_url ? `<a class="btn btn-secondary" href="/api/observer/students/${encodeURIComponent(student.id)}/resume/open" target="_blank" rel="noopener">Open private resume</a>` : '<span class="status-pending">Resume not uploaded</span>'}<span class="readonly-pill">Profile remains read-only</span></div>`;
    document.getElementById('observerCorrectionForm').addEventListener('submit', submitObserverCorrection);
    document.getElementById('observerModal').classList.add('active');
};

async function submitObserverCorrection(event) {
    event.preventDefault();
    const fields = [...event.target.querySelectorAll('input[name="correctionField"]:checked')].map(input => input.value);
    const message = document.getElementById('observerCorrectionMessage').value.trim();
    const error = document.getElementById('observerCorrectionError');
    if (!fields.length) { error.textContent = 'Select at least one incorrect section.'; return; }
    if (message.length < 5) { error.textContent = 'Describe what student must correct.'; return; }
    const button = document.getElementById('observerCorrectionSubmit');
    button.disabled = true; button.textContent = 'Sending...'; error.textContent = '';
    try {
        const response = await fetch(`/api/observer/students/${encodeURIComponent(observerState.selectedStudent.id)}/corrections`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ fields, message }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || result.error || 'Request failed.');
        showObserverToast(result.created ? `${result.created} correction request${result.created === 1 ? '' : 's'} sent.` : 'Selected corrections are already open.', 'success');
        if (result.created) closeObserverModal();
    } catch (requestError) { error.textContent = requestError.message; }
    finally { button.disabled = false; button.textContent = 'Send correction request'; }
}

function closeObserverModal() { document.getElementById('observerModal').classList.remove('active'); }
function renderPagination(id, page, pages, onPage) {
    const host = document.getElementById(id);
    host.innerHTML = `<button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="btn btn-secondary btn-sm" ${page >= pages ? 'disabled' : ''}>Next</button>`;
    const buttons = host.querySelectorAll('button');
    buttons[0].addEventListener('click', () => onPage(page - 1));
    buttons[1].addEventListener('click', () => onPage(page + 1));
}
async function requestJson(url) {
    const response = await fetch(url);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || result.error || 'Request failed.');
    return result;
}
function setText(id, value) { document.getElementById(id).textContent = value; }
function escapeHtml(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }
function gmailComposeUrl(email) { return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(String(email || ''))}&su=${encodeURIComponent('Placement application update')}`; }
function debounce(callback, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; }
function showObserverToast(message, type = 'error') { const toast = document.createElement('div'); toast.className = `toast toast-${type}`; toast.textContent = message; document.getElementById('toastContainer').appendChild(toast); setTimeout(() => toast.remove(), 3500); }

async function loadDobCorrections() {
    const list = document.getElementById('observerDobList');
    if (!list) return;
    try {
        const res = await fetch('/api/observer/dob-corrections');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load requests.');

        const formatDob = (isoString) => {
            const [y, m, d] = isoString.split('-');
            return `${d}/${m}/${y}`;
        };

        list.innerHTML = json.data.length ? json.data.map(req => {
            const dateStr = formatDob(req.submitted_dob);
            const statusClass = req.status === 'pending' ? 'badge-offline' : (req.status === 'approved' ? 'badge-online' : 'badge-offline');
            const actions = req.status === 'pending'
                ? `<button class="btn btn-secondary btn-sm" onclick="processObserverDobRequest('${req.id}', 'approve')" style="margin-right:0.3rem;">Approve</button>
                   <button class="btn btn-danger btn-sm" onclick="processObserverDobRequest('${req.id}', 'reject')">Reject</button>`
                : `<span style="color:var(--text-muted); font-size:0.8rem;">Processed</span>`;

            const mismatchBadge = req.name_mismatch
                ? `<span class="badge badge-offline" style="background-color:#f43f5e; color:#ffffff; font-size:0.75rem; margin-left:0.5rem; padding: 2px 6px; border-radius: 4px; border:none; display:inline-block;">Name Mismatch</span>`
                : '';

            return `
                <tr style="border-bottom: 1px solid #334155;">
                    <td style="padding: 8px;"><strong>${escapeHtml(req.prn)}</strong></td>
                    <td style="padding: 8px;">${escapeHtml(req.submitted_name)}${mismatchBadge}</td>
                    <td style="padding: 8px;">${dateStr}</td>
                    <td style="padding: 8px;"><span class="badge ${statusClass}">${escapeHtml(req.status)}</span></td>
                    <td style="padding: 8px; text-align: right;">${actions}</td>
                </tr>
            `;
        }).join('') : `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #94a3b8;">No correction requests for your department.</td></tr>`;
    } catch (err) {
        list.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #ef4444;">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function processObserverDobRequest(id, action) {
    if (!confirm(`Are you sure you want to ${action} this request?`)) return;
    try {
        const res = await fetch(`/api/observer/dob-corrections/${id}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const json = await res.json();
        showObserverToast(res.ok ? `Request ${action}d successfully.` : (json.error || `Failed to ${action} request.`), res.ok ? 'success' : 'error');
        if (res.ok) {
            loadDobCorrections();
        }
    } catch (err) {
        showObserverToast('Error communicating with server.', 'error');
    }
}
