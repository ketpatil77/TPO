let currentStudentData = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('profileForm').addEventListener('submit', handleProfileSubmit);
    document.getElementById('internshipForm').addEventListener('submit', handleInternshipSubmit);
    document.getElementById('certForm').addEventListener('submit', handleCertSubmit);
    document.getElementById('diplomaForm').addEventListener('submit', handleDiplomaSubmit);

    loadDashboardData();
});

async function loadDashboardData() {
    const token = localStorage.getItem('tpo_token');
    try {
        const res = await fetch('/api/student/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            localStorage.removeItem('tpo_token');
            window.location.href = '/login';
            return;
        }

        const json = await res.json();
        if (json.success) {
            currentStudentData = json.data;
            renderDashboard(json.data);
        } else {
            showToast(json.error || 'Failed to load profile.', 'error');
        }
    } catch (err) {
        console.error('Error loading dashboard:', err);
        showToast('Error connecting to backend server.', 'error');
    }
}

function renderDashboard(data) {
    const { student, internships, certificates, diploma, skills = [] } = data;

    // 1. Header & Meta
    document.getElementById('navStudentPrn').innerText = `PRN: ${student.prn}`;
    document.getElementById('studentAvatar').innerText = student.name ? student.name.charAt(0).toUpperCase() : 'S';
    document.getElementById('studentName').innerText = student.name || 'Student';
    document.getElementById('studentBranch').innerText = `Branch: ${student.branch || 'Not Set'}`;
    document.getElementById('studentClass').innerText = `Class: ${student.class || 'Not Set'}`;
    document.getElementById('studentYear').innerText = `Year: ${student.year || 'Not Set'}`;
    
    const overallCgpa = student.cgpa_overall ? parseFloat(student.cgpa_overall).toFixed(2) : '0.00';
    document.getElementById('overallCgpaBadge').innerText = `Overall CGPA: ${overallCgpa}`;

    // 2. Overview Tab
    document.getElementById('overviewCgpa').innerText = overallCgpa;
    const resumeContainer = document.getElementById('overviewResume');
    if (student.resume_url) {
        resumeContainer.innerHTML = '<button type="button" class="btn btn-secondary btn-sm" onclick="openResume()">View Resume</button>';
    } else {
        resumeContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Not Uploaded</span>`;
    }

    document.getElementById('overviewActivities').innerText = student.activities || 'No activities recorded yet. Click "Edit Profile" to add extracurricular accomplishments.';

    // Semester Breakdown Grid
    const semGrid = document.getElementById('semestersGrid');
    semGrid.innerHTML = '';
    const sems = student.cgpa_semesterwise || {};
    for (let i = 1; i <= 8; i++) {
        const key = `sem${i}`;
        const val = sems[key] ? parseFloat(sems[key]).toFixed(2) : '--';
        semGrid.innerHTML += `
            <div style="background: rgba(15,23,42,0.6); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">Sem ${i}</div>
                <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-heading);">${val}</div>
            </div>
        `;
    }

    // Diploma status badge
    const diplomaBadgeContainer = document.getElementById('overviewDiplomaBadge');
    if (diploma) {
        diplomaBadgeContainer.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.1); padding: 1rem; border-radius: 10px; border: 1px solid rgba(16, 185, 129, 0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.25rem;">
                    <strong style="color: #6ee7b7;">${escapeHtml(diploma.institute)}</strong>
                    <span class="badge badge-online">Diploma Student</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">
                    ${escapeHtml(diploma.branch)} • Passed: ${escapeHtml(diploma.year_of_passing)} • Score: <strong>${escapeHtml(diploma.percentage_or_cgpa)}</strong>
                </div>
            </div>
        `;
    } else {
        diplomaBadgeContainer.innerHTML = `<span class="badge badge-offline">No Diploma Record (Regular Entry)</span>`;
    }

    // 3. Edit Profile Tab Prefill
    document.getElementById('editName').value = student.name || '';
    document.getElementById('editPrn').value = student.prn || '';
    document.getElementById('editBranch').value = student.branch || '';
    document.getElementById('editClass').value = student.class || '';
    document.getElementById('editYear').value = student.year || 'Final Year';
    document.getElementById('editOverallCgpa').value = student.cgpa_overall || '';
    document.getElementById('editSkills').value = skills.map(item => item.skill).join(', ');
    document.getElementById('editActivities').value = student.activities || '';

    for (let i = 1; i <= 8; i++) {
        const semInput = document.getElementById(`sem${i}`);
        if (semInput) {
            semInput.value = (sems[`sem${i}`] !== undefined && sems[`sem${i}`] !== null) ? sems[`sem${i}`] : '';
        }
    }

    // 4. Internships Tab
    document.getElementById('internshipCount').innerText = internships.length;
    renderInternships(internships);

    // 5. Certificates Tab
    document.getElementById('certCount').innerText = certificates.length;
    renderCertificates(certificates);

    // 6. Diploma Tab Prefill
    if (diploma) {
        document.getElementById('diplomaInstitute').value = diploma.institute || '';
        document.getElementById('diplomaBranch').value = diploma.branch || '';
        document.getElementById('diplomaYear').value = diploma.year_of_passing || '';
        document.getElementById('diplomaScore').value = diploma.percentage_or_cgpa || '';
        document.getElementById('deleteDiplomaBtn').style.display = 'inline-block';
    } else {
        document.getElementById('diplomaForm').reset();
        document.getElementById('deleteDiplomaBtn').style.display = 'none';
    }
}

function renderInternships(list) {
    const container = document.getElementById('internshipsList');
    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 2rem; text-align: center; color: var(--text-muted);">
                💼 No internships added yet. Click "+ Add New Internship" to record work experience.
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(item => `
        <div class="glass-card item-card">
            <div class="item-details">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h4>${escapeHtml(item.company)}</h4>
                    <span class="badge badge-${item.mode === 'online' ? 'online' : 'offline'}">${item.mode || 'offline'}</span>
                </div>
                <p><strong>Role:</strong> ${escapeHtml(item.role)}</p>
                <p style="font-size: 0.8rem; margin-top: 0.2rem;">
                    📅 ${item.start_date} ${item.end_date ? 'to ' + item.end_date : '(Ongoing)'}
                </p>
            </div>
            <div class="item-actions">
                <button class="btn btn-secondary btn-sm" onclick="editInternship('${item.id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteInternship('${item.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

function renderCertificates(list) {
    const container = document.getElementById('certificatesList');
    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 2rem; text-align: center; color: var(--text-muted);">
                📜 No certificates added yet. Click "+ Add New Certificate" to display your credentials.
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(item => `
        <div class="glass-card item-card">
            <div class="item-details">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h4>${escapeHtml(item.name)}</h4>
                    <span class="badge badge-${item.mode === 'offline' ? 'offline' : 'online'}">${item.mode || 'online'}</span>
                </div>
                <p><strong>Issued by:</strong> ${escapeHtml(item.issuer)}</p>
                <p style="font-size: 0.8rem; margin-top: 0.2rem;">📅 Issued Date: ${item.date}</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-secondary btn-sm" onclick="editCertificate('${item.id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCertificate('${item.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Tab Switcher
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.currentTarget.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// Profile Save Handler
async function handleProfileSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('tpo_token');

    const semObj = {};
    for (let i = 1; i <= 8; i++) {
        const val = parseFloat(document.getElementById(`sem${i}`).value);
        semObj[`sem${i}`] = isNaN(val) ? 0 : val;
    }

    const bodyData = {
        name: document.getElementById('editName').value.trim(),
        branch: document.getElementById('editBranch').value.trim(),
        class: document.getElementById('editClass').value.trim(),
        year: document.getElementById('editYear').value,
        cgpa_overall: parseFloat(document.getElementById('editOverallCgpa').value) || 0,
        cgpa_semesterwise: semObj,
        activities: document.getElementById('editActivities').value.trim()
    };

    try {
        const res = await fetch('/api/student/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(bodyData)
        });

        const json = await res.json();
        if (json.success) {
            const skillResponse = await fetch('/api/student/skills', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skills: document.getElementById('editSkills').value.split(',').map(v => v.trim()).filter(Boolean) })
            });
            if (!skillResponse.ok) throw new Error('Skills could not be saved.');
            const resume = document.getElementById('resumeFile').files[0];
            if (resume) {
                const form = new FormData();
                form.append('resume', resume);
                const resumeResponse = await fetch('/api/student/resume', { method: 'POST', body: form });
                if (!resumeResponse.ok) throw new Error(apiError(await resumeResponse.json()));
            }
            showToast('Profile updated successfully!', 'success');
            loadDashboardData();
            switchTab('overview');
        } else {
            showToast(json.error || 'Failed to update profile.', 'error');
        }
    } catch (err) {
        showToast('Error saving profile changes.', 'error');
    }
}

// Modal Controllers
function openInternshipModal(id = null) {
    document.getElementById('internshipForm').reset();
    document.getElementById('internshipId').value = id || '';
    document.getElementById('internshipModalTitle').innerText = id ? 'Edit Internship' : 'Add Internship';

    if (id && currentStudentData) {
        const item = currentStudentData.internships.find(i => i.id === id);
        if (item) {
            document.getElementById('intCompany').value = item.company;
            document.getElementById('intRole').value = item.role;
            document.getElementById('intStartDate').value = item.start_date;
            document.getElementById('intEndDate').value = item.end_date || '';
            document.getElementById('intMode').value = item.mode || 'offline';
        }
    }

    document.getElementById('internshipModal').classList.add('active');
}

function closeInternshipModal() {
    document.getElementById('internshipModal').classList.remove('active');
}

function openCertificateModal(id = null) {
    document.getElementById('certForm').reset();
    document.getElementById('certId').value = id || '';
    document.getElementById('certModalTitle').innerText = id ? 'Edit Certificate' : 'Add Certificate';

    if (id && currentStudentData) {
        const item = currentStudentData.certificates.find(c => c.id === id);
        if (item) {
            document.getElementById('certName').value = item.name;
            document.getElementById('certIssuer').value = item.issuer;
            document.getElementById('certDate').value = item.date;
            document.getElementById('certMode').value = item.mode || 'online';
        }
    }

    document.getElementById('certificateModal').classList.add('active');
}

function closeCertificateModal() {
    document.getElementById('certificateModal').classList.remove('active');
}

// Internship Form Submit
async function handleInternshipSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('tpo_token');
    const id = document.getElementById('internshipId').value;

    const payload = {
        company: document.getElementById('intCompany').value,
        role: document.getElementById('intRole').value,
        start_date: document.getElementById('intStartDate').value,
        end_date: document.getElementById('intEndDate').value || null,
        mode: document.getElementById('intMode').value
    };

    const url = id ? `/api/student/internships/${id}` : '/api/student/internships';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeInternshipModal();
            loadDashboardData();
        } else {
            showToast(json.error, 'error');
        }
    } catch (err) {
        showToast('Error saving internship.', 'error');
    }
}

function editInternship(id) {
    openInternshipModal(id);
}

async function deleteInternship(id) {
    if (!confirm('Are you sure you want to delete this internship record?')) return;
    const token = localStorage.getItem('tpo_token');
    try {
        const res = await fetch(`/api/student/internships/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadDashboardData();
        }
    } catch (err) {
        showToast('Error deleting internship.', 'error');
    }
}

// Certificate Form Submit
async function handleCertSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('tpo_token');
    const id = document.getElementById('certId').value;

    const payload = {
        name: document.getElementById('certName').value,
        issuer: document.getElementById('certIssuer').value,
        date: document.getElementById('certDate').value,
        mode: document.getElementById('certMode').value
    };

    const url = id ? `/api/student/certificates/${id}` : '/api/student/certificates';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeCertificateModal();
            loadDashboardData();
        } else {
            showToast(json.error, 'error');
        }
    } catch (err) {
        showToast('Error saving certificate.', 'error');
    }
}

function editCertificate(id) {
    openCertificateModal(id);
}

async function deleteCertificate(id) {
    if (!confirm('Are you sure you want to delete this certificate record?')) return;
    const token = localStorage.getItem('tpo_token');
    try {
        const res = await fetch(`/api/student/certificates/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadDashboardData();
        }
    } catch (err) {
        showToast('Error deleting certificate.', 'error');
    }
}

// Diploma Form Submit & Delete
async function handleDiplomaSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('tpo_token');

    const payload = {
        institute: document.getElementById('diplomaInstitute').value,
        branch: document.getElementById('diplomaBranch').value,
        year_of_passing: document.getElementById('diplomaYear').value,
        percentage_or_cgpa: document.getElementById('diplomaScore').value
    };

    try {
        const res = await fetch('/api/student/diploma', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadDashboardData();
        } else {
            showToast(json.error, 'error');
        }
    } catch (err) {
        showToast('Error saving diploma info.', 'error');
    }
}

async function deleteDiploma() {
    if (!confirm('Are you sure you want to remove your diploma information?')) return;
    const token = localStorage.getItem('tpo_token');
    try {
        const res = await fetch('/api/student/diploma', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadDashboardData();
        }
    } catch (err) {
        showToast('Error removing diploma info.', 'error');
    }
}

function handleLogout() {
    localStorage.removeItem('tpo_token');
    localStorage.removeItem('tpo_student');
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
        window.location.href = '/login';
    });
}

async function openResume() {
    const response = await fetch('/api/student/resume');
    const json = await response.json();
    if (!response.ok) return showToast(apiError(json), 'error');
    window.open(json.data.url, '_blank', 'noopener,noreferrer');
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> ${msg}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}
