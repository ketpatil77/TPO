/* Shared interaction polish; keeps existing forms, IDs, handlers and permissions. */
(() => {
    function disclose(element, title, description) {
        if (!element || element.closest('.task-disclosure')) return;
        const details = document.createElement('details');
        details.className = 'task-disclosure';
        const summary = document.createElement('summary');
        const heading = document.createElement('strong'); heading.textContent = title;
        const hint = document.createElement('span'); hint.textContent = description;
        summary.append(heading, hint); details.append(summary);
        element.before(details); details.append(element);
        element.addEventListener('invalid', () => { details.open = true; }, true);
    }

    function normalizePortalMessage(value, fallback = 'Something went wrong. Please try again.') {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value instanceof Error && value.message) return value.message;
        if (value && typeof value === 'object') {
            if (typeof value.message === 'string' && value.message.trim()) return value.message.trim();
            if (typeof value.error === 'string' && value.error.trim()) return value.error.trim();
            if (value.error && typeof value.error === 'object' && typeof value.error.message === 'string' && value.error.message.trim()) return value.error.message.trim();
            if (typeof value.details === 'string' && value.details.trim()) return value.details.trim();
        }
        return fallback;
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (document.body.matches('.student-dashboard-page,.admin-dashboard-page,.observer-shell') && !document.querySelector('link[data-dashboard-density]')) {
            const density = document.createElement('link');
            density.rel = 'stylesheet';
            density.href = '/css/dashboard-density.css?v=20260903-density1';
            density.dataset.dashboardDensity = 'true';
            document.head.appendChild(density);
        }

        // Legacy handlers occasionally pass structured API errors directly into the toast.
        // Normalize once for every workspace so users never see "[object Object]" again.
        if (typeof window.showToast === 'function' && !window.showToast.__portalNormalized) {
            const originalShowToast = window.showToast;
            const normalizedShowToast = function(message, type = 'info') {
                return originalShowToast(normalizePortalMessage(message), type);
            };
            normalizedShowToast.__portalNormalized = true;
            window.showToast = normalizedShowToast;
        }
        window.normalizePortalMessage = normalizePortalMessage;

        if (document.body.classList.contains('admin-dashboard-page')) {
            const tabs = document.querySelector('.admin-tabs');
            if (tabs && !tabs.querySelector('[aria-controls="tab-student-activity"]')) {
                const button = document.createElement('button');
                button.className = 'tab-btn';
                button.type = 'button';
                button.setAttribute('role', 'tab');
                button.setAttribute('aria-selected', 'false');
                button.setAttribute('aria-controls', 'tab-student-activity');
                button.textContent = 'Live activity';
                const auditButton = tabs.querySelector('[aria-controls="tab-audit-logs"]');
                (auditButton || tabs.lastElementChild)?.after(button);
            }
            if (!document.querySelector('link[data-student-activity-feed]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = '/css/student-activity-feed.css?v=20260902-live2';
                link.dataset.studentActivityFeed = 'true';
                document.head.appendChild(link);
            }
            if (!document.querySelector('script[data-student-activity-feed]')) {
                const script = document.createElement('script');
                script.src = '/js/student-activity-feed.js?v=20260902-live2';
                script.defer = true;
                script.dataset.studentActivityFeed = 'true';
                document.body.appendChild(script);
            }
            if (!document.querySelector('link[data-admin-student-mobile-cards]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = '/css/admin-student-mobile-cards.css?v=20260904-completion1';
                link.dataset.adminStudentMobileCards = 'true';
                document.head.appendChild(link);
            }
            if (!document.querySelector('script[data-admin-student-mobile-cards]')) {
                const script = document.createElement('script');
                script.src = '/js/admin-student-mobile-cards.js?v=20260904-completion1';
                script.defer = true;
                script.dataset.adminStudentMobileCards = 'true';
                document.body.appendChild(script);
            }
        }

        const scopeBadge = document.querySelector('.observer-identity .readonly-pill');
        if (scopeBadge) scopeBadge.textContent = 'Department access';
        for (const [id, name] of [['adminAvatarFile','Administrator profile picture'],['observerAvatarFile','TPC profile picture'],['csvFileInput','Excel or CSV roster file']]) {
            document.getElementById(id)?.setAttribute('aria-label', name);
        }
        const tasks = [
            ['assessmentForm', 'Record training or assessment', 'Add a score, attendance or interview practice result.'],
            ['interviewForm', 'Schedule an interview', 'Choose the student, drive, time and panel.'],
            ['offerForm', 'Record a placement offer', 'Track company, role, package and acceptance.'],
            ['calendarForm', 'Add a calendar event', 'Publish a drive, test, interview or training date.'],
            ['changeStudentPasswordFormDashboard', 'Correct a student login DOB', 'Use a verified date of birth. This changes their login password.'],
            ['driveForm', 'Create a placement drive', 'Set role, eligibility and application deadline.'],
            ['staffCreateForm', 'Create staff access', 'Set administrator or department TPC access.']
        ];
        for (const [id, title, description] of tasks) disclose(document.getElementById(id), title, description);
        disclose(document.getElementById('notificationForm')?.parentElement, 'Compose a student alert', 'Choose recipients and write a message. Nothing sends until you select Send alert.');
        disclose(document.querySelector('.roster-paste-column'), 'Advanced: paste CSV', 'Use this instead of choosing a file. Keep the header row.');

        const dropzone = document.getElementById('dropzone');
        if (dropzone) {
            dropzone.setAttribute('role', 'button'); dropzone.tabIndex = 0;
            dropzone.setAttribute('aria-label', 'Choose Excel or CSV roster file');
            dropzone.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dropzone.click(); }
            });
        }

        // Associate legacy labels and expose required fields, including dynamic registration.
        let nextId = 0;
        function enhanceFields() {
            document.querySelectorAll('label:not([for])').forEach(label => {
                if (label.tagName !== 'LABEL' || label.querySelector('input,select,textarea')) return;
                const control = label.nextElementSibling;
                if (!control?.matches('input,select,textarea')) return;
                if (!control.id) control.id = `portal-field-${++nextId}`;
                label.htmlFor = control.id;
            });
            document.querySelectorAll('input[required],select[required],textarea[required]').forEach(control => {
                const label = control.labels?.[0];
                if (!label || label.querySelector('.required-mark')) return;
                const mark = document.createElement('span'); mark.className = 'required-mark'; mark.textContent = ' *'; mark.setAttribute('aria-hidden', 'true');
                label.append(mark);
            });
            document.querySelectorAll('input[name="student_id"],input[name="drive_id"],#rankingDriveId').forEach(control => {
                if (control.dataset.identifierHelp) return;
                control.dataset.identifierHelp = 'true';
                const help = document.createElement('small'); help.className = 'field-help';
                help.textContent = control.name === 'student_id' ? 'Internal student ID, not PRN. Find the student in Advanced student search first.' : 'Internal drive ID. Copy it from the placement drive record.';
                control.after(help);
            });
        }
        enhanceFields();
        new MutationObserver(enhanceFields).observe(document.querySelector('main') || document.body, { childList:true, subtree:true });

        document.addEventListener('invalid', event => {
            const field = event.target;
            if (!field.matches('input,select,textarea') || !field.id) return;
            field.closest('details')?.setAttribute('open', '');
            const id = `${field.id}-validation`;
            let error = document.getElementById(id);
            if (!error) { error = document.createElement('small'); error.id = id; error.className = 'field-validation'; error.setAttribute('role', 'alert'); field.after(error); }
            error.textContent = field.validationMessage; field.setAttribute('aria-invalid', 'true');
            const descriptions = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); descriptions.add(id);
            field.setAttribute('aria-describedby', [...descriptions].join(' '));
        }, true);
        document.addEventListener('input', event => {
            const field = event.target;
            if (field.getAttribute('aria-invalid') !== 'true' || !field.validity?.valid) return;
            field.removeAttribute('aria-invalid');
            document.getElementById(`${field.id}-validation`)?.remove();
            const descriptions = (field.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== `${field.id}-validation`);
            if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' ')); else field.removeAttribute('aria-describedby');
        });

        // Existing modal open/close handlers remain authoritative.
        const modalTriggers = new WeakMap();
        let lastOutsideTrigger = null;
        document.addEventListener('click', event => {
            if (!event.target.closest('.modal-backdrop')) lastOutsideTrigger = event.target.closest('button,a,input,select,summary');
        }, true);
        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
            if (!modal.hasAttribute('aria-labelledby')) {
                const heading = modal.querySelector('h2,h3');
                if (heading) { if (!heading.id) heading.id = `portal-dialog-${++nextId}`; modal.setAttribute('aria-labelledby', heading.id); }
            }
            let wasOpen = modal.classList.contains('active');
            new MutationObserver(() => {
                const isOpen = modal.classList.contains('active');
                if (isOpen === wasOpen) return;
                wasOpen = isOpen;
                if (isOpen) {
                    modalTriggers.set(modal, lastOutsideTrigger || (!modal.contains(document.activeElement) ? document.activeElement : null));
                    modal.querySelector('.close-btn,button,input,select,textarea')?.focus();
                } else {
                    const trigger = modalTriggers.get(modal);
                    if (trigger?.isConnected) trigger.focus();
                }
            }).observe(modal, { attributes:true, attributeFilter:['class'] });
            modal.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); modal.querySelector('.close-btn')?.click(); }
                if (event.key !== 'Tab') return;
                const controls = [...modal.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(e => !e.disabled && e.getClientRects().length);
                if (!controls.length) return;
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            });
        });
    });
})();