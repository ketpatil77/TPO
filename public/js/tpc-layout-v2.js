(() => {
    if (!document.body.classList.contains('observer-shell')) return;

    const STUDENT_PAGE_SIZE = 12;
    const sections = () => [
        document.getElementById('observerTab-students'),
        document.getElementById('observerTab-roster')
    ].filter(Boolean);

    let frame = 0;
    let directoryRefreshTimer = 0;

    function viewportHeight() {
        return window.visualViewport?.height || window.innerHeight;
    }

    function fitSection(section) {
        if (!section?.classList.contains('active')) return;

        const desktop = window.innerWidth >= 900;
        if (!desktop || section.id === 'observerTab-students') {
            section.style.removeProperty('--tpc-active-section-height');
            section.style.removeProperty('height');
            section.dataset.tpcViewportFit = section.id === 'observerTab-students' ? 'twelve-row-natural' : 'mobile-natural';
            return;
        }

        const rect = section.getBoundingClientRect();
        const viewport = viewportHeight();
        const bottomGap = 8;
        const available = Math.floor(viewport - Math.max(0, rect.top) - bottomGap);
        const bounded = Math.max(280, Math.min(viewport - 16, available));

        section.style.setProperty('--tpc-active-section-height', `${bounded}px`);
        section.style.height = `${bounded}px`;
        section.dataset.tpcViewportFit = 'true';
    }

    function fitActive() {
        sections().forEach(fitSection);
    }

    function scheduleFit() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(fitActive);
    }

    function updateDirectoryFocus() {
        const active = document.getElementById('observerTab-students')?.classList.contains('active');
        document.body.classList.toggle('tpc-directory-focus', Boolean(active));
    }

    function observeLayoutChanges() {
        if ('ResizeObserver' in window) {
            const resizeObserver = new ResizeObserver(scheduleFit);
            const tabs = document.querySelector('.observer-tabs');
            const overview = document.querySelector('.observer-overview-disclosure');
            if (tabs) resizeObserver.observe(tabs);
            if (overview) resizeObserver.observe(overview);
            sections().forEach(section => {
                const toolbar = section.querySelector('.observer-toolbar');
                const pagination = section.querySelector('.pagination-bar');
                if (toolbar) resizeObserver.observe(toolbar);
                if (pagination) resizeObserver.observe(pagination);
            });
        }

        const overview = document.querySelector('.observer-overview-disclosure');
        if (overview && 'MutationObserver' in window) {
            new MutationObserver(scheduleFit).observe(overview, { attributes: true, attributeFilter: ['open'] });
        }
    }

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        return (parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
    }

    function completionLabel(state) {
        return ({ complete: 'Complete', strong: 'Strong', building: 'Building', attention: 'Needs attention' })[state] || 'Needs attention';
    }

    function evidenceItem(label, count, title) {
        return `<span class="tpc-evidence-item" title="${escapeHtml(title)}"><small>${label}</small><strong>${Number(count) || 0}</strong></span>`;
    }

    function renderDirectoryRow(student, index) {
        const completion = student.profile_completion || { percent: 0, state: 'attention', missing: [], missing_count: 0 };
        const percent = Math.max(0, Math.min(100, Number(completion.percent) || 0));
        const missing = Array.isArray(completion.missing) ? completion.missing : [];
        const missingText = missing.length ? `${missing.length} item${missing.length === 1 ? '' : 's'} need attention` : 'Everything resolved';
        const missingTitle = missing.length ? missing.join(', ') : 'Profile complete';
        const cgpa = Number(student.cgpa_overall || 0).toFixed(2);
        const backlogs = Number(student.active_backlogs || 0);
        const resume = student.resume_url
            ? `<a class="tpc-action-btn tpc-action-resume" href="/api/observer/students/${encodeURIComponent(student.id)}/resume/open" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(student.name)} resume">Resume</a>`
            : '<span class="tpc-resume-missing">No resume</span>';

        return `<tr class="tpc-directory-row" data-student-index="${index}">
            <td data-label="Student">
                <button class="tpc-student-open" type="button" data-open-student="${index}" aria-label="Open profile for ${escapeHtml(student.name)}">
                    <span class="tpc-student-identity"><span class="tpc-student-initials" aria-hidden="true">${escapeHtml(initials(student.name).toUpperCase())}</span><span class="tpc-student-copy"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.prn)}</small></span></span>
                    <span class="tpc-student-chevron" aria-hidden="true">›</span>
                </button>
            </td>
            <td data-label="Program"><div class="tpc-program-cell"><span class="branch-chip">${escapeHtml(student.branch)}</span><small>${escapeHtml(student.year || '—')} · ${escapeHtml(student.class || '—')}</small></div></td>
            <td data-label="Completion" class="tpc-completion-cell" title="${escapeHtml(missingTitle)}">
                <div class="tpc-completion-head"><strong>${percent}%</strong><span class="tpc-completion-state is-${escapeHtml(completion.state || 'attention')}">${completionLabel(completion.state)}</span></div>
                <div class="tpc-completion-track" role="progressbar" aria-label="Profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
                <small>${escapeHtml(missingText)}</small>
            </td>
            <td data-label="Academic"><div class="tpc-academic-cell"><strong>${cgpa}</strong><span>CGPA</span><small>${backlogs ? `${backlogs} active backlog${backlogs === 1 ? '' : 's'}` : 'No active backlogs'}</small></div></td>
            <td data-label="Evidence"><div class="tpc-evidence-strip">${evidenceItem('IN', student.internships?.length, 'Internships')}${evidenceItem('CERT', student.certificates?.length, 'Certificates')}${evidenceItem('PROJ', student.projects?.length, 'Projects')}${evidenceItem('RES', student.research_papers?.length, 'Research papers')}${evidenceItem('COMP', student.competitions?.length, 'Competitions')}</div></td>
            <td data-label="Actions"><div class="tpc-row-actions">${resume}<button class="tpc-action-btn tpc-action-profile" type="button" onclick="openObserverStudent(${index})">Profile</button></div></td>
        </tr>`;
    }

    function scrollDirectoryToTop() {
        const table = document.querySelector('#observerTab-students .table-shell');
        if (!table) return;
        const top = table.getBoundingClientRect().top + window.scrollY - 8;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    function openStudentDetail(index) {
        if (typeof window.openObserverStudent !== 'function') return;
        window.openObserverStudent(index);
        if (window.innerWidth < 900) {
            const close = document.getElementById('closeObserverModal');
            if (close) {
                close.textContent = '← Back';
                close.classList.add('tpc-mobile-back');
                close.setAttribute('aria-label', 'Back to student list');
            }
            document.getElementById('observerModal')?.classList.add('tpc-mobile-profile-view');
        }
    }

    function bindStudentOpen() {
        const body = document.getElementById('observerStudents');
        if (!body || body.dataset.studentOpenBound === 'true') return;
        body.dataset.studentOpenBound = 'true';
        body.addEventListener('click', event => {
            const button = event.target.closest('[data-open-student]');
            if (!button) return;
            openStudentDetail(Number(button.dataset.openStudent));
        });
        document.getElementById('closeObserverModal')?.addEventListener('click', () => {
            document.getElementById('observerModal')?.classList.remove('tpc-mobile-profile-view');
            const close = document.getElementById('closeObserverModal');
            if (close) {
                close.textContent = '×';
                close.classList.remove('tpc-mobile-back');
                close.setAttribute('aria-label', 'Close');
            }
        });
    }

    async function enhancedLoadStudents({ returnToTop = false } = {}) {
        if (typeof observerState === 'undefined' || typeof requestJson !== 'function') return;
        const branch = document.getElementById('observerBranch');
        const year = document.getElementById('observerYear');
        const search = document.getElementById('observerSearch');
        const body = document.getElementById('observerStudents');
        if (!branch || !year || !search || !body) return;

        const params = new URLSearchParams({
            page: observerState.studentPage,
            pageSize: STUDENT_PAGE_SIZE,
            branch: branch.value,
            year: year.value,
            search: search.value.trim()
        });

        body.dataset.tpcLoading = 'true';
        try {
            const { data } = await requestJson(`/api/observer/students?${params}`);
            observerState.students = data.students;
            body.innerHTML = data.students.length
                ? data.students.map(renderDirectoryRow).join('')
                : '<tr><td colspan="6" class="empty-cell">No profiles match current filters.</td></tr>';
            body.dataset.tpcEnhanced = 'true';
            renderPagination('studentPagination', data.page, data.totalPages, page => {
                observerState.studentPage = page;
                enhancedLoadStudents({ returnToTop: true });
            });
            scheduleFit();
            if (returnToTop) requestAnimationFrame(scrollDirectoryToTop);
        } catch (error) {
            body.innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(error.message || 'Unable to load student profiles.')}</td></tr>`;
        } finally {
            delete body.dataset.tpcLoading;
        }
    }

    function installDirectoryExperience() {
        const table = document.querySelector('#observerTab-students .observer-table');
        const body = document.getElementById('observerStudents');
        if (!table || !body || typeof observerState === 'undefined') return;

        table.classList.add('tpc-readiness-table');
        const header = table.querySelector('thead tr');
        if (header) header.innerHTML = '<th>Student</th><th>Program</th><th>Profile completion</th><th>Academic</th><th>Evidence</th><th>Actions</th>';
        bindStudentOpen();

        try { loadStudents = enhancedLoadStudents; } catch (_) { window.loadStudents = enhancedLoadStudents; }

        ['observerBranch', 'observerYear'].forEach(id => document.getElementById(id)?.addEventListener('change', () => {
            observerState.studentPage = 1;
        }, true));
        document.getElementById('observerSearch')?.addEventListener('input', () => {
            observerState.studentPage = 1;
        }, true);
        document.getElementById('refreshStudents')?.addEventListener('click', event => {
            event.stopImmediatePropagation();
            enhancedLoadStudents();
        }, true);

        if ('MutationObserver' in window) {
            new MutationObserver(() => {
                if (body.dataset.tpcLoading === 'true') return;
                if (body.children.length && !body.querySelector('.tpc-completion-cell') && !body.querySelector('.empty-cell')) {
                    clearTimeout(directoryRefreshTimer);
                    directoryRefreshTimer = setTimeout(enhancedLoadStudents, 30);
                }
            }).observe(body, { childList: true });
        }

        enhancedLoadStudents();
    }

    function boot() {
        scheduleFit();
        updateDirectoryFocus();
        observeLayoutChanges();
        installDirectoryExperience();

        document.querySelector('.observer-tabs')?.addEventListener('click', event => {
            if (event.target.closest('.tab-btn')) setTimeout(() => {
                updateDirectoryFocus();
                scheduleFit();
            }, 0);
        });

        window.addEventListener('resize', scheduleFit, { passive: true });
        window.addEventListener('orientationchange', scheduleFit, { passive: true });
        window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
        window.addEventListener('pageshow', scheduleFit, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();