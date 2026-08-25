const ENGINEERING_SKILLS = window.ENGINEERING_SKILLS || [];

function initSkillAutocomplete() {
    const input = document.getElementById('editSkills');
    if (!input) return;
    
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const dropdown = document.createElement('ul');
    dropdown.style.cssText = 'position:absolute; top:100%; left:0; width:100%; background:var(--bg-card); border:1px solid var(--border-color); border-radius:4px; max-height:200px; overflow-y:auto; z-index:1000; display:none; list-style:none; padding:0; margin:0; box-shadow:0 4px 6px rgba(0,0,0,0.1);';
    wrapper.appendChild(dropdown);

    let currentFocus = -1;

    input.addEventListener('input', function() {
        const val = this.value;
        dropdown.innerHTML = '';
        if (!val) { dropdown.style.display = 'none'; return; }
        
        const parts = val.split(',');
        const lastPart = parts[parts.length - 1].trimLeft();
        if (lastPart.length < 1) { dropdown.style.display = 'none'; return; }

        const matchLower = lastPart.toLowerCase();
        const matches = ENGINEERING_SKILLS.filter(s => s.toLowerCase().startsWith(matchLower));

        if (matches.length === 0) { dropdown.style.display = 'none'; return; }

        currentFocus = -1;
        dropdown.style.display = 'block';

        matches.forEach(match => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 8px 12px; cursor: pointer; color: var(--text-body); border-bottom: 1px solid var(--border-color); font-family: "Times New Roman", Times, serif;';
            li.innerHTML = `<strong>${match.substring(0, lastPart.length)}</strong>${match.substring(lastPart.length)}`;
            
            li.addEventListener('mouseenter', () => {
                const items = dropdown.getElementsByTagName('li');
                for (let i = 0; i < items.length; i++) items[i].style.background = 'transparent';
                li.style.background = 'var(--surface-muted)';
            });

            li.addEventListener('click', function(e) {
                e.preventDefault();
                parts[parts.length - 1] = (parts.length > 1 ? ' ' : '') + match;
                input.value = parts.join(',') + ', ';
                dropdown.style.display = 'none';
                input.focus();
            });
            dropdown.appendChild(li);
        });
    });

    input.addEventListener('keydown', function(e) {
        let items = dropdown.getElementsByTagName('li');
        if (e.keyCode === 40) {
            currentFocus++;
            addActive(items);
        } else if (e.keyCode === 38) {
            currentFocus--;
            addActive(items);
        } else if (e.keyCode === 13 && currentFocus > -1) {
            e.preventDefault();
            if (items[currentFocus]) items[currentFocus].click();
        }
    });

    function addActive(items) {
        if (!items) return false;
        for (let i = 0; i < items.length; i++) items[i].style.background = 'transparent';
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = items.length - 1;
        items[currentFocus].style.background = 'var(--surface-muted)';
        items[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    document.addEventListener('click', function(e) {
        if (e.target !== input) dropdown.style.display = 'none';
    });
}

let currentStudentData = null;
let studentNotificationCache = [];
let workflowLoaded = false;
let studentAvatarReady = false;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const impersonateToken = urlParams.get('impersonate_token');
    if (impersonateToken) {
        localStorage.setItem('tpo_token', impersonateToken);
        urlParams.delete('impersonate_token');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, document.title, newUrl);
    }

    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('profileForm').addEventListener('submit', handleProfileSubmit);
    document.getElementById('internshipForm').addEventListener('submit', handleInternshipSubmit);
    document.getElementById('certForm').addEventListener('submit', handleCertSubmit);
    document.getElementById('projectForm').addEventListener('submit', handleProjectSubmit);
    document.getElementById('researchForm').addEventListener('submit', handleResearchSubmit);
    document.getElementById('diplomaForm').addEventListener('submit', handleDiplomaSubmit);
    document.getElementById('studentAvatarFile').addEventListener('change', uploadStudentAvatar);
    document.getElementById('extractResumeSkills').addEventListener('click', extractResumeSkills);
    document.getElementById('scanAtsScore').addEventListener('click', scanAtsScore);
    initSkillAutocomplete();
    document.querySelectorAll('.sem-input').forEach(input => input.addEventListener('input', recalculateOverallCgpa));
    document.getElementById('lateralEntry').addEventListener('change', syncLateralEntryFields);
    document.getElementById('editBranch').addEventListener('change', toggleEmploymentSection);
    document.getElementById('editIsEmployed').addEventListener('change', toggleEmploymentDetails);

    loadDashboardData();
    window.setInterval(() => { if (!document.hidden) loadStudentNotifications(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStudentNotifications(); });
    if (new URLSearchParams(location.search).get('tab') === 'opportunities') {
        const tab = document.querySelector('[aria-controls="tab-opportunities"]');
        if (tab) switchTab('opportunities', tab);
    }
});

async function loadDashboardData() {
    const token = localStorage.getItem('tpo_token');
    const initialLoad = !currentStudentData;
    if (initialLoad) setDashboardLoading(true);
    try {
        const res = await fetch('/api/student/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            localStorage.removeItem('tpo_token');
            window.location.href = '/';
            return;
        }

        const json = await res.json();
        if (json.success) {
            currentStudentData = json.data;
            renderDashboard(json.data);
            loadStudentNotifications();
        } else {
            showToast(json.error || 'Failed to load profile.', 'error');
        }
    } catch (err) {
        console.error('Error loading dashboard:', err);
        showToast('Could not load profile. Refresh once or sign in again.', 'error');
    } finally {
        if (initialLoad) setDashboardLoading(false);
    }
}

async function extractResumeSkills() {
    const fileInput = document.getElementById('resumeFile');
    const panel = document.getElementById('resumeSkillSuggestions');
    const button = document.getElementById('extractResumeSkills');

    if (!fileInput.files.length) {
        showToast('Please select a PDF resume first.', 'error');
        return;
    }

    const file = fileInput.files[0];
    if (file.type !== 'application/pdf') {
        showToast('Only PDF files are supported.', 'error');
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('Resume must be smaller than 2MB.', 'error');
        return;
    }

    setButtonLoading(button, true);
    panel.hidden = false;
    panel.innerHTML = '<div class="upload-status">Scanning resume text for skills...</div>';

    try {
        const form = new FormData();
        form.append('resume', file);
        const response = await fetch('/api/student/resume/skills/extract', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(apiError(result));
        const suggestions = result.data.suggestions || [];
        panel.innerHTML = `<div class="skill-suggestion-heading"><div><strong>${suggestions.length} skills detected</strong><p>Select useful matches. Existing skills stay untouched.</p></div><button type="button" class="btn btn-primary btn-sm" onclick="addDetectedSkills()">Add selected</button></div><div class="skill-suggestion-grid">${suggestions.map((item, index) => `<label><input type="checkbox" value="${escapeHtml(item.skill)}" ${index < 20 ? 'checked' : ''}><span>${escapeHtml(item.skill)}</span><small>${escapeHtml(item.confidence)}</small></label>`).join('')}</div>`;
    } catch (error) {
        panel.innerHTML = `<div class="form-error" role="alert">${escapeHtml(error.message || 'Could not scan resume. Add skills manually.')}</div>`;
    } finally { setButtonLoading(button, false); }
}

async function scanAtsScore() {
    const fileInput = document.getElementById('resumeFile');
    const button = document.getElementById('scanAtsScore');
    const resultDiv = document.getElementById('atsAnalysisResult');
    const badge = document.getElementById('atsScoreBadge');
    const targetProfile = document.getElementById('atsTargetProfile').value;

    if (!fileInput.files.length) {
        showToast('Please select a PDF resume first.', 'error');
        return;
    }

    const file = fileInput.files[0];
    if (file.type !== 'application/pdf' || file.size > 2 * 1024 * 1024) {
        showToast('Please upload a valid PDF smaller than 2MB.', 'error');
        return;
    }

    setButtonLoading(button, true);
    resultDiv.hidden = false;
    resultDiv.innerHTML = 'Analyzing against job market profile...';
    badge.style.display = 'none';

    try {
        const form = new FormData();
        form.append('resume', file);
        form.append('profile', targetProfile);
        
        const response = await fetch('/api/student/resume/ats-score', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(apiError(result));
        
        const data = result.data;
        badge.style.display = 'inline-block';
        badge.className = `badge ${data.score >= 80 ? 'badge-success' : data.score >= 50 ? 'badge-warning' : 'badge-danger'}`;
        badge.innerText = `${data.score}% - ${data.status}`;
        
        let html = `<div style="margin-top:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
            <div><strong style="color:var(--text-body);">Matched Keywords:</strong><br>${data.matched.length ? data.matched.map(k => `<span class="badge" style="background:rgba(45,212,191,0.1);color:#2dd4bf;margin-right:4px;margin-bottom:4px;">${escapeHtml(k)}</span>`).join('') : 'None'}</div>
            <div><strong style="color:var(--text-body);">Missing Keywords:</strong><br>${data.missing.length ? data.missing.map(k => `<span class="badge" style="background:rgba(244,63,94,0.1);color:#f43f5e;margin-right:4px;margin-bottom:4px;">${escapeHtml(k)}</span>`).join('') : 'None'}</div>
        </div>`;
        resultDiv.innerHTML = html;
        
    } catch (error) {
        resultDiv.innerHTML = `<span style="color:var(--danger);">${escapeHtml(error.message || 'ATS Analysis failed.')}</span>`;
    } finally {
        setButtonLoading(button, false);
    }
}

function addDetectedSkills() {
    const input = document.getElementById('editSkills');
    const existing = input.value.split(',').map(value => value.trim()).filter(Boolean);
    const selected = [...document.querySelectorAll('#resumeSkillSuggestions input:checked')].map(node => node.value);
    const combined = [...new Map([...existing, ...selected].map(skill => [skill.toLowerCase(), skill])).values()].slice(0, 50);
    input.value = combined.join(', ');
    document.getElementById('resumeSkillSuggestions').hidden = true;
    document.getElementById('atsAnalysisResult').hidden = true;
    document.getElementById('atsScoreBadge').style.display = 'none';
    
    showToast(`${Math.max(0, combined.length - existing.length)} resume skills added. Save profile to keep them.`, 'success');
}

function setDashboardLoading(loading) {
    const root = document.getElementById('studentDashboard');
    const skeleton = document.getElementById('dashboardSkeleton');
    const content = document.getElementById('dashboardContent');
    root.setAttribute('aria-busy', String(loading));
    skeleton.hidden = !loading;
    content.hidden = loading;
}

function renderDashboard(data) {
    const { student, internships, certificates, projects = [], research_papers: researchPapers = [], diploma, skills = [] } = data;

    // 1. Header & Meta
    document.getElementById('navStudentPrn').innerText = `PRN: ${student.prn}`;
    document.getElementById('studentAvatar').innerText = student.name ? student.name.charAt(0).toUpperCase() : 'S';
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => loadStudentAvatar(), { timeout: 1000 });
    } else {
        window.setTimeout(loadStudentAvatar, 1);
    }
    document.getElementById('studentName').innerText = student.name || 'Student';
    document.getElementById('studentBranch').innerText = `Branch: ${student.branch || 'Not Set'}`;
    document.getElementById('studentClass').innerText = `Class: ${student.class || 'Not Set'}`;
    document.getElementById('studentYear').innerText = `Year: ${student.year || 'Not Set'}`;
    
    const overallCgpa = student.cgpa_overall ? parseFloat(student.cgpa_overall).toFixed(2) : '0.00';
    document.getElementById('overallCgpaBadge').innerText = `Overall CGPA: ${overallCgpa}`;

    // 2. Overview Tab
    document.getElementById('overviewCgpa').innerText = overallCgpa;
    const resumeContainer = document.getElementById('overviewResume');
    const currentResumeCard = document.getElementById('currentResumeCard');
    if (student.resume_url) {
        resumeContainer.innerHTML = '<button type="button" class="btn btn-secondary btn-sm" onclick="openResume()">View Resume</button>';
        currentResumeCard.hidden = false;
    } else {
        resumeContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Not Uploaded</span>`;
        currentResumeCard.hidden = true;
    }

    renderOverviewProfile(student.activities, { internships: internships.length, certificates: certificates.length, projects: projects.length, research: researchPapers.length, skills: skills.length });

    // Semester Breakdown Grid
    const semGrid = document.getElementById('semestersGrid');
    const sems = student.cgpa_semesterwise || {};
    const completedSemesters = Object.values(sems).filter(value => Number(value) > 0).length;
    const backlogCount = Object.values(student.backlogs_semesterwise || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    document.getElementById('completedSemesterCount').textContent = `${completedSemesters} / 8`;
    document.getElementById('overviewBacklogCount').textContent = backlogCount;
    const semesterCards = [];
    for (let i = 1; i <= 8; i++) {
        const key = `sem${i}`;
        const val = sems[key] ? parseFloat(sems[key]).toFixed(2) : '--';
        semesterCards.push(`<div class="semester-score ${val === '--' ? 'is-pending' : ''}"><span>Semester ${i}</span><strong>${val}</strong></div>`);
    }
    semGrid.innerHTML = semesterCards.join('');

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
    document.getElementById('editSscMarks').value = student.ssc_marks !== null && student.ssc_marks !== undefined ? student.ssc_marks : '';
    document.getElementById('editHscMarks').value = student.hsc_marks !== null && student.hsc_marks !== undefined ? student.hsc_marks : '';
    
    const empSection = document.getElementById('employmentSection');
    if (['EE', 'ME', 'CE'].includes(student.branch)) {
        empSection.style.display = 'block';
        document.getElementById('editIsEmployed').value = student.is_employed ? 'true' : 'false';
        if (student.is_employed) {
            document.getElementById('editEmpType').value = student.employment_type || 'Private';
            document.getElementById('editOrgType').value = student.org_type || 'Startup';
            document.getElementById('editEmpCompany').value = student.company_name || '';
            document.getElementById('editCompanyAddress').value = student.company_address || '';
            document.getElementById('editCurrentCtc').value = student.current_ctc || '';
            document.getElementById('editEmpHrName').value = student.hr_name || '';
            document.getElementById('editEmpHrNumber').value = student.hr_number || '';
        }
        toggleEmploymentDetails();
    } else {
        empSection.style.display = 'none';
    }

    toggleEmploymentSection();
    toggleEmploymentDetails();
    document.getElementById('editEmail').value = student.email || '';
    document.getElementById('editPhone').value = student.phone || '';
    studentAvatarReady = Boolean(student.avatar_path);
    updateAvatarRequirement();
    const backlogSems = student.backlogs_semesterwise || {};
    for (let i = 1; i <= 8; i++) document.getElementById(`backlogSem${i}`).value = Number(backlogSems[`sem${i}`]) || 0;
    document.getElementById('editSkills').value = skills.map(item => item.skill).join(', ');
    document.getElementById('editActivities').value = student.activities || '';

    for (let i = 1; i <= 8; i++) {
        const semInput = document.getElementById(`sem${i}`);
        if (semInput) {
            semInput.value = Number(sems[`sem${i}`]) > 0 ? sems[`sem${i}`] : '';
        }
    }
    document.getElementById('lateralEntry').checked = Boolean(student.lateral_entry || diploma);
    syncLateralEntryFields();
    recalculateOverallCgpa();

    // 4. Internships Tab
    document.getElementById('internshipCount').innerText = internships.length;
    renderInternships(internships);

    // 5. Certificates Tab
    document.getElementById('certCount').innerText = certificates.length;
    renderCertificates(certificates);

    document.getElementById('projectCount').innerText = projects.length;
    renderProjects(projects);
    document.getElementById('researchCount').innerText = researchPapers.length;
    renderResearchPapers(researchPapers);

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

async function loadStudentAvatar() {
    try {
        const response = await fetch('/api/student/avatar');
        if (!response.ok) return;
        const result = await response.json();
        applyStudentAvatar(result.data?.url || null);
    } catch (_) { /* Initials remain as fallback. */ }
}

async function uploadStudentAvatar() {
    const input = document.getElementById('studentAvatarFile');
    const file = input.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { showToast('Use JPG, JPEG, or PNG only.', 'error'); input.value = ''; return; }
    if (file.size >= 1024 * 1024) { showToast('Profile picture must be under 1 MB.', 'error'); input.value = ''; return; }
    const form = new FormData();
    form.append('avatar', file);
    try {
        const response = await fetch('/api/student/avatar', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || result.error || 'Upload failed.');
        studentAvatarReady = true;
        applyStudentAvatar(result.data.url);
        updateAvatarRequirement();
        showToast('Profile picture updated.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { input.value = ''; }
}

async function removeStudentAvatar() {
    try {
        const response = await fetch('/api/student/avatar', { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || result.error || 'Remove failed.');
        applyStudentAvatar(null);
        showToast('Profile picture removed.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
}

function applyStudentAvatar(url) {
    const header = document.getElementById('studentAvatar');
    const preview = document.getElementById('studentAvatarPreview');
    const requestId = `${Date.now()}-${Math.random()}`;
    header.dataset.avatarRequest = requestId;
    header.style.backgroundImage = '';
    header.classList.remove('has-image');
    preview.removeAttribute('src');
    if (url) {
        const probe = new Image();
        probe.onload = () => {
            if (header.dataset.avatarRequest !== requestId) return;
            header.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
            header.classList.add('has-image');
            preview.src = url;
        };
        probe.onerror = () => {
            if (header.dataset.avatarRequest !== requestId) return;
            header.style.backgroundImage = '';
            header.classList.remove('has-image');
            preview.removeAttribute('src');
        };
        probe.src = url;
    }
}

function updateAvatarRequirement() {
    const field = document.getElementById('profileAvatarField');
    const status = document.getElementById('studentAvatarRequirement');
    field?.classList.toggle('is-missing-required', !studentAvatarReady);
    if (status) {
        status.textContent = studentAvatarReady ? 'Picture added' : 'Picture required';
        status.classList.toggle('is-complete', studentAvatarReady);
    }
}

function syncLateralEntryFields() {
    const checked = document.getElementById('lateralEntry').checked;
    for (const id of ['sem1', 'sem2']) {
        const input = document.getElementById(id);
        if (!input) continue;
        if (checked) input.value = '0';
        input.disabled = checked;
        input.setAttribute('aria-disabled', String(checked));
        input.closest('div')?.classList.toggle('semester-locked', checked);
    }
    recalculateOverallCgpa();
}

function toggleEmploymentSection() {
    const branch = document.getElementById('editBranch').value;
    const section = document.getElementById('employmentSection');
    const isVisible = ['EE', 'ME', 'CE'].includes(branch);
    section.style.display = isVisible ? 'block' : 'none';
    if (!isVisible) {
        document.getElementById('editIsEmployed').value = 'false';
        toggleEmploymentDetails();
    }
}

function toggleEmploymentDetails() {
    const isEmployed = document.getElementById('editIsEmployed').value === 'true';
    const detailsDiv = document.getElementById('employmentDetails');
    const typeSelect = document.getElementById('editEmpType');
    const orgTypeSelect = document.getElementById('editOrgType');
    const companyInput = document.getElementById('editEmpCompany');
    const addressInput = document.getElementById('editCompanyAddress');
    
    if (isEmployed) {
        detailsDiv.style.display = 'block';
        typeSelect.required = true;
        orgTypeSelect.required = true;
        companyInput.required = true;
        addressInput.required = true;
    } else {
        detailsDiv.style.display = 'none';
        typeSelect.required = false;
        orgTypeSelect.required = false;
        companyInput.required = false;
        addressInput.required = false;
        typeSelect.value = 'Private';
        orgTypeSelect.value = 'Startup';
        companyInput.value = '';
        addressInput.value = '';
        document.getElementById('editCurrentCtc').value = '';
        document.getElementById('editEmpHrName').value = '';
        document.getElementById('editEmpHrNumber').value = '';
    }
}

function renderOverviewProfile(activities, counts) {
    const text = String(activities || '').trim();
    const container = document.getElementById('overviewActivities');
    const toggle = document.getElementById('overviewActivitiesToggle');
    const cleanText = text.replace(/\s*(LinkedIn|GitHub|Portfolio):\s*https?:\/\/\S+/gi, '').replace(/\s*\|\s*/g, ' ').trim();
    container.textContent = cleanText || 'No highlights recorded yet. Add achievements from Profile and CGPA.';
    const shouldCollapse = cleanText.length > 360;
    container.classList.toggle('is-collapsed', shouldCollapse);
    container.classList.remove('is-expanded');
    toggle.hidden = !shouldCollapse;
    toggle.textContent = 'Show full highlights';
    toggle.setAttribute('aria-expanded', 'false');
    document.getElementById('overviewInternshipCount').textContent = counts.internships;
    document.getElementById('overviewCertificateCount').textContent = counts.certificates;
    document.getElementById('overviewProjectCount').textContent = counts.projects;
    document.getElementById('overviewResearchCount').textContent = counts.research;
    document.getElementById('overviewSkillCount').textContent = counts.skills;
    const links = [...text.matchAll(/(LinkedIn|GitHub|Portfolio):\s*(https?:\/\/[^\s|]+)/gi)];
    document.getElementById('overviewProfileLinks').innerHTML = links.map(match => `<a class="btn btn-secondary btn-sm" href="${escapeHtml(match[2])}" target="_blank" rel="noopener">${escapeHtml(match[1])}</a>`).join('');
}

function toggleOverviewActivities() {
    const container = document.getElementById('overviewActivities');
    const toggle = document.getElementById('overviewActivitiesToggle');
    const expanded = container.classList.toggle('is-expanded');
    container.classList.toggle('is-collapsed', !expanded);
    toggle.textContent = expanded ? 'Show less' : 'Show full highlights';
    toggle.setAttribute('aria-expanded', String(expanded));
}

function renderInternships(list) {
    const container = document.getElementById('internshipsList');
    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 2rem; text-align: center; color: var(--text-muted);">
                No internships added yet. Select "Add New Internship" to record work experience.
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
                <button class="btn btn-secondary btn-sm" onclick="editInternship('${item.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteInternship('${item.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function renderCertificates(list) {
    const container = document.getElementById('certificatesList');
    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 2rem; text-align: center; color: var(--text-muted);">
                No certificates added yet. Select "Add New Certificate" to display your credentials.
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
                <button class="btn btn-secondary btn-sm" onclick="editCertificate('${item.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCertificate('${item.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function renderProjects(list) {
    const container = document.getElementById('projectsList');
    if (!list?.length) {
        container.innerHTML = '<div class="panel-empty project-empty"><strong>No projects yet</strong><p>Add practical work, outcomes, and links recruiters can explore.</p></div>';
        return;
    }
    container.innerHTML = list.map(project => {
        const technologies = String(project.technologies || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 8);
        const links = [
            project.project_url ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(project.project_url)}" target="_blank" rel="noopener">View project</a>` : '',
            project.repository_url ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(project.repository_url)}" target="_blank" rel="noopener">Repository</a>` : ''
        ].join('');
        return `<article class="glass-card project-card"><div class="project-card-head"><div><span class="eyebrow">${project.completed_on ? formatDate(project.completed_on) : 'Student project'}</span><h3>${escapeHtml(project.title)}</h3></div><div class="item-actions"><button class="btn btn-secondary btn-sm" onclick="openProjectModal('${project.id}')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteProject('${project.id}')">Delete</button></div></div><p>${escapeHtml(project.summary)}</p>${technologies.length ? `<div class="project-tags">${technologies.map(item => `<span class="project-tag">${escapeHtml(item)}</span>`).join('')}</div>` : ''}<div class="project-links">${links}</div></article>`;
    }).join('');
}

function renderResearchPapers(list) {
    const container = document.getElementById('researchList');
    if (!list.length) {
        container.innerHTML = '<div class="panel-empty project-empty"><strong>No research papers yet</strong><p>Add published work only. Include journal or conference and a verifiable link when available.</p></div>';
        return;
    }
    container.innerHTML = list.map(paper => {
        const links = [
            paper.doi_url ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(paper.doi_url)}" target="_blank" rel="noopener">Open DOI</a>` : '',
            paper.paper_url ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(paper.paper_url)}" target="_blank" rel="noopener">View paper</a>` : ''
        ].join('');
        return `<article class="glass-card project-card research-card"><div class="project-card-head"><div><span class="eyebrow">${formatDate(paper.published_on)}</span><h3>${escapeHtml(paper.title)}</h3></div><div class="item-actions"><button class="btn btn-secondary btn-sm" onclick="openResearchModal('${paper.id}')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteResearchPaper('${paper.id}')">Delete</button></div></div><p class="research-publication"><strong>${escapeHtml(paper.publication)}</strong><br>${escapeHtml(paper.authors)}</p><p>${escapeHtml(paper.abstract)}</p><div class="project-links">${links}</div></article>`;
    }).join('');
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// Tab Switcher
function switchTab(tabId, trigger) {
    document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn === trigger);
        btn.setAttribute('aria-selected', String(btn === trigger));
    });
    document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === `tab-${tabId}`));
    if (tabId === 'opportunities' && !workflowLoaded) loadStudentWorkflow();
}

async function loadStudentWorkflow() {
    setWorkflowLoading(true);
    try {
        const [opportunities, notifications, corrections] = await Promise.all([fetch('/api/student/workflow/opportunities').then(r=>r.json()),fetch('/api/student/workflow/notifications').then(r=>r.json()),fetch('/api/student/workflow/corrections').then(r=>r.json())]);
        document.getElementById('studentOpportunities').innerHTML = opportunities.data.length ? opportunities.data.map(item => `<article class="workflow-card opportunity-record"><div class="workflow-card-head"><div><strong>${escapeHtml(item.company)}</strong><p>${escapeHtml(item.role)}</p></div><span class="status-pill ${item.eligibility.eligible?'status-positive':'status-negative'}">${item.eligibility.eligible?'Eligible':'Not eligible'}</span></div><div class="drive-match-line"><span>Profile match</span><strong>${item.eligibility.score ?? 0}%</strong></div>${item.eligibility.reasons?.length?`<p class="record-reason">${escapeHtml(item.eligibility.reasons.join(' '))}</p>`:''}<div class="workflow-actions">${item.application?`<span class="branch-chip">Application: ${escapeHtml(item.application.status)}</span>`:item.eligibility.eligible&&item.status==='open'?`<button class="btn btn-primary btn-sm" onclick="applyToDrive('${item.id}')">Apply now</button>`:'<span class="record-muted">No action available</span>'}</div></article>`).join('') : '<div class="panel-empty"><strong>No active drives</strong><p>Matching placement opportunities will appear here.</p></div>';
        studentNotificationCache = notifications.data || [];
        const unread = notifications.unread || 0;
        document.getElementById('notificationUnread').textContent=`${unread} unread`;
        const navUnread = document.getElementById('navNotificationUnread');
        navUnread.textContent = unread;
        navUnread.hidden = unread === 0;
        const bellCount = document.getElementById('bellUnreadCount');
        bellCount.textContent = unread > 99 ? '99+' : unread;
        bellCount.hidden = unread === 0;
        document.getElementById('notificationCenterUnread').textContent = `${unread} unread`;
        renderNotificationCenter();
        document.getElementById('studentCorrections').innerHTML = corrections.data.filter(item=>item.status==='open').length ? corrections.data.filter(item=>item.status==='open').map(item => `<div class="workflow-card correction-record"><span class="record-kicker">Update required</span><strong>${escapeHtml(item.field_name)}</strong><p>${escapeHtml(item.message)}</p><button class="btn btn-primary btn-sm" onclick="resolveCorrection('${item.id}')">I have corrected this</button></div>`).join('') : '<div class="panel-empty panel-empty-success"><strong>Profile clear</strong><p>No corrections requested by placement staff.</p></div>';
        const summary=await fetch('/api/student/advanced/summary').then(r=>r.json()); const d=summary.data;
        document.getElementById('profileCompletionPanel').innerHTML=`<div class="completion-row"><div><span class="eyebrow">Profile readiness</span><h3>${d.completion.missing.length?'Complete missing information':'Placement profile ready'}</h3><p>${escapeHtml(d.completion.missing.join(', ')||'All essential sections completed.')}</p></div><strong class="completion-score">${d.completion.score}%</strong></div><div class="progress-track"><span style="width:${d.completion.score}%"></span></div><p>Resume quality: <strong>${d.resumeReview.score}%</strong> · ${escapeHtml(d.resumeReview.issues.join(', ')||'No basic issues found.')}</p>`;
        document.getElementById('studentSchedule').innerHTML=[...d.interviews.map(x=>({t:'Interview',p:new Date(x.starts_at).toLocaleString()+' · '+(x.venue||'Online')})),...d.events.map(x=>({t:x.title,p:new Date(x.starts_at).toLocaleString()+' · '+(x.location||'')}))].map(x=>`<div class="workflow-card timeline-record"><span class="record-kicker">Scheduled</span><strong>${escapeHtml(x.t)}</strong><p>${escapeHtml(x.p)}</p></div>`).join('')||'<div class="panel-empty"><strong>Nothing scheduled</strong><p>Interviews and placement events will appear here.</p></div>';
        document.getElementById('studentCareerRecords').innerHTML=[...d.assessments.map(x=>({t:x.title,p:`${x.type} · ${x.score??'—'}/${x.max_score??'—'}`})),...d.offers.map(x=>({t:`${x.company} · ${x.role}`,p:`${x.status} · ${x.package_lpa||0} LPA`}))].map(x=>`<div class="workflow-card career-record"><span class="record-kicker">Progress update</span><strong>${escapeHtml(x.t)}</strong><p>${escapeHtml(x.p)}</p></div>`).join('')||'<div class="panel-empty"><strong>No records yet</strong><p>Training results and offers will appear here.</p></div>';
        workflowLoaded = true;
    } catch (error) { showToast(error.message || 'Could not load placement workflow.','error'); }
    finally { setWorkflowLoading(false); }
}

function setWorkflowLoading(loading) {
    if (!loading || workflowLoaded) return;
    ['studentOpportunities', 'studentCorrections', 'studentSchedule', 'studentCareerRecords'].forEach(id => {
        document.getElementById(id).innerHTML = '<div class="skeleton-stack"><span></span><span></span><span></span></div>';
    });
}
async function loadStudentNotifications() {
    try {
        const response = await fetch('/api/student/workflow/notifications');
        const notifications = await response.json();
        if (!response.ok) throw new Error(apiError(notifications));
        studentNotificationCache = notifications.data || [];
        const unread = notifications.unread || 0;
        const opportunityBadge = document.getElementById('notificationUnread');
        if (opportunityBadge) opportunityBadge.textContent = `${unread} unread`;
        const navUnread = document.getElementById('navNotificationUnread');
        navUnread.textContent = unread;
        navUnread.hidden = unread === 0;
        const bellCount = document.getElementById('bellUnreadCount');
        bellCount.textContent = unread > 99 ? '99+' : unread;
        bellCount.hidden = unread === 0;
        document.getElementById('notificationCenterUnread').textContent = `${unread} unread`;
        renderNotificationCenter();
    } catch (error) { showToast(error.message || 'Could not load notifications.', 'error'); }
}
async function applyToDrive(id){const response=await fetch(`/api/student/workflow/opportunities/${id}/apply`,{method:'POST'});const json=await response.json();showToast(response.ok?'Application submitted.':apiError(json),response.ok?'success':'error');if(response.ok)loadStudentWorkflow();}
async function resolveCorrection(id){const response=await fetch(`/api/student/workflow/corrections/${id}/resolve`,{method:'PUT'});const json=await response.json();showToast(response.ok?'Correction marked resolved.':apiError(json),response.ok?'success':'error');if(response.ok)loadStudentWorkflow();}
async function markNotificationRead(id){const response=await fetch(`/api/student/workflow/notifications/${id}/read`,{method:'PUT'});const data=await response.json();if(!response.ok){showToast(apiError(data),'error');return;}await loadStudentNotifications();}
function renderNotificationCenter() {
    const box = document.getElementById('studentNotifications');
    box.innerHTML = studentNotificationCache.length ? studentNotificationCache.map(item => `<article class="notification-item ${item.read?'':'notification-unread'}"><div class="notification-item-head"><div><span class="notification-priority ${item.priority==='important'?'important':''}">${item.priority==='important'?'Important':'Update'}</span><h4>${escapeHtml(item.title)}</h4></div><time>${new Date(item.created_at).toLocaleString()}</time></div><p>${escapeHtml(item.message)}</p><div class="workflow-actions">${item.action_url?`<button class="btn btn-primary btn-sm" onclick="openNotificationAction('${item.id}')">Open</button>`:''}${item.read?'':`<button class="btn btn-secondary btn-sm" onclick="markNotificationRead('${item.id}')">Mark read</button>`}</div></article>`).join('') : '<div class="notification-empty"><strong>All caught up</strong><p>No notifications from Training and Placement Cell.</p></div>';
}
function openNotificationCenter(){const modal=document.getElementById('notificationCenterModal');modal.classList.add('active');renderNotificationCenter();loadStudentNotifications();modal.querySelector('.close-btn').focus();}
function closeNotificationCenter(){document.getElementById('notificationCenterModal').classList.remove('active');document.getElementById('notificationBell').focus();}
async function markAllNotificationsRead(){const button=document.querySelector('.notification-center-toolbar button');setButtonLoading(button,true,'Marking read');try{const response=await fetch('/api/student/workflow/notifications/read-all',{method:'PUT'});const data=await response.json();if(!response.ok)throw new Error(apiError(data));await loadStudentNotifications();showToast('Notifications marked read.','success');}catch(error){showToast(error.message,'error');}finally{setButtonLoading(button,false);}}
async function openNotificationAction(id) {
    const item = studentNotificationCache.find(row => row.id === id);
    if (!item) return;
    if (!item.read) await fetch(`/api/student/workflow/notifications/${id}/read`, { method:'PUT' });
    const raw = String(item.action_url || '').trim();
    if (!raw) return closeNotificationCenter();
    try {
        const target = new URL(raw, location.origin);
        if (target.origin === location.origin) {
            if (['/','/login','/admin/login','/observer/login'].includes(target.pathname)) target.href = `${location.origin}/dashboard?tab=opportunities`;
            location.assign(target.href);
        } else {
            window.open(target.href, '_blank', 'noopener');
            closeNotificationCenter();
            loadStudentWorkflow();
        }
    } catch { showToast('Notification link is invalid.', 'error'); }
}

// Profile Save Handler
async function handleProfileSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('tpo_token');
    const submitButton = e.currentTarget.querySelector('button[type="submit"]');
    const uploadStatus = document.getElementById('resumeUploadStatus');
    const originalLabel = submitButton.textContent;

    if (!e.currentTarget.reportValidity()) return;
    if (!studentAvatarReady) {
        updateAvatarRequirement();
        document.getElementById('profileAvatarField').scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Profile picture is required.', 'error');
        return;
    }

    const skills = document.getElementById('editSkills').value
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

    if (skills.length > 50) {
        showToast('Add no more than 50 skills.', 'error');
        return;
    }
    if (skills.some(skill => skill.length > 60)) {
        showToast('Each skill must be 60 characters or fewer.', 'error');
        return;
    }

    const semObj = {};
    for (let i = 1; i <= 8; i++) {
        const raw = document.getElementById(`sem${i}`).value.trim();
        if (raw !== '') semObj[`sem${i}`] = Number(raw);
    }

    const isEmployed = document.getElementById('editIsEmployed').value === 'true';
    const bodyData = {
        name: document.getElementById('editName').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        phone: document.getElementById('editPhone').value.trim(),
        branch: document.getElementById('editBranch').value,
        year: document.getElementById('editYear').value,
        ssc_marks: document.getElementById('editSscMarks').value,
        hsc_marks: document.getElementById('editHscMarks').value,
        is_employed: isEmployed,
        employment_type: isEmployed ? document.getElementById('editEmpType').value : undefined,
        org_type: isEmployed ? document.getElementById('editOrgType').value : undefined,
        company_name: isEmployed ? document.getElementById('editEmpCompany').value.trim() : undefined,
        company_address: isEmployed ? document.getElementById('editCompanyAddress').value.trim() : undefined,
        current_ctc: isEmployed && document.getElementById('editCurrentCtc').value ? document.getElementById('editCurrentCtc').value : undefined,
        hr_name: isEmployed ? document.getElementById('editEmpHrName').value.trim() : undefined,
        hr_number: isEmployed ? document.getElementById('editEmpHrNumber').value.trim() : undefined,
        cgpa_overall: parseFloat(document.getElementById('editOverallCgpa').value) || 0,
        cgpa_semesterwise: semObj,
        backlogs_semesterwise: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`sem${index + 1}`, Number(document.getElementById(`backlogSem${index + 1}`).value) || 0])),
        activities: document.getElementById('editActivities').value.trim(),
        lateral_entry: document.getElementById('lateralEntry').checked,
        complete_profile: true
    };

    submitButton.disabled = true;
    submitButton.classList.add('is-loading');
    submitButton.textContent = 'Saving profile';
    uploadStatus.className = 'upload-status is-working';
    uploadStatus.textContent = 'Saving profile details…';
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
            submitButton.textContent = 'Saving skills';
            uploadStatus.textContent = 'Saving skills…';
            const skillResponse = await fetch('/api/student/skills', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ skills })
            });
            if (!skillResponse.ok) throw new Error(apiError(await skillResponse.json()));
            const resume = document.getElementById('resumeFile').files[0];
            if (resume) {
                if (resume.size > 2 * 1024 * 1024) throw new Error('Resume PDF must be 2 MB or smaller.');
                submitButton.textContent = 'Uploading resume';
                uploadStatus.textContent = `Uploading ${resume.name}…`;
                const form = new FormData();
                form.append('resume', resume);
                const resumeResponse = await fetch('/api/student/resume', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: form
                });
                if (!resumeResponse.ok) throw new Error(apiError(await resumeResponse.json()));
                document.getElementById('resumeFile').value = '';
                document.getElementById('currentResumeCard').hidden = false;
            }
            uploadStatus.className = 'upload-status is-success';
            uploadStatus.textContent = resume ? 'Resume uploaded and profile saved.' : 'Profile changes saved.';
            showToast('Profile updated successfully!', 'success');
            loadDashboardData();
            switchTab('overview');
        } else {
            showToast(json.error || 'Failed to update profile.', 'error');
        }
    } catch (err) {
        uploadStatus.className = 'upload-status is-error';
        uploadStatus.textContent = `${err?.message || 'Save failed.'} Check file and try again.`;
        showToast(err?.message || 'Error saving profile changes.', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('is-loading');
        submitButton.textContent = originalLabel;
    }
}

function recalculateOverallCgpa() {
    const scores = [...document.querySelectorAll('.sem-input')].map(input => Number(input.value)).filter(value => Number.isFinite(value) && value > 0);
    const overall = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
    document.getElementById('editOverallCgpa').value = scores.length ? overall.toFixed(2) : '';
    document.getElementById('overallCgpaHint').textContent = scores.length ? `Calculated from ${scores.length} semester${scores.length === 1 ? '' : 's'}.` : 'Enter semester CGPAs to calculate overall CGPA.';
    return overall;
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

function openProjectModal(id = null) {
    const form = document.getElementById('projectForm');
    form.reset();
    document.getElementById('projectId').value = id || '';
    document.getElementById('projectModalTitle').textContent = id ? 'Edit project' : 'Add project';
    if (id && currentStudentData) {
        const project = (currentStudentData.projects || []).find(item => item.id === id);
        if (project) {
            document.getElementById('projectTitle').value = project.title || '';
            document.getElementById('projectSummary').value = project.summary || '';
            document.getElementById('projectTechnologies').value = project.technologies || '';
            document.getElementById('projectUrl').value = project.project_url || '';
            document.getElementById('projectRepositoryUrl').value = project.repository_url || '';
            document.getElementById('projectCompletedOn').value = project.completed_on || '';
        }
    }
    document.getElementById('projectModal').classList.add('active');
    document.getElementById('projectTitle').focus();
}

function closeProjectModal() { document.getElementById('projectModal').classList.remove('active'); }

function openResearchModal(id = null) {
    document.getElementById('researchForm').reset();
    document.getElementById('researchId').value = id || '';
    document.getElementById('researchModalTitle').textContent = id ? 'Edit research paper' : 'Add research paper';
    if (id) {
        const paper = (currentStudentData.research_papers || []).find(item => item.id === id);
        if (paper) {
            document.getElementById('researchTitle').value = paper.title || '';
            document.getElementById('researchAuthors').value = paper.authors || '';
            document.getElementById('researchPublication').value = paper.publication || '';
            document.getElementById('researchPublishedOn').value = paper.published_on || '';
            document.getElementById('researchAbstract').value = paper.abstract || '';
            document.getElementById('researchDoiUrl').value = paper.doi_url || '';
            document.getElementById('researchPaperUrl').value = paper.paper_url || '';
        }
    }
    document.getElementById('researchModal').classList.add('active');
    document.getElementById('researchTitle').focus();
}
function closeResearchModal() { document.getElementById('researchModal').classList.remove('active'); }

async function handleResearchSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('researchId').value;
    const button = event.submitter;
    const payload = { title: document.getElementById('researchTitle').value.trim(), authors: document.getElementById('researchAuthors').value.trim(), publication: document.getElementById('researchPublication').value.trim(), published_on: document.getElementById('researchPublishedOn').value, abstract: document.getElementById('researchAbstract').value.trim(), doi_url: document.getElementById('researchDoiUrl').value.trim(), paper_url: document.getElementById('researchPaperUrl').value.trim() };
    setButtonLoading(button, true, 'Saving paper');
    try {
        const response = await fetch(id ? `/api/student/research-papers/${id}` : '/api/student/research-papers', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || result.error || 'Could not save research paper.');
        closeResearchModal(); await loadDashboardData(); showToast(result.message, 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { setButtonLoading(button, false); }
}

async function deleteResearchPaper(id) {
    if (!confirm('Delete this research paper from your profile?')) return;
    const response = await fetch(`/api/student/research-papers/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) return showToast(result.error?.message || result.error || 'Could not delete research paper.', 'error');
    await loadDashboardData(); showToast(result.message, 'success');
}

async function handleProjectSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('projectId').value;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const payload = {
        title: document.getElementById('projectTitle').value.trim(),
        summary: document.getElementById('projectSummary').value.trim(),
        technologies: document.getElementById('projectTechnologies').value.trim(),
        project_url: document.getElementById('projectUrl').value.trim(),
        repository_url: document.getElementById('projectRepositoryUrl').value.trim(),
        completed_on: document.getElementById('projectCompletedOn').value
    };
    setButtonLoading(button, true, 'Saving project');
    try {
        const response = await fetch(id ? `/api/student/projects/${id}` : '/api/student/projects', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(apiError(result));
        closeProjectModal();
        showToast(result.message, 'success');
        await loadDashboardData();
    } catch (error) { showToast(error.message || 'Could not save project.', 'error'); }
    finally { setButtonLoading(button, false); }
}

async function deleteProject(id) {
    if (!confirm('Delete this project from your profile?')) return;
    const response = await fetch(`/api/student/projects/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) return showToast(apiError(result), 'error');
    showToast(result.message, 'success');
    loadDashboardData();
}

function setButtonLoading(button, loading, label = 'Saving') {
    if (!button) return;
    if (loading) {
        button.dataset.label = button.textContent;
        button.disabled = true;
        button.classList.add('is-loading');
        button.textContent = label;
    } else {
        button.disabled = false;
        button.classList.remove('is-loading');
        button.textContent = button.dataset.label || button.textContent;
    }
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
    const button = e.currentTarget.querySelector('button[type="submit"]');
    setButtonLoading(button, true, 'Saving certificate');

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
        if (res.ok && json.success) {
            showToast(json.message, 'success');
            closeCertificateModal();
            loadDashboardData();
        } else {
            showToast(apiError(json), 'error');
        }
    } catch (err) {
        showToast(err.message || 'Error saving certificate.', 'error');
    } finally {
        setButtonLoading(button, false);
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
        window.location.href = '/';
    });
}

async function openResume() {
    const token = localStorage.getItem('tpo_token');
    const response = await fetch('/api/student/resume', { headers: { 'Authorization': `Bearer ${token}` } });
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
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// --- Job Board ---

async function loadJobBoard() {
    const grid = document.getElementById('jobBoardGrid');
    grid.innerHTML = '<div style="color:var(--text-muted);">Loading drives...</div>';
    
    try {
        const res = await fetch('/api/student/drives');
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to load drives');
        
        if (json.data.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">No active placement drives right now.</div>';
            return;
        }
        
        grid.innerHTML = json.data.map(drive => `
            <div class="glass-card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
                <div>
                    <h3 style="margin:0; font-size:1.25rem;">${escapeHtml(drive.company)}</h3>
                    <div style="color:var(--text-muted); font-size:0.9rem;">${escapeHtml(drive.role)}</div>
                </div>
                <div style="font-size:0.85rem; color:var(--text-body); flex: 1;">
                    ${escapeHtml(drive.jd_text).substring(0, 150)}${drive.jd_text.length > 150 ? '...' : ''}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.8rem; color:var(--text-muted);">Deadline: ${drive.application_deadline ? escapeHtml(drive.application_deadline) : 'N/A'}</span>
                    ${drive.applied ? 
                        `<span class="badge badge-success">Applied</span>` : 
                        `<button class="btn btn-primary btn-sm" onclick="applyForDrive('${drive.id}')">Apply Now</button>`
                    }
                </div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = `<div style="color:var(--danger);">${escapeHtml(err.message)}</div>`;
    }
}

async function applyForDrive(driveId) {
    if (!confirm('Are you sure you want to apply for this drive?')) return;
    
    try {
        const res = await fetch(`/api/student/drives/${driveId}/apply`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to apply');
        
        showToast('Successfully applied to drive!', 'success');
        loadJobBoard();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// --- Alumni Network ---

async function loadAlumniNetwork() {
    const grid = document.getElementById('alumniGrid');
    grid.innerHTML = '<div style="color:var(--text-muted);">Loading alumni...</div>';
    
    try {
        const res = await fetch('/api/student/alumni');
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to load alumni');
        
        if (json.data.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">No alumni records found.</div>';
            return;
        }
        
        grid.innerHTML = json.data.map(alumni => `
            <div class="glass-card" style="padding: 1.5rem; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.5rem;">
                <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; color: #fff;">
                    ${escapeHtml(alumni.name.charAt(0))}
                </div>
                <h3 style="margin:0; font-size:1.1rem;">${escapeHtml(alumni.name)}</h3>
                <span class="badge" style="background: rgba(255,255,255,0.1);">${escapeHtml(alumni.branch)}</span>
                <div style="font-size:0.9rem; color:var(--text-body); margin-top:0.5rem;">
                    <strong>${escapeHtml(alumni.company)}</strong><br>
                    ${escapeHtml(alumni.role)}
                </div>
                ${alumni.linkedin ? `<a href="${escapeHtml(alumni.linkedin)}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top: 1rem; width: 100%;">LinkedIn</a>` : ''}
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = `<div style="color:var(--danger);">${escapeHtml(err.message)}</div>`;
    }
}

function apiError(result) {
    return result?.error?.message || result?.error || result?.message || 'Request failed.';
}
