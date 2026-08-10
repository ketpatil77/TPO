let allStudentsData = [];
let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminLogoutBtn').addEventListener('click', handleAdminLogout);
    document.getElementById('driveForm')?.addEventListener('submit', handleDriveSubmit);
    
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
});

async function loadAdminStudents() {
    const token = localStorage.getItem('tpo_admin_token');
    const branch = document.getElementById('filterBranch').value;
    const minCgpa = document.getElementById('filterMinCgpa').value;
    const search = document.getElementById('filterSearch').value;

    const params = new URLSearchParams();
    if (branch && branch !== 'all') params.append('branch', branch);
    if (minCgpa) params.append('minCgpa', minCgpa);
    if (search) params.append('search', search);

    try {
        const res = await fetch(`/api/admin/students?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('tpo_admin_token');
            window.location.href = '/admin/login';
            return;
        }

        const data = await res.json();
        if (data.success) {
            allStudentsData = data.students;
            document.getElementById('statFilteredCount').innerText = data.count;
            populateBranchDropdown(data.branches);
            renderStudentsTable(data.students);
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

async function handleDriveSubmit(event) {
    event.preventDefault();
    const driveResponse = await fetch('/api/admin/drives', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            company: document.getElementById('driveCompany').value.trim(),
            role: document.getElementById('driveRole').value.trim(),
            jd_text: document.getElementById('driveJd').value.trim(),
            application_deadline: null, status: 'draft'
        })
    });
    const driveJson = await driveResponse.json();
    if (!driveResponse.ok) return showToast(apiError(driveJson), 'error');
    const drive = driveJson.data;
    const criteriaResponse = await fetch(`/api/admin/drives/${drive.id}/criteria`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            branches: csvValues('driveBranches'),
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
        container.innerHTML = json.data.length ? json.data.map(drive => `
            <article class="item-card">
                <div><strong>${escapeHtml(drive.company)}</strong><p>${escapeHtml(drive.role)}</p></div>
                <button class="btn btn-secondary btn-sm" onclick="viewMatches('${drive.id}')">Results</button>
            </article>`).join('') : '<p>No placement drives yet.</p>';
    } catch (error) { container.textContent = error.message; }
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
        const res = await fetch('/api/roster', {
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
                <td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    🔍 No student records match the active filter criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = students.map(s => {
        const cgpa = s.cgpa_overall ? parseFloat(s.cgpa_overall).toFixed(2) : '0.00';
        const resumeLink = s.resume_url 
            ? `<span class="badge badge-info">Uploaded</span>` 
            : `<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>`;

        const diplomaBadge = s.has_diploma 
            ? `<span class="badge badge-online" style="font-size: 0.7rem;">Diploma</span>`
            : `<span class="badge badge-offline" style="font-size: 0.7rem;">Regular</span>`;

        return `
            <tr onclick="openStudentModal('${s.id}')">
                <td><strong style="color: var(--text-heading);">${escapeHtml(s.prn)}</strong></td>
                <td>${escapeHtml(s.name || 'N/A')}</td>
                <td>${escapeHtml(s.branch || 'N/A')} <span style="color: var(--text-muted); font-size: 0.8rem;">(${escapeHtml(s.class || '')})</span></td>
                <td>${escapeHtml(s.year || 'N/A')}</td>
                <td><strong style="color: var(--accent);">${cgpa}</strong></td>
                <td><span class="badge badge-info">${s.internships_count} internships</span></td>
                <td><span class="badge badge-info">${s.certificates_count} certs</span></td>
                <td>${diplomaBadge}</td>
                <td>${resumeLink}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openStudentModal('${s.id}')">👁️ View</button></td>
            </tr>
        `;
    }).join('');
}

let filterTimeout = null;
function applyFilters() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        loadAdminStudents();
    }, 250);
}

function resetFilters() {
    document.getElementById('filterBranch').value = 'all';
    document.getElementById('filterMinCgpa').value = '';
    document.getElementById('filterSearch').value = '';
    loadAdminStudents();
}

function exportData(type) {
    const token = localStorage.getItem('tpo_admin_token');
    const branch = document.getElementById('filterBranch').value;
    const minCgpa = document.getElementById('filterMinCgpa').value;
    const search = document.getElementById('filterSearch').value;

    const params = new URLSearchParams();
    if (branch && branch !== 'all') params.append('branch', branch);
    if (minCgpa) params.append('minCgpa', minCgpa);
    if (search) params.append('search', search);

    const endpoint = type === 'excel' ? '/api/admin/students/export/excel' : '/api/admin/students/export/csv';
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
        a.download = `tpo_students_export_${Date.now()}.${type === 'excel' ? 'xlsx' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`${type.toUpperCase()} file downloaded successfully!`, 'success');
    })
    .catch(err => {
        showToast('Export failed: ' + err.message, 'error');
    });
}

// Modal View
function openStudentModal(studentId) {
    const student = allStudentsData.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('modalStudentName').innerText = `${student.name || 'Student'} (${student.prn})`;
    const content = document.getElementById('modalContent');

    const sems = student.cgpa_semesterwise || {};
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
                <p><strong>Resume:</strong> ${student.resume_url ? 'Uploaded privately' : 'None'}</p>
            </div>
        </div>

        <h4 style="margin-bottom: 0.5rem;">Semester CGPA Breakdown</h4>
        <div class="grid-semesters" style="margin-bottom: 1.25rem;">${semHtml}</div>

        <h4 style="margin-bottom: 0.5rem;">Activities & Achievements</h4>
        <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 8px; font-size: 0.9rem; margin-bottom: 1.25rem;">
            ${escapeHtml(student.activities || 'None specified')}
        </div>

        <h4 style="margin-bottom: 0.5rem;">Internships (${student.internships.length})</h4>
        <ul style="padding-left: 1.25rem; margin-bottom: 1.25rem;">${intHtml}</ul>

        <h4 style="margin-bottom: 0.5rem;">Certificates (${student.certificates.length})</h4>
        <ul style="padding-left: 1.25rem; margin-bottom: 1.25rem;">${certHtml}</ul>

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
        showToast('Please select a CSV file or paste raw CSV text.', 'error');
        return;
    }

    uploadBtn.disabled = true;
    uploadBtn.innerText = 'Processing Roster CSV...';

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
        } else {
            showToast(json.error || 'Roster upload failed', 'error');
        }
    } catch (err) {
        showToast('Error uploading roster CSV.', 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerText = '📤 Process & Upsert Roster Dataset';
    }
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
function switchAdminTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.currentTarget.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');

    if (tabId === 'audit-logs') {
        loadAuditLogs();
    }
}

function handleAdminLogout() {
    localStorage.removeItem('tpo_admin_token');
    fetch('/api/admin/auth/logout', { method: 'POST' }).finally(() => {
        window.location.href = '/admin/login';
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
