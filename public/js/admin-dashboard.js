let allStudentsData = [];
let selectedFile = null;
let staffAccountCache = new Map();
let placementDriveCache = new Map();
let adminStudentPage = 1;
const adminStudentPageSize = 50;

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.form-group').forEach(group => {
        const label = group.querySelector('.form-label');
        const control = group.querySelector('input, select, textarea');
        if (label && control && !label.htmlFor && !control.getAttribute('aria-label')) {
            control.setAttribute('aria-label', label.textContent.trim());
        }
    });
    document.getElementById('adminLogoutBtn').addEventListener('click', handleAdminLogout);
    setupStaffAvatar({ buttonId: 'adminAvatarButton', inputId: 'adminAvatarFile', imageId: 'adminAvatarImage', endpoint: '/api/admin/auth/avatar', onError: message => showToast(message, 'error') });
    document.getElementById('driveForm')?.addEventListener('submit', handleDriveSubmit);
    document.getElementById('notificationForm')?.addEventListener('submit', sendNotification);
    ['assessmentForm','interviewForm','offerForm','calendarForm'].forEach(id => document.getElementById(id)?.addEventListener('submit', saveAdvancedRecord));
    document.getElementById('staffCreateForm')?.addEventListener('submit', createStaffAccount);
    document.getElementById('changeStudentPasswordFormDashboard')?.addEventListener('submit', handleChangeStudentPassword);
    document.getElementById('btnImpersonate')?.addEventListener('click', handleImpersonate);
    document.querySelector('.filter-bar')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); fetchFilteredStudents(); } });
    syncSgpaFilter();
    fetch('/api/admin/auth/me').then(r=>r.json()).then(j=>{if(j.admin){const isSuper=j.admin.role==='super_admin';document.getElementById('adminRoleBadge').textContent=isSuper?(j.admin.display_name||'IR DEV'):'Administrator';document.getElementById('advancedRoleEyebrow').textContent=isSuper?`Super Admin · ${j.admin.display_name||'IR DEV'}`:'Advanced operations';}}).catch(()=>{});

    // Drag & Drop Setup
    const dropzone = document.getElementById('dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--primary)'; });
        dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--border-glow)'; });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--border-glow)';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                document.getElementById('csvFileInput').files = e.dataTransfer.files;
                handleFileSelected({ target: document.getElementById('csvFileInput') });
            }
        });
    }

    loadAdminStudents();
    loadDrives();
    loadRosterCount();
    loadAdminAnalytics();
});

async function handleImpersonate() {
    const prnInput = document.getElementById('impersonatePrn');
    const prn = prnInput?.value.trim();
    if (!prn) return showToast('Enter a PRN to login.', 'error');

    const btn = document.getElementById('btnImpersonate');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
        const token = localStorage.getItem('tpo_admin_token');
        const res = await fetch(`/api/admin/students/${encodeURIComponent(prn)}/impersonate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            prnInput.value = '';
            window.open(`/dashboard?impersonate_token=${data.token}`, '_blank');
        } else {
            showToast(data.error || 'Failed to impersonate student.', 'error');
        }
    } catch (err) {
        showToast('Error connecting to backend.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function loadAdminStudents() {
    const token = localStorage.getItem('tpo_admin_token');
    const branch = document.getElementById('filterBranch').value;
    const minCgpa = document.getElementById('filterMinCgpa').value;
    const search = document.getElementById('filterSearch').value;
    const year = document.getElementById('filterYear').value;
    const sgpaSemester = document.getElementById('filterSgpaSemester').value;
    const minSgpa = document.getElementById('filterMinSgpa').value;
    const backlogFilter = document.getElementById('filterBacklogs').value;

    const params = new URLSearchParams();
    if (branch && branch !== 'all') params.append('branch', branch);
    if (minCgpa) params.append('minCgpa', minCgpa);
    if (search) params.append('search', search);
    if (year !== 'all') params.append('year', year);
    if (sgpaSemester) params.append('sgpaSemester', sgpaSemester);
    if (minSgpa) params.append('minSgpa', minSgpa);
    if (backlogFilter !== 'all') params.append('backlogFilter', backlogFilter);
    params.set('page', adminStudentPage);
    params.set('pageSize', adminStudentPageSize);

    try {
        const res = await fetch(`/api/admin/students?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('tpo_admin_token');
            window.location.href = '/';
            return;
        }

        const data = await res.json();
        if (data.success) {
            allStudentsData = data.students;
            document.getElementById('statFilteredCount').innerText = data.count;
            populateBranchDropdown(data.branches);
            renderStudentsTable(data.students);
            renderStudentPagination(data.page, data.totalPages, data.count);
        } else {
            showToast(data.error || 'Failed to load students', 'error');
        }
    } catch (err) {
        console.error('Error loading admin students:', err);
        showToast('Error connecting to backend.', 'error');
    }
}

function csvValues(id) {
    return document.getElementById(id).value.split(',').map(v => v.trim()).filter(Boolean);
}

function selectedDriveBranches() {
    return [...document.querySelectorAll('#driveBranches input:checked')].map(input => input.value);
}

async function handleDriveSubmit(event) {
    event.preventDefault();
    const driveResponse = await fetch('/api/admin/drives', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            company: document.getElementById('driveCompany').value.trim(),
            role: document.getElementById('driveRole').value.trim(),
            jd_text: document.getElementById('driveJd').value.trim(),
            application_deadline: document.getElementById('driveDeadline').value || null,
            status: document.getElementById('driveStatus').value
        })
    });
    const driveJson = await driveResponse.json();
    if (!driveResponse.ok) return showToast(apiError(driveJson), 'error');
    const drive = driveJson.data;
    const criteriaResponse = await fetch(`/api/admin/drives/${drive.id}/criteria`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            branches: selectedDriveBranches(),
            min_cgpa: Number(document.getElementById('driveCgpa').value || 0),
            graduation_year: null,
            required_skills: csvValues('driveRequiredSkills'),
            preferred_skills: csvValues('drivePreferredSkills'),
            keywords: csvValues('driveKeywords')
        })
    });
    if (!criteriaResponse.ok) return showToast(apiError(await criteriaResponse.json()), 'error');
    const matchResponse = await fetch(`/api/admin/drives/${drive.id}/match`, { method: 'POST' });
    if (!matchResponse.ok) return showToast(apiError(await matchResponse.json()), 'error');
    event.target.reset();
    showToast('Drive created and candidates ranked.', 'success');
    loadDrives();
}

async function loadDrives() {
    const container = document.getElementById('drivesList');
    if (!container) return;
    try {
        const response = await fetch('/api/admin/drives');
        const json = await response.json();
        if (!response.ok) throw new Error(apiError(json));
        placementDriveCache = new Map(json.data.map(drive => [drive.id, drive]));
        container.innerHTML = json.data.length ? json.data.map(drive => `
            <article class="item-card drive-admin-card">
                <div class="drive-admin-summary"><div class="workflow-card-head"><strong>${escapeHtml(drive.company)}</strong><span class="branch-chip">${escapeHtml(drive.status)}</span></div><p>${escapeHtml(drive.role)}</p><small>Branches: ${escapeHtml((drive.criteria?.branches || []).join(', ') || 'All')} · Minimum CGPA: ${drive.criteria?.min_cgpa ?? 0}${drive.application_deadline ? ` · Deadline: ${escapeHtml(drive.application_deadline)}` : ''}</small></div>
                <div class="workflow-actions"><button class="btn btn-secondary btn-sm" onclick="viewMatches('${drive.id}')">Results</button>${drive.status==='review_pending'?`<button class="btn btn-primary btn-sm" onclick="approveDrive('${drive.id}')">Approve & publish</button>`:drive.status==='open'?`<button class="btn btn-secondary btn-sm" onclick="changeDriveStatus('${drive.id}','closed')">Close</button>`:`<button class="btn btn-primary btn-sm" onclick="submitDriveReview('${drive.id}')">Submit review</button>`}<button class="btn btn-danger btn-sm" onclick="deleteDrive('${drive.id}')">Delete</button></div>
            </article>`).join('') : '<p>No placement drives yet.</p>';
    } catch (error) { container.textContent = error.message; }
}

async function changeDriveStatus(driveId, status) {
    const drive = placementDriveCache.get(driveId);
    if (!drive) return showToast('Drive data unavailable. Refresh and try again.', 'error');
    const response = await fetch(`/api/admin/drives/${encodeURIComponent(driveId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: drive.company, role: drive.role, jd_text: drive.jd_text, application_deadline: drive.application_deadline || null, status }) });
    const json = await response.json();
    showToast(response.ok ? `Drive ${status}.` : apiError(json), response.ok ? 'success' : 'error');
    if (response.ok) loadDrives();
}
async function submitDriveReview(id){const r=await fetch(`/api/admin/drives/${id}/submit-review`,{method:'POST'});const j=await r.json();showToast(r.ok?'Drive submitted for review.':apiError(j),r.ok?'success':'error');if(r.ok)loadDrives();}
async function approveDrive(id){const r=await fetch(`/api/admin/drives/${id}/approve`,{method:'POST'});const j=await r.json();showToast(r.ok?'Drive approved and published.':apiError(j),r.ok?'success':'error');if(r.ok)loadDrives();}

async function deleteDrive(driveId) {
    if (!window.confirm('Delete this placement drive? Applications, matches, shortlists, and linked drive records will also be removed.')) return;
    const response = await fetch(`/api/admin/drives/${encodeURIComponent(driveId)}`, { method: 'DELETE' });
    const json = await response.json();
    showToast(response.ok ? 'Placement drive deleted.' : apiError(json), response.ok ? 'success' : 'error');
    if (response.ok) loadDrives();
}

async function viewMatches(driveId) {
    const response = await fetch(`/api/admin/drives/${driveId}/matches`);
    const json = await response.json();
    if (!response.ok) return showToast(apiError(json), 'error');
    const eligible = json.data.filter(item => item.eligible);
    showToast(`${eligible.length} eligible candidates. Highest score: ${eligible[0]?.score ?? 0}.`, 'info');
}

async function loadRosterCount() {
    const token = localStorage.getItem('tpo_admin_token');
    try {
        const res = await fetch('/api/admin/roster', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('statRosterCount').innerText = data.count || 0;
        }
    } catch (e) {}
}

function populateBranchDropdown(branches) {
    const select = document.getElementById('filterBranch');
    const currentVal = select.value;

    // Keep 'All Branches'
    select.innerHTML = '<option value="all">All Branches</option>';
    if (branches && Array.isArray(branches)) {
        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.innerText = b;
            select.appendChild(opt);
        });
    }
    select.value = currentVal;
}

function renderStudentsTable(students) {
    const tbody = document.getElementById('studentsTableBody');
    if (!students || students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    🔍 No student records match the active filter criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = students.map(s => {
        const cgpa = s.profile_active && s.cgpa_overall ? parseFloat(s.cgpa_overall).toFixed(2) : '—';
        const resumeLink = s.resume_url
            ? `<a class="btn btn-secondary btn-sm resume-open-link" href="/api/admin/students/${encodeURIComponent(s.id)}/resume/open" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open resume</a>`
            : `<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>`;

        const diplomaBadge = !s.profile_active
            ? `<span class="badge badge-offline">Profile pending</span>`
            : s.has_diploma
            ? `<span class="badge badge-online" style="font-size: 0.7rem;">Diploma</span>`
            : `<span class="badge badge-offline" style="font-size: 0.7rem;">Regular</span>`;

        const quickLinks = [];
        if (s.projects && s.projects.length > 0) {
            s.projects.filter(p => p.project_url || p.repository_url).forEach(p => {
                quickLinks.push(`<a href="${p.project_url || p.repository_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="display:block; font-size:0.75rem; color:var(--accent);">🔗 Proj: ${escapeHtml(p.title)}</a>`);
            });
        }
        if (s.research_papers && s.research_papers.length > 0) {
            s.research_papers.filter(p => p.paper_url || p.doi_url).forEach(p => {
                quickLinks.push(`<a href="${p.paper_url || p.doi_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="display:block; font-size:0.75rem; color:#a78bfa;">🔗 Paper: ${escapeHtml(p.title)}</a>`);
            });
        }
        const extraLinksHtml = quickLinks.length > 0 ? `<div style="margin-top:0.4rem; max-height:45px; overflow-y:auto; padding-right:5px;">${quickLinks.join('')}</div>` : '';

        return `
            <tr onclick="openStudentModal('${s.id}')">
                <td><strong style="color: var(--text-heading);">${escapeHtml(s.prn)}</strong></td>
                <td>${escapeHtml(s.name || 'N/A')}${s.profile_active?'':'<small class="profile-pending-note">Uploaded roster · Awaiting first login</small>'}</td>
                <td>${escapeHtml(s.branch || 'N/A')} <span style="color: var(--text-muted); font-size: 0.8rem;">(${escapeHtml(s.class || '')})</span></td>
                <td>${escapeHtml(s.year || 'N/A')}</td>
                <td><div class="compact-table-cell"><strong style="color: var(--accent);">${cgpa} CGPA</strong><small>${s.active_backlogs || 0} backlog${s.active_backlogs === 1 ? '' : 's'}</small></div></td>
                <td><div class="compact-table-cell"><span>${s.internships_count} internships · ${s.certificates_count} certificates</span><small>${s.projects_count} projects · ${s.research_papers_count} research papers</small></div></td>
                <td><div class="compact-table-cell" style="align-items:flex-start;">${diplomaBadge}${resumeLink}${extraLinksHtml}</div></td>
                <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openStudentModal('${s.id}')">View</button></td>
            </tr>
        `;
    }).join('');
}

function renderStudentPagination(page, totalPages, totalCount) {
    const host = document.getElementById('studentPagination');
    const start = totalCount ? ((page - 1) * adminStudentPageSize) + 1 : 0;
    const end = Math.min(page * adminStudentPageSize, totalCount);
    host.innerHTML = `<span>Showing ${start}–${end} of ${totalCount} students · Page ${page} of ${totalPages}</span><div><button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">Previous</button><button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Next</button></div>`;
    host.querySelectorAll('button[data-page]').forEach(button => button.addEventListener('click', () => { adminStudentPage = Number(button.dataset.page); loadAdminStudents(); document.getElementById('tab-students').scrollIntoView({ behavior:'smooth', block:'start' }); }));
}

let filterTimeout = null;
function applyFilters() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        loadAdminStudents();
    }, 250);
}

function syncSgpaFilter() {
    const semester = document.getElementById('filterSgpaSemester').value;
    const input = document.getElementById('filterMinSgpa');
    input.disabled = !semester;
    input.placeholder = semester ? 'e.g. 7.0' : 'Select semester first';
    document.getElementById('sgpaFilterHint').textContent = semester ? `Filtering Semester ${semester} SGPA.` : 'Choose one semester to enable.';
    if (!semester) input.value = '';
}

function fetchFilteredStudents() {
    const min = Number(document.getElementById('filterMinCgpa').value);
    const hasMin = document.getElementById('filterMinCgpa').value !== '';
    if (hasMin && (min < 0 || min > 10)) return showToast('Minimum CGPA must be between 0 and 10.', 'error');
    adminStudentPage = 1;
    loadAdminStudents();
}

function resetFilters() {
    adminStudentPage = 1;
    document.getElementById('filterBranch').value = 'all';
    document.getElementById('filterMinCgpa').value = '';
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterYear').value = 'all';
    document.getElementById('filterSgpaSemester').value = '';
    document.getElementById('filterMinSgpa').value = '';
    document.getElementById('filterBacklogs').value = 'all';
    syncSgpaFilter();
    loadAdminStudents();
}

function exportData(type) {
    const token = localStorage.getItem('tpo_admin_token');
    const branch = document.getElementById('filterBranch').value;
    const minCgpa = document.getElementById('filterMinCgpa').value;
    const search = document.getElementById('filterSearch').value;
    const year = document.getElementById('filterYear').value;
    const sgpaSemester = document.getElementById('filterSgpaSemester').value;
    const minSgpa = document.getElementById('filterMinSgpa').value;
    const backlogFilter = document.getElementById('filterBacklogs').value;

    const params = new URLSearchParams();
    if (branch && branch !== 'all') params.append('branch', branch);
    if (minCgpa) params.append('minCgpa', minCgpa);
    if (search) params.append('search', search);
    if (year !== 'all') params.append('year', year);
    if (sgpaSemester) params.append('sgpaSemester', sgpaSemester);
    if (minSgpa) params.append('minSgpa', minSgpa);
    if (backlogFilter !== 'all') params.append('backlogFilter', backlogFilter);

    const endpoint = `/api/admin/students/export/${type}`;
    const downloadUrl = `${endpoint}?${params.toString()}`;

    showToast(`Generating ${type.toUpperCase()} export...`, 'info');

    // Trigger download with auth token in fetch or popup window
    fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (!res.ok) throw new Error('Export request failed.');
        return res.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recruiter_candidates_${Date.now()}.${type === 'excel' ? 'xlsx' : type}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`${type.toUpperCase()} file downloaded successfully!`, 'success');
    })
    .catch(err => {
        showToast('Export failed: ' + err.message, 'error');
    });
}

function exportProfileCompletion() {
    const params = new URLSearchParams();
    const branch = document.getElementById('filterBranch').value;
    const year = document.getElementById('filterYear').value;
    if (branch && branch !== 'all') params.set('branch', branch);
    if (year && year !== 'all') params.set('year', year);
    showToast('Generating profile completion Excel…', 'info');
    fetch(`/api/admin/profile-completion/excel?${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem('tpo_admin_token')}` } })
        .then(response => { if (!response.ok) throw new Error('Profile completion export failed.'); return response.blob(); })
        .then(blob => downloadBlob(blob, `profile_completion_${branch || 'all'}_${year || 'all'}.xlsx`))
        .then(() => showToast('Profile completion Excel downloaded.', 'success'))
        .catch(error => showToast(error.message, 'error'));
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Modal View
function openStudentModal(studentId) {
    const student = allStudentsData.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('modalStudentName').innerText = `${student.name || 'Student'} (${student.prn})`;
    const content = document.getElementById('modalContent');

    const sems = student.cgpa_semesterwise || {};
    const backlogs = student.backlogs_semesterwise || {};
    let semHtml = '';
    for (let i = 1; i <= 8; i++) {
        const val = sems[`sem${i}`] ? parseFloat(sems[`sem${i}`]).toFixed(2) : '--';
        semHtml += `
            <div style="background: rgba(15,23,42,0.6); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border-color); text-align: center;">
                <span style="font-size: 0.7rem; color: var(--text-muted);">Sem ${i}</span>
                <div style="font-weight: 600;">${val}</div>
            </div>
        `;
    }

    let intHtml = (student.internships && student.internships.length > 0)
        ? student.internships.map(i => `<li style="margin-bottom: 0.4rem;"><strong>${escapeHtml(i.company)}</strong> - ${escapeHtml(i.role)} (${i.mode}) [${i.start_date} to ${i.end_date || 'Present'}]</li>`).join('')
        : '<p style="color: var(--text-muted);">No internships recorded.</p>';

    let certHtml = (student.certificates && student.certificates.length > 0)
        ? student.certificates.map(c => `<li style="margin-bottom: 0.4rem;"><strong>${escapeHtml(c.name)}</strong> by ${escapeHtml(c.issuer)} (${c.mode}) - ${c.date}</li>`).join('')
        : '<p style="color: var(--text-muted);">No certificates recorded.</p>';
    const projectHtml = student.projects?.length ? student.projects.map(p => `<li><strong>${escapeHtml(p.title)}</strong> — ${escapeHtml(p.summary)}${p.project_url ? ` · <a href="${escapeHtml(p.project_url)}" target="_blank" rel="noopener">Link</a>` : ''}${p.repository_url ? ` · <a href="${escapeHtml(p.repository_url)}" target="_blank" rel="noopener">Repo</a>` : ''}</li>`).join('') : '<p style="color: var(--text-muted);">No projects recorded.</p>';
    const researchHtml = student.research_papers?.length ? student.research_papers.map(p => `<li><strong>${escapeHtml(p.title)}</strong> — ${escapeHtml(p.publication)} (${escapeHtml(p.published_on)})<br><small>${escapeHtml(p.authors)}</small>${p.doi_url ? ` · <a href="${escapeHtml(p.doi_url)}" target="_blank" rel="noopener">DOI</a>` : ''}${p.paper_url ? ` · <a href="${escapeHtml(p.paper_url)}" target="_blank" rel="noopener">Paper</a>` : ''}</li>`).join('') : '<p style="color: var(--text-muted);">No research papers recorded.</p>';

    let dipHtml = student.diploma
        ? `<p><strong>${escapeHtml(student.diploma.institute)}</strong> (${escapeHtml(student.diploma.branch)}) - Passed: ${student.diploma.year_of_passing} | Score: <strong>${student.diploma.percentage_or_cgpa}</strong></p>`
        : '<p style="color: var(--text-muted);">No diploma record.</p>';

    content.innerHTML = `
        <div style="margin-bottom: 1.25rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
                <p><strong>PRN:</strong> ${escapeHtml(student.prn)}</p>
                <p><strong>Branch:</strong> ${escapeHtml(student.branch)}</p>
                <p><strong>Class & Year:</strong> ${escapeHtml(student.class)} • ${escapeHtml(student.year)}</p>
            </div>
            <div>
                <p><strong>Overall CGPA:</strong> <span style="font-size: 1.2rem; font-weight: 700; color: var(--accent);">${student.cgpa_overall || '0.00'}</span></p>
                <p><strong>SSC Marks:</strong> <strong style="color: var(--accent);">${student.ssc_marks !== null && student.ssc_marks !== undefined ? student.ssc_marks + '%' : '--'}</strong></p>
                <p><strong>HSC/Diploma Marks:</strong> <strong style="color: var(--accent);">${student.hsc_marks !== null && student.hsc_marks !== undefined ? student.hsc_marks + '%' : (student.diploma ? student.diploma.percentage_or_cgpa : '--')}</strong></p>
                <p><strong>Resume:</strong> ${student.resume_url ? `<a class="btn btn-secondary btn-sm resume-open-link" href="/api/admin/students/${encodeURIComponent(student.id)}/resume/open" target="_blank" rel="noopener">Open resume</a>` : 'None'}</p>
                <div class="student-contact-actions">${student.email?`<a class="student-contact-link" href="${gmailComposeUrl(student.email)}" target="_blank" rel="noopener"><span>Email</span><strong>${escapeHtml(student.email)}</strong></a>`:''}${student.phone?`<a class="student-contact-link" href="tel:${escapeHtml(student.phone)}"><span>Mobile</span><strong>${escapeHtml(student.phone)}</strong></a>`:''}${!student.email&&!student.phone?'<span class="status-pending">Contact details pending</span>':''}</div>
            </div>
        </div>

        <h4 style="margin-bottom: 0.5rem;">Semester CGPA Breakdown</h4>
        <div class="grid-semesters" style="margin-bottom: 1.25rem;">${semHtml}</div>

        <h4 style="margin-bottom: 0.5rem;">Current Backlogs (${student.active_backlogs || 0})</h4>
        <p style="margin-bottom: 1.25rem;">${Object.entries(backlogs).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key.replace('sem', 'Semester ')}: ${value}`).join(' · ') || 'No current backlogs reported.'}</p>

        <h4 style="margin-bottom: 0.5rem;">Activities & Achievements</h4>
        <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 8px; font-size: 0.9rem; margin-bottom: 1.25rem;">
            ${escapeHtml(student.activities || 'None specified')}
        </div>

        <h4 style="margin-bottom: 0.5rem;">Internships (${student.internships.length})</h4>
        <ul style="padding-left: 1.25rem; margin-bottom: 1.25rem;">${intHtml}</ul>

        <h4 style="margin-bottom: 0.5rem;">Certificates (${student.certificates.length})</h4>
        <ul style="padding-left: 1.25rem; margin-bottom: 1.25rem;">${certHtml}</ul>

        <h4 style="margin-bottom: 0.5rem;">Projects (${student.projects?.length || 0})</h4>
        <ul style="padding-left: 1.25rem; margin-bottom: 1.25rem;">${projectHtml}</ul>

        <h4 style="margin-bottom: 0.5rem;">Research Papers (${student.research_papers?.length || 0})</h4>
        <ul style="padding-left: 1.25rem; margin-bottom: 1.25rem;">${researchHtml}</ul>

        <h4 style="margin-bottom: 0.5rem;">Diploma Details</h4>
        <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 8px; font-size: 0.9rem;">${dipHtml}</div>
    `;

    document.getElementById('studentDetailModal').classList.add('active');
}

function closeStudentModal() {
    document.getElementById('studentDetailModal').classList.remove('active');
}

// Roster Upload Handlers
function handleFileSelected(e) {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        document.getElementById('selectedFileName').innerText = file.name;
        document.getElementById('selectedFileSize').innerText = `${(file.size / 1024).toFixed(1)} KB`;
        document.getElementById('selectedFileInfo').style.display = 'block';
    }
}

async function submitRosterUpload() {
    const token = localStorage.getItem('tpo_admin_token');
    const rawText = document.getElementById('rawCsvText').value.trim();
    const fileInput = document.getElementById('csvFileInput');
    const uploadBtn = document.getElementById('uploadRosterBtn');

    if (!fileInput.files[0] && !rawText) {
        showToast('Select an Excel/CSV file or paste raw CSV text.', 'error');
        return;
    }

    uploadBtn.disabled = true;
    uploadBtn.innerText = 'Processing roster file...';
    setImportProgress(8, 'Reading and validating rows...');
    const progressTimer = window.setInterval(() => {
        const bar = document.getElementById('importProgressBar');
        if (bar.value < 88) setImportProgress(bar.value + 4, 'Writing safe database batches...');
    }, 350);

    const formData = new FormData();
    if (fileInput.files[0]) {
        formData.append('file', fileInput.files[0]);
    } else {
        formData.append('csvContent', rawText);
    }

    try {
        const res = await fetch('/api/admin/roster/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const json = await res.json();
        if (json.success) {
            setImportProgress(100, 'Import complete');
            showToast(json.message, 'success');
            document.getElementById('sumAdded').innerText = json.summary.addedCount;
            document.getElementById('sumUpdated').innerText = json.summary.updatedCount;
            document.getElementById('sumFailed').innerText = json.summary.failedCount;

            const errBox = document.getElementById('uploadErrorList');
            if (json.summary.errors && json.summary.errors.length > 0) {
                errBox.innerHTML = '<strong>Errors/Warnings:</strong><br>' + json.summary.errors.map(e => `• ${e}`).join('<br>');
            } else {
                errBox.innerHTML = '';
            }

            document.getElementById('uploadSummaryBox').style.display = 'block';
            loadRosterCount();
            loadAdminStudents();
            loadImportHistory();
        } else {
            showToast(json.error || 'Roster upload failed', 'error');
        }
    } catch (err) {
        showToast('Error uploading roster file.', 'error');
    } finally {
        window.clearInterval(progressTimer);
        uploadBtn.disabled = false;
        uploadBtn.innerText = 'Process roster dataset';
    }
}

function setImportProgress(percent, text) {
    const box=document.getElementById('importProgress'); if(!box)return;
    box.hidden=false; document.getElementById('importProgressBar').value=percent;
    document.getElementById('importProgressPercent').textContent=`${percent}%`;
    document.getElementById('importProgressText').textContent=text;
}

async function loadImportHistory(){
    const box=document.getElementById('importHistory');if(!box)return;
    const r=await fetch('/api/admin/roster/imports');const j=await r.json();
    box.innerHTML=r.ok&&j.data.length?j.data.map(x=>`<article class="workflow-card"><div class="workflow-card-head"><div><strong>${escapeHtml(x.file_name||'Roster import')}</strong><p>${new Date(x.created_at).toLocaleString()}</p></div><span class="branch-chip">${escapeHtml(x.status)}</span></div><p>${x.total_count} rows · ${x.added_count} added · ${x.updated_count} updated · ${x.failed_count} failed</p><div class="workflow-actions">${x.failed_count?`<a class="btn btn-secondary btn-sm" href="/api/admin/roster/imports/${x.id}/errors.csv">Download errors</a>`:''}${x.status==='completed'?`<button class="btn btn-danger btn-sm" onclick="undoImport('${x.id}')">Undo import</button>`:''}</div></article>`).join(''):'<div class="notification-empty"><strong>No imports yet</strong><p>Upload first roster file to start onboarding.</p></div>';
}
async function undoImport(id){if(!confirm('Undo this import? New PRNs will be removed and updated PRNs restored.'))return;const r=await fetch(`/api/admin/roster/imports/${id}/undo`,{method:'POST'});const j=await r.json();showToast(r.ok?'Import undone.':apiError(j),r.ok?'success':'error');if(r.ok){loadImportHistory();loadRosterCount();loadAdminStudents();}}

async function previewRosterUpload() {
    const rawText = document.getElementById('rawCsvText').value.trim();
    const file = document.getElementById('csvFileInput').files[0];
    if (!file && !rawText) return showToast('Select an Excel/CSV file or paste CSV data.', 'error');
    const form = new FormData();
    if (file) form.append('file', file); else form.append('csvContent', rawText);
    const response = await fetch('/api/admin/roster/preview', { method: 'POST', body: form });
    const json = await response.json();
    if (!response.ok) return showToast(apiError(json), 'error');
    const { summary, rows } = json.data;
    document.getElementById('rosterPreview').innerHTML = `<div class="workflow-card"><strong>${summary.valid}/${summary.total} valid</strong><p>${summary.adds} new · ${summary.updates} updates · ${summary.invalid} rejected</p></div>${rows.filter(row => !row.valid).slice(0,10).map(row => `<div class="workflow-card"><strong>Row ${row.row}: ${escapeHtml(row.prn || 'No PRN')}</strong><p class="eligibility-fail">${escapeHtml(row.errors.join(', '))}</p></div>`).join('')}`;
}

async function loadReadiness() {
    const response = await fetch('/api/admin/workflow/readiness'); const json = await response.json();
    if (!response.ok) return showToast(apiError(json), 'error');
    const { totals, rows } = json.data;
    document.getElementById('readinessMetrics').innerHTML = [['Roster',totals.roster],['Incomplete',totals.incomplete],['No profile',totals.noProfile],['Open corrections',totals.openCorrections]].map(([label,value]) => `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('readinessRows').innerHTML = rows.map(row => `<tr><td><div style="display: flex; flex-direction: column; gap: 0.2rem; white-space: normal;"><strong>${escapeHtml(row.name)}</strong><small style="color: var(--text-muted);">${escapeHtml(row.prn)}</small></div></td><td>${escapeHtml(row.branch)}</td><td>${row.completion}%</td><td><div class="missing-list">${row.missing.map(item => `<span>${escapeHtml(item)}</span>`).join('') || '<span class="eligibility-pass">Complete</span>'}</div></td><td>${row.student_id && row.missing.length ? `<button class="btn btn-secondary btn-sm" onclick="requestCorrection('${row.student_id}','${escapeHtml(row.missing[0])}')">Request fix</button>` : '—'}</td></tr>`).join('');
}

async function requestCorrection(studentId, field) {
    const message = window.prompt(`Correction message for ${field}:`, `Please update your ${field.toLowerCase()} information.`);
    if (!message) return;
    const response = await fetch('/api/admin/workflow/corrections', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({student_id:studentId,field_name:field,message}) });
    const json = await response.json(); if (!response.ok) return showToast(apiError(json),'error');
    showToast('Correction request sent.','success'); loadReadiness();
}

async function loadApplications() {
    const response = await fetch('/api/admin/workflow/applications'); const json = await response.json();
    if (!response.ok) return showToast(apiError(json),'error');
    document.getElementById('applicationPipeline').innerHTML = json.data.length ? json.data.map(item => `<div class="workflow-card"><div class="workflow-card-head"><div><strong>${escapeHtml(item.student_name || item.student_id)}</strong><p>${escapeHtml(item.prn || '')} · ${escapeHtml(item.branch || '')}</p></div><span class="branch-chip">${escapeHtml(item.status)}</span></div><p>${escapeHtml(item.company || item.drive_id)} · ${escapeHtml(item.role || '')}</p><div class="student-contact-actions">${item.email?`<a class="student-contact-link" href="${gmailComposeUrl(item.email)}" target="_blank" rel="noopener"><span>Email</span><strong>${escapeHtml(item.email)}</strong></a>`:''}${item.phone?`<a class="student-contact-link" href="tel:${escapeHtml(item.phone)}"><span>Mobile</span><strong>${escapeHtml(item.phone)}</strong></a>`:''}${!item.email&&!item.phone?'<span class="status-pending">Contact details pending</span>':''}</div><div class="workflow-actions"><select class="form-select" aria-label="Application status" onchange="updateApplicationStatus('${item.id}',this.value)">${['applied','eligible','test','interview','selected','rejected','withdrawn'].map(status => `<option value="${status}" ${status===item.status?'selected':''}>${status}</option>`).join('')}</select></div></div>`).join('') : '<div class="workflow-card"><p>No applications yet.</p></div>';
}

function gmailComposeUrl(email) {
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(String(email || ''))}&su=${encodeURIComponent('Placement application update')}`;
}

async function updateApplicationStatus(id, status) { const response=await fetch(`/api/admin/workflow/applications/${id}/status`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); const json=await response.json(); showToast(response.ok?'Status updated.':apiError(json),response.ok?'success':'error'); }
function toggleNoticeBranches() {
    const all = document.getElementById('noticeAllBranches').checked;
    document.querySelectorAll('#noticeBranches input').forEach(input => { input.disabled = all; if (all) input.checked = false; });
}
function selectedNoticeBranches() { return [...document.querySelectorAll('#noticeBranches input:checked')].map(input => input.value); }
async function sendNotification(event) {
    event.preventDefault();
    const form = event.target;
    const button = document.getElementById('sendNotificationBtn');
    const errorBox = document.getElementById('notificationFormError');
    const expiryValue = document.getElementById('noticeExpiry').value;
    const expiryDate = expiryValue ? new Date(expiryValue) : null;
    errorBox.textContent = '';
    if (expiryDate && (!Number.isFinite(expiryDate.getTime()) || expiryDate.getTime() < Date.now() + 5 * 60 * 1000)) {
        errorBox.textContent = 'Expiry must be at least 5 minutes from now. Leave it blank for no expiry.';
        document.getElementById('noticeExpiry').focus();
        return;
    }
    const action = document.getElementById('noticeAction').value.trim();
    const branches = selectedNoticeBranches();
    if (!document.getElementById('noticeAllBranches').checked && branches.length === 0) {
        errorBox.textContent = 'Select at least one branch or choose All branches.';
        return;
    }
    if (action && !/^(\/(?!\/)|https?:\/\/)/i.test(action)) {
        errorBox.textContent = 'Action URL must start with /, http://, or https://.';
        document.getElementById('noticeAction').focus();
        return;
    }
    button.disabled = true;
    button.textContent = 'Sending alert...';
    try {
        const payload = { title:document.getElementById('noticeTitle').value.trim(), message:document.getElementById('noticeMessage').value.trim(), priority:document.getElementById('noticeImportant').checked?'important':'normal', expires_at:expiryDate?expiryDate.toISOString():null, action_url:action||null, branches };
        let response = await fetch('/api/admin/workflow/notifications', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if (response.status === 403) {
            await fetch('/api/admin/auth/me');
            response = await fetch('/api/admin/workflow/notifications', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        }
        const json = await response.json();
        if (!response.ok) {
            errorBox.textContent = apiError(json);
            return showToast(apiError(json), 'error');
        }
        form.reset();
        toggleNoticeBranches();
        document.getElementById('noticeAction').value = '/dashboard?tab=opportunities';
        showToast(branches.length ? `Alert sent to ${branches.join(', ')}.` : 'Alert sent to all branches.', 'success');
        loadSentNotifications();
    } catch {
        errorBox.textContent = 'Could not reach server. Check connection and try again.';
    } finally {
        button.disabled = false;
        button.textContent = 'Send alert';
    }
}
async function loadSentNotifications() {
    const box = document.getElementById('sentNotifications');
    if (!box) return;
    const response = await fetch('/api/admin/workflow/notifications');
    const json = await response.json();
    if (!response.ok) { box.innerHTML = `<div class="workflow-card"><p>${escapeHtml(apiError(json))}</p></div>`; return; }
    box.innerHTML = json.data.length ? json.data.map(item => `<article class="sent-notification-card"><div class="workflow-card-head"><div><span class="notification-priority ${item.priority==='important'?'important':''}">${item.expired?'Expired':item.priority}</span><h4>${escapeHtml(item.title)}</h4></div><button class="btn btn-danger btn-sm" onclick="deleteSentNotification('${item.id}')">Delete</button></div><p>${escapeHtml(item.message)}</p><p class="notification-audience">Audience: ${item.audience==='all'?'All branches':escapeHtml((item.branches||[]).join(', '))}</p>${item.expired&&item.lifetime_seconds<300?`<div class="notification-delivery-warning">Expired after ${item.lifetime_seconds} seconds. Students may not have had time to read it.</div>`:''}<div class="sent-notification-meta"><span>Sent ${new Date(item.created_at).toLocaleString()}</span><span>${item.read_count}/${item.recipient_count} read</span>${item.expires_at?`<span>Expires ${new Date(item.expires_at).toLocaleString()}</span>`:'<span>No expiry</span>'}</div>${item.action_url?`<small>Opens: ${escapeHtml(item.action_url)}</small>`:''}</article>`).join('') : '<div class="notification-empty"><strong>No alerts sent yet</strong><p>Sent notifications will appear here.</p></div>';
}
async function deleteSentNotification(id) {
    if (!confirm('Delete this notification from every student inbox?')) return;
    const response = await fetch(`/api/admin/workflow/notifications/${id}`, { method:'DELETE' });
    const json = await response.json();
    showToast(response.ok ? 'Notification deleted.' : apiError(json), response.ok ? 'success' : 'error');
    if (response.ok) loadSentNotifications();
}

// Audit Logs Loader
async function loadAuditLogs() {
    const token = localStorage.getItem('tpo_admin_token');
    const tbody = document.getElementById('auditLogsTableBody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading audit logs...</td></tr>`;

    try {
        const res = await fetch('/api/admin/audit-logs', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
            if (!json.logs || json.logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No audit logs recorded yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = json.logs.map(l => {
                const detailsStr = typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || '');
                return `
                    <tr>
                        <td style="white-space: nowrap; font-size: 0.8rem; color: var(--text-muted);">${new Date(l.created_at).toLocaleString()}</td>
                        <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td>
                        <td><code>${escapeHtml(l.target_table)}</code></td>
                        <td>${escapeHtml(l.target_id || '-')}</td>
                        <td style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(detailsStr)}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Failed to load audit logs.</td></tr>`;
    }
}

// Tab Switcher
function switchAdminTab(tabId, trigger) {
    document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn === trigger);
        btn.setAttribute('aria-selected', String(btn === trigger));
    });
    document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === `tab-${tabId}`));

    if (tabId === 'audit-logs') {
        loadAuditLogs();
    }
    if (tabId === 'roster') loadImportHistory();
    if (tabId === 'readiness') loadReadiness();
    if (tabId === 'workflow') { loadApplications(); loadSentNotifications(); }
    if (tabId === 'advanced') loadAdvancedOperations();
    if (tabId === 'analytics') loadAdminAnalytics();
    if (tabId === 'calendar') renderCalendar();
    if (tabId === 'intelligence') loadIntelligenceSuite();
}

async function loadIntelligenceSuite(){await Promise.all([loadSystemHealth(),loadStaffAccounts(),loadFraudCheck(),loadLaunchChecklist(),loadLaunchBackups(),loadSecurityAlerts()]);}
async function loadLaunchChecklist(){await fetch('/api/admin/launch/deadline-reminders',{method:'POST'});const r=await fetch('/api/admin/launch/checklist');const j=await r.json();const b=document.getElementById('launchChecklist');if(!b)return;b.innerHTML=r.ok?`<div class="workflow-card"><strong>${j.data.completed}/${j.data.total} launch checks complete</strong></div>`+j.data.checks.map(x=>`<div class="workflow-card checklist-row ${x.complete?'complete':''}"><strong>${x.complete?'Complete':'Action needed'}: ${escapeHtml(x.label)}</strong><p>${escapeHtml(x.action)}</p></div>`).join(''):`<p>${escapeHtml(apiError(j))}</p>`;}
async function loadLaunchBackups(){const b=document.getElementById('launchBackups');if(!b)return;const r=await fetch('/api/admin/launch/backups');const j=await r.json();b.innerHTML=r.ok?(j.data.length?j.data.map(x=>{const label=/^Manual backup\b/i.test(x.label)?'Manual backup':x.label;return `<div class="workflow-card backup-history-item" role="listitem"><div><strong>${escapeHtml(label)}</strong><p>${new Date(x.created_at).toLocaleString()}</p></div><button class="btn btn-danger btn-sm" onclick="restoreLaunchBackup('${x.id}')">Restore</button></div>`;}).join(''):'<div class="notification-empty"><strong>No backups</strong><p>Create one before launch changes.</p></div>'):'<p>Super Admin access required.</p>';}
async function createLaunchBackup(){const label=`Manual backup ${new Date().toLocaleString()}`;const r=await fetch('/api/admin/launch/backups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label})});const j=await r.json();showToast(r.ok?'Backup created.':apiError(j),r.ok?'success':'error');if(r.ok)loadLaunchBackups();}
async function restoreLaunchBackup(id){if(!confirm('Restore this backup? Current operational data will be replaced.'))return;const r=await fetch(`/api/admin/launch/backups/${id}/restore`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'RESTORE BACKUP'})});const j=await r.json();showToast(r.ok?'Backup restored.':apiError(j),r.ok?'success':'error');if(r.ok)loadLaunchBackups();}
async function loadSecurityAlerts(){const b=document.getElementById('securityAlerts');if(!b)return;const r=await fetch('/api/admin/launch/security-alerts');const j=await r.json();b.innerHTML=r.ok?(j.data.length?j.data.map(x=>`<div class="workflow-card"><strong>${escapeHtml(x.type.replaceAll('_',' '))}</strong><p>${escapeHtml(x.message)}</p></div>`).join(''):'<div class="notification-empty"><strong>No suspicious activity</strong><p>Login and audit scan clean.</p></div>'):`<p>${escapeHtml(apiError(j))}</p>`;}
async function loadSystemHealth(){const r=await fetch('/api/admin/intelligence/health');const j=await r.json();const box=document.getElementById('systemHealth');if(!r.ok){box.innerHTML=`<div class="workflow-card"><p>${escapeHtml(apiError(j))}</p></div>`;return;}const d=j.data;box.innerHTML=[['API',d.api],['Database',d.database],['DB latency',`${d.databaseLatencyMs} ms`],['Release',d.release],['Failed logins',d.failedLogins],['Recent errors',d.recentErrors],['Students',d.counts.students],['Staff',d.counts.staff]].map(([l,v])=>`<div class="metric-card"><span>${l}</span><strong>${escapeHtml(v)}</strong></div>`).join('')+`<div class="workflow-card health-note"><strong>Email status</strong><p>${escapeHtml(d.email)}</p><small>${escapeHtml(d.runtime)}</small></div>`;}
async function parseJobDescription(){const r=await fetch('/api/admin/intelligence/jd-parser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jd_text:document.getElementById('jdParserText').value})});const j=await r.json();document.getElementById('jdParserResult').innerHTML=r.ok?`<div class="workflow-card"><strong>Extracted for confirmation</strong><p>Branches: ${escapeHtml(j.data.branches.join(', ')||'Not found')} · CGPA: ${j.data.min_cgpa}</p><p>Skills: ${escapeHtml(j.data.skills.join(', ')||'Not found')}</p><p>Deadline: ${escapeHtml(j.data.deadline||'Not found')} · Location: ${escapeHtml(j.data.location||'Not found')}</p></div>`:`<div class="workflow-card"><p>${escapeHtml(apiError(j))}</p></div>`;}
async function loadCandidateRanking(){const id=document.getElementById('rankingDriveId').value.trim();if(!id)return showToast('Enter drive UUID.','error');const r=await fetch(`/api/admin/intelligence/rankings/${encodeURIComponent(id)}`);const j=await r.json();document.getElementById('rankingResults').innerHTML=r.ok&&j.data.length?j.data.map(x=>`<div class="workflow-card"><strong>#${x.rank} ${escapeHtml(x.student?.name||x.student_id)}</strong><p>${escapeHtml(x.student?.branch||'')} · Score ${x.score} · ${escapeHtml(x.decision)}</p></div>`).join(''):'<div class="workflow-card"><p>No eligible ranked candidates. Run drive matching first.</p></div>';}
async function loadFraudCheck(){const r=await fetch('/api/admin/intelligence/fraud-check');const j=await r.json();document.getElementById('fraudResults').innerHTML=r.ok?(j.data.length?`<div class="workflow-card"><strong>${j.summary.total} findings · ${j.summary.high} high</strong></div>`+j.data.slice(0,20).map(x=>`<div class="workflow-card"><div class="workflow-card-head"><strong>${escapeHtml(x.type.replaceAll('_',' '))}</strong><span class="branch-chip">${escapeHtml(x.severity)}</span></div><p>${escapeHtml(x.value)} · ${x.count||1} records</p></div>`).join(''):'<div class="workflow-card"><p>No duplicate or conflicting records found.</p></div>'):`<div class="workflow-card"><p>${escapeHtml(apiError(j))}</p></div>`;}
async function loadStaffAccounts(){const r=await fetch('/api/admin/auth/accounts');const j=await r.json();const box=document.getElementById('staffList');if(!r.ok){box.innerHTML=`<div class="workflow-card"><p>Super Admin access required.</p></div>`;return;}staffAccountCache=new Map(j.data.map(x=>[x.id,x]));box.innerHTML=j.data.map(x=>`<div class="workflow-card"><div class="workflow-card-head"><div><strong>${escapeHtml(x.profile?.display_name||x.email)}</strong><p>${escapeHtml(x.email)}</p></div><span class="branch-chip">${escapeHtml(x.profile?.status||'unconfigured')}</span></div><p>${escapeHtml(x.profile?.role||'')} · ${escapeHtml(x.profile?.department||'All departments')} · Last login ${x.profile?.last_login_at?new Date(x.profile.last_login_at).toLocaleString():'Never'}</p><div class="workflow-actions">${x.profile&&x.profile.role!=='super_admin'?`<button class="btn btn-secondary btn-sm" onclick="toggleStaff('${x.id}','${x.profile.status==='active'?'disabled':'active'}')">${x.profile.status==='active'?'Disable':'Enable'}</button><button class="btn btn-secondary btn-sm" onclick="resetStaffPassword('${x.id}')">Reset password</button>`:''}</div></div>`).join('');}
async function createStaffAccount(event){event.preventDefault();const raw=Object.fromEntries(new FormData(event.target));raw.department=raw.department||null;const r=await fetch('/api/admin/auth/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(raw)});const j=await r.json();showToast(r.ok?'Staff account created.':apiError(j),r.ok?'success':'error');if(r.ok){event.target.reset();loadStaffAccounts();}}
async function toggleStaff(id,status){const profile=staffAccountCache.get(id)?.profile;if(!profile)return;const r=await fetch(`/api/admin/auth/accounts/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,role:profile.role,display_name:profile.display_name||'Staff',department:profile.department||null})});const j=await r.json();showToast(r.ok?`Staff ${status}. Existing sessions revoked.`:apiError(j),r.ok?'success':'error');if(r.ok)loadStaffAccounts();}
async function resetStaffPassword(id){const password=prompt('New password (10+ characters):');if(!password)return;const r=await fetch(`/api/admin/auth/accounts/${id}/password`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const j=await r.json();showToast(r.ok?'Password reset; sessions revoked.':apiError(j),r.ok?'success':'error');}
function downloadManagementReport(){location.href='/api/admin/intelligence/reports/management.xlsx';}
function downloadAccessLoginReport(){location.href='/api/admin/intelligence/reports/access-logins.xlsx';}
function openManagementPdf(){window.open('/api/admin/intelligence/reports/management-print','_blank','noopener');}

async function loadAdvancedOperations(){
    const [analytics,filters,events,interviews,offers]=await Promise.all(['/analytics','/filters','/calendar_events','/interviews','/offers'].map(path=>fetch('/api/admin/advanced'+path).then(r=>r.json())));
    const a=analytics.data; document.getElementById('advancedMetrics').innerHTML=[['Students',a.students],['Placed',a.placed],['Offers',a.offers],['Average package',`${a.averagePackage} LPA`],['Highest package',`${a.highestPackage} LPA`],['Profile completion',`${a.profileCompletion}%`]].map(([l,v])=>`<div class="metric-card"><span>${l}</span><strong>${v}</strong></div>`).join('');
    document.getElementById('savedFilters').innerHTML=filters.data.map(f=>`<button class="btn btn-secondary btn-sm" data-filter="${encodeURIComponent(JSON.stringify(f.filters))}" onclick="applySavedFilter(this.dataset.filter)">${escapeHtml(f.name)}</button>`).join('');
    document.getElementById('calendarList').innerHTML=events.data.length?events.data.map(e=>`<div class="workflow-card"><strong>${escapeHtml(e.title)}</strong><p>${new Date(e.starts_at).toLocaleString()} · ${escapeHtml(e.location||'')}</p></div>`).join(''):'<div class="workflow-card"><p>No calendar events.</p></div>';
    document.getElementById('operationsList').innerHTML=[...interviews.data.map(x=>({title:'Interview',text:new Date(x.starts_at).toLocaleString()})),...offers.data.map(x=>({title:`${x.company} · ${x.role}`,text:`${x.status} · ${x.package_lpa||0} LPA`}))].map(x=>`<div class="workflow-card"><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.text)}</p></div>`).join('')||'<div class="workflow-card"><p>No records.</p></div>';
    loadDobCorrections();
}
async function runAdvancedSearch(){const p=new URLSearchParams({q:document.getElementById('advancedQuery').value,branch:document.getElementById('advancedBranch').value,minCgpa:document.getElementById('advancedCgpa').value,skill:document.getElementById('advancedSkill').value});const r=await fetch('/api/admin/advanced/search?'+p);const j=await r.json();document.getElementById('advancedResults').innerHTML=j.data.map(s=>`<article class="workflow-card"><div class="workflow-card-head"><div><strong>${escapeHtml(s.name)}</strong><p>${escapeHtml(s.prn)} · ${escapeHtml(s.branch)}</p></div><span class="branch-chip">${s.completion.score}%</span></div><p>CGPA ${s.cgpa_overall||0} · ${s.skills.map(escapeHtml).join(', ')||'No skills'}</p><div class="missing-list">${s.resumeReview.issues.map(x=>`<span>${escapeHtml(x)}</span>`).join('')||'<span class="eligibility-pass">Resume ready</span>'}</div><small>Student ID: ${s.id}</small></article>`).join('')||'<div class="workflow-card"><p>No matches.</p></div>';}
function currentAdvancedFilters(){return{q:document.getElementById('advancedQuery').value,branch:document.getElementById('advancedBranch').value,minCgpa:document.getElementById('advancedCgpa').value,skill:document.getElementById('advancedSkill').value};}
async function saveCurrentFilter(){const name=window.prompt('Saved filter name:');if(!name)return;const r=await fetch('/api/admin/advanced/filters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,filters:currentAdvancedFilters()})});showToast(r.ok?'Filter saved.':'Could not save filter.',r.ok?'success':'error');if(r.ok)loadAdvancedOperations();}
function applySavedFilter(raw){const f=JSON.parse(decodeURIComponent(raw));document.getElementById('advancedQuery').value=f.q||'';document.getElementById('advancedBranch').value=f.branch||'all';document.getElementById('advancedCgpa').value=f.minCgpa||'';document.getElementById('advancedSkill').value=f.skill||'';runAdvancedSearch();}
async function saveAdvancedRecord(event){event.preventDefault();const form=event.target;const endpoint={assessmentForm:'assessments',interviewForm:'interviews',offerForm:'offers',calendarForm:'calendar_events'}[form.id];const raw=Object.fromEntries(new FormData(form));const nullable=['drive_id','student_id','score','max_score','package_lpa','attended_on','offer_date','joining_date','ends_at'];nullable.forEach(k=>{if(k in raw&&!raw[k])raw[k]=null});['score','max_score','package_lpa'].forEach(k=>{if(raw[k]!=null)raw[k]=Number(raw[k])});['starts_at','ends_at'].forEach(k=>{if(raw[k])raw[k]=new Date(raw[k]).toISOString()});if(endpoint==='interviews'){raw.meeting_url='';raw.status='scheduled';raw.notes='';}if(endpoint==='assessments')raw.notes='';if(endpoint==='offers'){raw.drive_id=null;raw.offer_date=null;raw.joining_date=null;}if(endpoint==='calendar_events'){raw.ends_at=null;raw.description='';}const r=await fetch('/api/admin/advanced/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(raw)});const j=await r.json();showToast(r.ok?'Record saved.':apiError(j),r.ok?'success':'error');if(r.ok){form.reset();loadAdvancedOperations();}}

function handleAdminLogout() {
    localStorage.removeItem('tpo_admin_token');
    fetch('/api/admin/auth/logout', { method: 'POST' }).finally(() => {
        window.location.href = '/';
    });
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'}</span> ${msg}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

// --- Analytics and Calendar ---

let analyticsCharts = {};

async function loadAdminAnalytics() {
    try {
        const token = localStorage.getItem('tpo_admin_token');
        const res = await fetch('/api/admin/advanced/analytics', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to fetch analytics');

        const data = json.data;

        // Placements by Branch (Bar Chart)
        const branches = Object.keys(data.byBranch);
        const placedData = branches.map(b => data.byBranch[b].placed);
        const totalData = branches.map(b => data.byBranch[b].students);

        if (analyticsCharts.placement) analyticsCharts.placement.destroy();
        analyticsCharts.placement = new Chart(document.getElementById('placementChart'), {
            type: 'bar',
            data: {
                labels: branches,
                datasets: [
                    { label: 'Placed', data: placedData, backgroundColor: '#10b981' },
                    { label: 'Total Students', data: totalData, backgroundColor: 'rgba(255,255,255,0.1)' }
                ]
            },
            options: { responsive: true, plugins: { title: { display: true, text: 'Placements by Branch', color: '#f8fafc' } }, color: '#cbd5e1' }
        });

        // Avg CGPA by Branch (Line Chart)
        const cgpaData = branches.map(b => data.byBranch[b].avgCgpa);
        if (analyticsCharts.ctc) analyticsCharts.ctc.destroy();
        analyticsCharts.ctc = new Chart(document.getElementById('ctcChart'), {
            type: 'line',
            data: {
                labels: branches,
                datasets: [{ label: 'Avg CGPA', data: cgpaData, borderColor: '#3b82f6', tension: 0.1, fill: false }]
            },
            options: { responsive: true, plugins: { title: { display: true, text: 'Average CGPA by Branch', color: '#f8fafc' } }, color: '#cbd5e1' }
        });

        // Profile Completion (Doughnut Chart)
        if (analyticsCharts.completion) analyticsCharts.completion.destroy();
        analyticsCharts.completion = new Chart(document.getElementById('completionChart'), {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Incomplete'],
                datasets: [{ data: [data.profileCompletion, 100 - data.profileCompletion], backgroundColor: ['#8b5cf6', 'rgba(255,255,255,0.1)'] }]
            },
            options: { responsive: true, plugins: { title: { display: true, text: 'Average Profile Completion (%)', color: '#f8fafc' } }, color: '#cbd5e1' }
        });

        // Package Distribution (Pie Chart)
        if (analyticsCharts.package) analyticsCharts.package.destroy();
        analyticsCharts.package = new Chart(document.getElementById('packageChart'), {
            type: 'pie',
            data: {
                labels: Object.keys(data.packageDistribution),
                datasets: [{ data: Object.values(data.packageDistribution), backgroundColor: ['#f43f5e', '#3b82f6', '#10b981'] }]
            },
            options: { responsive: true, plugins: { title: { display: true, text: 'Package Distribution', color: '#f8fafc' } }, color: '#cbd5e1' }
        });

        // Top Recruiters (Bar Chart)
        if (analyticsCharts.recruiters) analyticsCharts.recruiters.destroy();
        analyticsCharts.recruiters = new Chart(document.getElementById('recruitersChart'), {
            type: 'bar',
            data: {
                labels: data.topRecruiters.map(r => r.company),
                datasets: [{ label: 'Offers Given', data: data.topRecruiters.map(r => r.count), backgroundColor: '#f59e0b' }]
            },
            options: { responsive: true, plugins: { title: { display: true, text: 'Top 5 Recruiters', color: '#f8fafc' } }, color: '#cbd5e1', scales: { y: { beginAtZero: true } } }
        });

    } catch (err) {
        showToast(err.message, 'error');
    }
}

let calendarInstance = null;

async function renderCalendar() {
    if (calendarInstance) {
        setTimeout(() => calendarInstance.render(), 50);
        return;
    }

    const calEl = document.getElementById('driveCalendar');
    if (!calEl || typeof FullCalendar === 'undefined') return;

    calendarInstance = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth',
        themeSystem: 'standard',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        height: 600,
        events: async function(info, successCallback, failureCallback) {
            try {
                const token = localStorage.getItem('tpo_admin_token');
                const res = await fetch('/api/admin/drives', { headers: { 'Authorization': `Bearer ${token}` }});
                const json = await res.json();
                if (!json.success) throw new Error();

                const events = json.data.map(drive => ({
                    id: drive.id,
                    title: `${drive.company} - ${drive.role}`,
                    start: drive.application_deadline,
                    allDay: true,
                    backgroundColor: drive.status === 'open' ? '#10b981' : (drive.status === 'closed' ? '#f43f5e' : '#3b82f6'),
                    borderColor: 'transparent'
                })).filter(e => e.start);

                successCallback(events);
            } catch (err) {
                failureCallback(err);
            }
        }
    });

    calendarInstance.render();
}

async function adminResetStudentDob() { const prn = document.getElementById('resetDobPrn').value.trim(); const dob = document.getElementById('resetDobValue').value.trim(); if (!prn || !dob) return showToast('Please enter both PRN and new DOB', 'error'); const btn = document.getElementById('resetDobBtn'); btn.disabled = true; btn.textContent = 'Resetting...'; try { const res = await fetch('/api/admin/roster/reset-dob', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ prn, dob }) }); const json = await res.json(); if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to reset DOB'); showToast('Successfully reset password (DOB) for ' + prn, 'success'); document.getElementById('resetDobPrn').value = ''; document.getElementById('resetDobValue').value = ''; } catch(err) { showToast(err.message, 'error'); } finally { btn.disabled = false; btn.textContent = 'Reset Password'; } }

async function handleChangeStudentPassword(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const studentPrn = document.getElementById('dashStudentPrn').value.trim();
    const newDob = document.getElementById('dashNewDob').value.trim();
    const statusDiv = document.getElementById('changePasswordStatus');
    const btn = form.querySelector('button[type="submit"]');

    if (!studentPrn || !newDob) {
        statusDiv.textContent = 'Please provide both Student PRN and new DOB.';
        statusDiv.style.color = 'var(--error)';
        statusDiv.hidden = false;
        return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Updating password...';
    statusDiv.hidden = true;

    try {
        const response = await fetch('/api/admin/auth/change-student-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentPrn, newDob })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || result.error || 'Failed to update student password.');

        statusDiv.textContent = 'Success: Student password updated.';
        statusDiv.style.color = 'var(--primary)';
        statusDiv.hidden = false;
        form.reset();
    } catch (err) {
        statusDiv.textContent = err.message;
        statusDiv.style.color = 'var(--error)';
        statusDiv.hidden = false;
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function loadDobCorrections() {
    const list = document.getElementById('dobCorrectionsAdminList');
    if (!list) return;
    try {
        const res = await fetch('/api/admin/roster/dob-corrections');
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
                ? `<button class="btn btn-secondary btn-sm" onclick="processDobRequest('${req.id}', 'approve')" style="margin-right:0.3rem;">Approve</button>
                   <button class="btn btn-danger btn-sm" onclick="processDobRequest('${req.id}', 'reject')">Reject</button>`
                : `<span style="color:var(--text-muted); font-size:0.8rem;">Processed</span>`;

            const mismatchBadge = req.name_mismatch
                ? `<span class="badge badge-offline" style="background-color:#f43f5e; color:#ffffff; font-size:0.75rem; margin-left:0.5rem; padding: 2px 6px; border-radius: 4px; border:none; display:inline-block;">Name Mismatch</span>`
                : '';

            return `
                <tr style="border-bottom: 1px solid #334155;">
                    <td style="padding: 8px;"><strong>${escapeHtml(req.prn)}</strong></td>
                    <td style="padding: 8px;">${escapeHtml(req.submitted_name)}${mismatchBadge}</td>
                    <td style="padding: 8px;">${dateStr}</td>
                    <td style="padding: 8px;"><span class="branch-chip">${escapeHtml(req.department)}</span></td>
                    <td style="padding: 8px;"><span class="badge ${statusClass}">${escapeHtml(req.status)}</span></td>
                    <td style="padding: 8px; text-align: right;">${actions}</td>
                </tr>
            `;
        }).join('') : `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #94a3b8;">No correction requests.</td></tr>`;
    } catch (err) {
        list.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #ef4444;">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function processDobRequest(id, action) {
    if (!confirm(`Are you sure you want to ${action} this request?`)) return;
    try {
        const res = await fetch(`/api/admin/roster/dob-corrections/${id}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const json = await res.json();
        showToast(res.ok ? `Request ${action}d successfully.` : (json.error || `Failed to ${action} request.`), res.ok ? 'success' : 'error');
        if (res.ok) {
            loadDobCorrections();
        }
    } catch (err) {
        showToast('Error communicating with server.', 'error');
    }
}
