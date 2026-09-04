(() => {
    if (window.__AIT_STUDENT_LOGIN_RESILIENCE__) return;
    window.__AIT_STUDENT_LOGIN_RESILIENCE__ = true;

    const LOGIN_TIMEOUT_MS = 15000;
    let submitting = false;

    function showMessage(message, type = 'error') {
        if (typeof window.showPortalAlert === 'function') {
            window.showPortalAlert(message, type);
            return;
        }
        const box = document.getElementById('unifiedAlert');
        if (!box) return;
        box.textContent = message || '';
        box.hidden = !message;
        box.className = type === 'success' ? 'alert alert-success' : 'alert alert-error';
    }

    function readTurnstileToken(form) {
        try {
            if (typeof turnstileState !== 'undefined' && turnstileState?.student?.token) {
                return turnstileState.student.token;
            }
        } catch (_) {}
        return form.querySelector('input[name="cf-turnstile-response"]')?.value || '';
    }

    function clearLegacyStudentTokens() {
        ['tpo_token', 'tpo_student'].forEach(key => {
            try { localStorage.removeItem(key); } catch (_) {}
        });
    }

    async function resilientStudentLogin(event) {
        const form = event.currentTarget;
        if (!form || form.id !== 'studentUnifiedForm') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (submitting) return;

        const prn = document.getElementById('studentPrn')?.value?.trim() || '';
        const dob = document.getElementById('studentDob')?.value?.trim() || '';
        const token = readTurnstileToken(form);
        const button = form.querySelector('button[type="submit"]');
        const original = button?.textContent || 'Open student workspace';

        if (!/^\d{6,20}$/.test(prn) || !/^\d{6}$/.test(dob)) {
            showMessage('Enter a valid PRN and DOB in DDMMYY format.');
            return;
        }
        if (!token) {
            showMessage('Complete security verification before signing in.');
            try { if (typeof renderTurnstile === 'function') renderTurnstile('student'); } catch (_) {}
            return;
        }

        submitting = true;
        if (button) {
            button.disabled = true;
            button.textContent = 'Opening workspace…';
        }
        showMessage('');

        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS) : null;
        let navigating = false;
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                signal: controller?.signal,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ prn, dob, token })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error?.message || payload?.error || 'Unable to sign in.');
            }

            // The login response already issued the secure session cookie. Do not hold a successful
            // login hostage to a second /me request on slow mobile networks.
            clearLegacyStudentTokens();
            navigating = true;
            showMessage('Access verified. Opening workspace…', 'success');
            window.location.replace('/dashboard');
        } catch (error) {
            const message = error?.name === 'AbortError'
                ? 'Sign-in timed out. Check your connection and try again.'
                : (error?.message || 'Unable to sign in.');
            showMessage(message);
        } finally {
            if (timer) clearTimeout(timer);
            if (!navigating) {
                submitting = false;
                if (button) {
                    button.disabled = false;
                    button.textContent = original;
                }
                try { if (typeof resetTurnstile === 'function') resetTurnstile('student'); } catch (_) {}
            }
        }
    }

    function install() {
        const form = document.getElementById('studentUnifiedForm');
        if (!form || form.dataset.resilientLogin === 'true') return;
        form.dataset.resilientLogin = 'true';
        // Capture phase makes this the single student submit owner even if older cached login
        // handlers are still attached in the browser.
        form.addEventListener('submit', resilientStudentLogin, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
})();