const roleConfig = {
    student: { form: 'studentUnifiedForm', endpoint: '/api/auth/login', session: '/api/auth/me', redirect: '/dashboard', body: () => ({ prn: value('studentPrn'), dob: value('studentDob'), token: turnstileState.student.token }) },
    admin: { form: 'adminUnifiedForm', endpoint: '/api/admin/auth/login', session: '/api/admin/auth/me', redirect: '/admin/dashboard', body: () => ({ email: value('adminEmail'), password: value('adminPassword', false), token: turnstileState.admin.token }) },
    observer: { form: 'observerUnifiedForm', endpoint: '/api/observer/auth/login', session: '/api/observer/auth/me', redirect: '/observer/dashboard', body: () => ({ email: value('observerEmail'), password: value('observerPassword', false), token: turnstileState.observer.token }) }
};

const TURNSTILE_SITEKEY = '1x00000000000000000000AA';
const turnstileState = Object.fromEntries(['student', 'admin', 'observer', 'correction'].map(role => [role, { widgetId: null, token: '', recoveryAttempts: 0 }]));
const turnstileTargets = { student: 'studentTurnstile', admin: 'adminTurnstile', observer: 'observerTurnstile', correction: 'correctionTurnstile' };

window.initTurnstile = function initTurnstile() {
    renderTurnstile('student');
};

function renderTurnstile(role) {
    const state = turnstileState[role];
    const target = document.getElementById(turnstileTargets[role]);
    if (!target || state.widgetId !== null || !window.turnstile) return;
    target.replaceChildren();
    state.widgetId = window.turnstile.render(target, {
        sitekey: TURNSTILE_SITEKEY,
        theme: 'dark',
        action: role === 'correction' ? 'dob_correction' : `${role}_login`,
        size: target.getBoundingClientRect().width < 300 ? 'compact' : 'flexible',
        appearance: 'always',
        retry: 'auto',
        'retry-interval': 3000,
        'refresh-expired': 'auto',
        'refresh-timeout': 'auto',
        callback: token => {
            state.token = token;
            state.recoveryAttempts = 0;
            showTurnstileRecovery(role, '');
            showPortalAlert('');
        },
        'expired-callback': () => recoverTurnstile(role, 'Security verification expired. Refreshing…', true),
        'timeout-callback': () => recoverTurnstile(role, 'Security verification timed out. Refreshing…', true),
        'error-callback': errorCode => {
            state.token = '';
            recoverTurnstile(role, `Security verification failed${errorCode ? ` (${errorCode})` : ''}.`, state.recoveryAttempts < 1);
        }
    });
}

function showTurnstileRecovery(role, message) {
    const status = document.getElementById(`${role}TurnstileStatus`);
    if (!status) return;
    status.hidden = !message;
    status.querySelector('span').textContent = message;
}

function recreateTurnstile(role) {
    const state = turnstileState[role];
    if (window.turnstile && state.widgetId !== null) {
        try { window.turnstile.remove(state.widgetId); } catch (_) { /* Widget may already be gone. */ }
    }
    state.widgetId = null;
    state.token = '';
    const target = document.getElementById(turnstileTargets[role]);
    target?.replaceChildren();
    renderTurnstile(role);
}

function recoverTurnstile(role, message, automatic = false) {
    const state = turnstileState[role];
    state.token = '';
    const guidance = automatic ? 'Retrying automatically.' : 'Use Retry verification. Chrome extensions, VPN, or data saving may block challenges.cloudflare.com.';
    showTurnstileRecovery(role, `${message} ${guidance}`);
    if (automatic) {
        state.recoveryAttempts += 1;
        window.setTimeout(() => recreateTurnstile(role), 1200);
    }
}

function retryTurnstile(role) {
    turnstileState[role].recoveryAttempts = 0;
    showTurnstileRecovery(role, 'Reloading security verification…');
    if (window.turnstile) return recreateTurnstile(role);
    document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')?.remove();
    const script = document.createElement('script');
    script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&retry=${Date.now()}`;
    script.async = true;
    script.onload = () => window.turnstile?.ready(() => recreateTurnstile(role));
    script.onerror = () => recoverTurnstile(role, 'Chrome could not load security verification.', false);
    document.head.append(script);
}

function resetTurnstile(role) {
    const state = turnstileState[role];
    state.token = '';
    if (window.turnstile && state.widgetId !== null) window.turnstile.reset(state.widgetId);
}

document.addEventListener('DOMContentLoaded', () => {
    const tabs = [...document.querySelectorAll('.role-toggle-btn')];
    tabs.forEach((button, index) => {
        button.addEventListener('click', () => selectRole(button.dataset.role));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].focus();
            selectRole(tabs[next].dataset.role);
        });
    });
    Object.entries(roleConfig).forEach(([role, config]) => document.getElementById(config.form).addEventListener('submit', event => login(event, role)));
    document.querySelectorAll('[data-turnstile-retry]').forEach(button => button.addEventListener('click', () => retryTurnstile(button.dataset.turnstileRetry)));
    window.setTimeout(() => {
        const target = document.getElementById(turnstileTargets.student);
        if (!turnstileState.student.token && (!window.turnstile || !target.querySelector('iframe'))) {
            recoverTurnstile('student', 'Security verification did not load.', false);
        }
    }, 10000);
});

function selectRole(role) {
    document.body.dataset.activeRole = role;
    Object.entries(roleConfig).forEach(([key, config]) => {
        if (key !== role) document.getElementById(config.form).reset();
    });
    document.querySelectorAll('.role-toggle-btn').forEach(button => {
        const active = button.dataset.role === role;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.unified-role-form').forEach(form => form.classList.toggle('active', form.dataset.formRole === role));
    const firstInput = document.querySelector(`[data-form-role="${role}"] input`);
    if (firstInput) firstInput.focus();
    showPortalAlert('');
    renderTurnstile(role);
}

function clearLegacyAuthTokens() {
    ['tpo_token', 'tpo_student', 'tpo_admin_token', 'tpo_observer_token', 'adminToken', 'observerToken'].forEach(key => {
        try { localStorage.removeItem(key); } catch (_) { /* Storage can be unavailable in strict privacy modes. */ }
    });
}

async function verifyFreshSession(config) {
    const response = await fetch(config.session, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error('Sign-in succeeded but the new session could not be opened. Please try once more.');
}

async function login(event, role) {
    event.preventDefault();
    const config = roleConfig[role];
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const original = button.textContent;
    let navigating = false;
    button.disabled = true;
    button.textContent = 'Verifying access…';
    showPortalAlert('');
    if (!turnstileState[role].token) {
        showPortalAlert('Complete security verification before signing in.', 'error');
        renderTurnstile(role);
        button.disabled = false;
        button.textContent = original;
        return;
    }
    try {
        const response = await fetch(config.endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(config.body())
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || result.error || 'Unable to sign in.');

        // Old builds stored JWTs in localStorage. A stale Bearer token can override the
        // newly issued secure cookie on the dashboard, causing a successful login to
        // bounce straight back to this page. Remove those legacy tokens globally.
        clearLegacyAuthTokens();
        await verifyFreshSession(config);

        navigating = true;
        showPortalAlert('Access verified. Opening workspace…', 'success');
        window.location.replace(config.redirect);
    } catch (error) {
        showPortalAlert(error.message, 'error');
    } finally {
        if (!navigating) {
            button.disabled = false;
            button.textContent = original;
            resetTurnstile(role);
        }
    }
}

function value(id, trim = true) { const current = document.getElementById(id).value; return trim ? current.trim() : current; }
function showPortalAlert(message, type = 'error') {
    const box = document.getElementById('unifiedAlert');
    box.textContent = message;
    box.hidden = !message;
    if (message) {
        box.className = type === 'success' ? 'alert alert-success' : 'alert alert-error';
        box.tabIndex = -1;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        box.focus({ preventScroll: true });
    }
}

// DOB Correction Modal Controller
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('dobCorrectionModal');
    const link = document.getElementById('dobCorrectionLink');
    const closeBtn = document.getElementById('closeDobModal');
    const form = document.getElementById('dobCorrectionForm');
    const resultDiv = document.getElementById('correctionResult');
    const correctionPrn = document.getElementById('correctionPrn');
    const correctionName = document.getElementById('correctionName');
    const correctionNameSuggestions = document.getElementById('correctionNameSuggestions');
    const correctionNameHint = document.getElementById('correctionNameHint');

    if (link && modal && closeBtn) {
        let suggestionTimer;
        const loadNameSuggestion = () => {
            clearTimeout(suggestionTimer);
            const prn = correctionPrn.value.trim();
            const query = correctionName.value.trim();
            correctionNameSuggestions.innerHTML = '';
            if (prn.length < 5 || query.length < 2) return;
            suggestionTimer = setTimeout(async () => {
                try {
                    const response = await fetch(`/api/auth/dob-correction-name-suggestion?prn=${encodeURIComponent(prn)}&q=${encodeURIComponent(query)}`);
                    const payload = await response.json();
                    const suggestions = response.ok && Array.isArray(payload.data) ? payload.data : [];
                    correctionNameSuggestions.replaceChildren(...suggestions.map(item => {
                        const option = document.createElement('option');
                        option.value = item.name;
                        return option;
                    }));
                    if (suggestions.length === 1) {
                        correctionName.value = suggestions[0].name;
                        correctionNameHint.textContent = 'Roster name selected automatically.';
                    } else {
                        correctionNameHint.textContent = 'No match yet. Check PRN and type your name as shown in roster.';
                    }
                } catch (_error) {
                    correctionNameHint.textContent = 'Name suggestion unavailable. Check PRN and try again.';
                }
            }, 250);
        };
        correctionPrn.addEventListener('input', loadNameSuggestion);
        correctionName.addEventListener('input', loadNameSuggestion);
        let returnFocus = link;
        const closeModal = () => {
            modal.hidden = true;
            document.body.classList.remove('modal-open');
            returnFocus?.focus();
        };
        link.addEventListener('click', (e) => {
            e.preventDefault();
            returnFocus = document.activeElement;
            modal.hidden = false;
            document.body.classList.add('modal-open');
            resultDiv.textContent = '';
            form.reset();
            renderTurnstile('correction');
            window.setTimeout(() => document.getElementById('correctionPrn')?.focus(), 0);
        });

        closeBtn.addEventListener('click', closeModal);

        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !modal.hidden) closeModal();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!turnstileState.correction.token) {
                resultDiv.textContent = 'Complete security verification first.';
                resultDiv.style.color = '#ef4444';
                renderTurnstile('correction');
                return;
            }
            resultDiv.textContent = 'Submitting request...';
            resultDiv.style.color = '#94a3b8';

            try {
                const res = await fetch('/api/auth/dob-correction-requests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prn: document.getElementById('correctionPrn').value.trim(),
                        name: document.getElementById('correctionName').value.trim(),
                        dob: document.getElementById('correctionDob').value.trim(),
                        token: turnstileState.correction.token
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    resultDiv.textContent = 'Request submitted successfully!';
                    resultDiv.style.color = '#10b981';
                    form.reset();
                } else {
                    resultDiv.textContent = (data.error?.message || data.error || 'Failed to submit request.');
                    resultDiv.style.color = '#ef4444';
                }
            } catch (err) {
                resultDiv.textContent = 'Error connecting to server.';
                resultDiv.style.color = '#ef4444';
            } finally {
                resetTurnstile('correction');
            }
        });
    }
});
