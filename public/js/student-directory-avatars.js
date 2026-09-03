(() => {
    const isAdmin = document.body.classList.contains('admin-dashboard-page');
    const isObserver = document.body.classList.contains('observer-shell');
    if (!isAdmin && !isObserver) return;

    const endpointFor = student => `${isAdmin ? '/api/admin/student-avatars/' : '/api/observer/student-avatars/'}${encodeURIComponent(student.id)}`;

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        return `${parts[0]?.[0] || '?'}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
    }

    function buildAvatar(student, className = 'directory-student-avatar') {
        const holder = document.createElement('span');
        holder.className = className;
        holder.setAttribute('aria-hidden', 'true');
        const fallback = document.createElement('span');
        fallback.className = 'directory-student-avatar-fallback';
        fallback.textContent = initials(student?.name);
        holder.appendChild(fallback);

        if (student?.id && student?.avatar_path) {
            const image = document.createElement('img');
            image.src = endpointFor(student);
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('load', () => holder.classList.add('has-photo'), { once: true });
            image.addEventListener('error', () => image.remove(), { once: true });
            holder.appendChild(image);
        }
        return holder;
    }

    function loadAdminMobileDirectory() {
        if (!isAdmin) return;
        if (!document.querySelector('link[data-admin-student-mobile-cards]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/admin-student-mobile-cards.css?v=20260903-4';
            link.dataset.adminStudentMobileCards = 'true';
            document.head.appendChild(link);
        }
        if (!document.querySelector('script[data-admin-student-mobile-cards]')) {
            const script = document.createElement('script');
            script.src = '/js/admin-student-mobile-cards.js?v=20260903-4';
            script.defer = true;
            script.dataset.adminStudentMobileCards = 'true';
            document.body.appendChild(script);
        }
    }

    function adminStudents() {
        try { return Array.isArray(allStudentsData) ? allStudentsData : []; }
        catch (_) { return []; }
    }

    function observerStudents() {
        try { return Array.isArray(observerState?.students) ? observerState.students : []; }
        catch (_) { return []; }
    }

    function enhanceAdminRows() {
        if (!isAdmin) return;
        const students = adminStudents();
        if (!students.length) return;
        const byPrn = new Map(students.map(student => [String(student.prn), student]));
        document.querySelectorAll('#studentsTableBody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2 || cells[1].querySelector('.directory-student-avatar')) return;
            const prn = String(cells[0].textContent || '').trim();
            const student = byPrn.get(prn);
            if (!student) return;
            cells[1].classList.add('directory-student-name-cell');
            cells[1].prepend(buildAvatar(student));
        });
    }

    function enhanceObserverRows() {
        if (!isObserver) return;
        const students = observerStudents();
        document.querySelectorAll('#observerStudents .tpc-directory-row').forEach(row => {
            const index = Number(row.dataset.studentIndex);
            const student = students[index];
            const initialsHost = row.querySelector('.tpc-student-initials');
            if (!student || !initialsHost || initialsHost.dataset.avatarReady === 'true') return;
            initialsHost.dataset.avatarReady = 'true';
            initialsHost.textContent = '';
            initialsHost.appendChild(buildAvatar(student, 'directory-student-avatar directory-student-avatar-tpc'));
        });
    }

    function enhanceAdminModal() {
        if (!isAdmin) return;
        const header = document.querySelector('#modalContent .candidate-modal-header');
        if (!header || header.querySelector('.directory-modal-avatar')) return;
        const title = document.getElementById('modalStudentName')?.textContent || '';
        const prnMatch = title.match(/\(([^()]+)\)\s*$/);
        const student = adminStudents().find(item => String(item.prn) === String(prnMatch?.[1] || ''));
        if (!student) return;
        header.prepend(buildAvatar(student, 'directory-student-avatar directory-modal-avatar'));
    }

    function enhanceObserverModal() {
        if (!isObserver) return;
        const header = document.querySelector('#observerModalBody .candidate-modal-header');
        if (!header || header.querySelector('.directory-modal-avatar')) return;
        let student = null;
        try { student = observerState?.selectedStudent || null; } catch (_) {}
        if (!student) return;
        header.prepend(buildAvatar(student, 'directory-student-avatar directory-modal-avatar'));
    }

    function refresh() {
        enhanceAdminRows();
        enhanceObserverRows();
        enhanceAdminModal();
        enhanceObserverModal();
    }

    function watch(id) {
        const node = document.getElementById(id);
        if (node && 'MutationObserver' in window) new MutationObserver(refresh).observe(node, { childList: true, subtree: true });
    }

    function boot() {
        loadAdminMobileDirectory();
        refresh();
        ['studentsTableBody', 'observerStudents', 'modalContent', 'observerModalBody'].forEach(watch);
        document.addEventListener('click', event => {
            if (event.target.closest('#studentsTableBody, #observerStudents, [onclick*="openStudentModal"], [onclick*="openObserverStudent"]')) {
                window.setTimeout(refresh, 0);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();