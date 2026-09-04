(() => {
    if (window.__AIT_STUDENT_DASHBOARD_RESILIENCE__) return;
    window.__AIT_STUDENT_DASHBOARD_RESILIENCE__ = true;

    function unlockWorkspace() {
        const gate = document.getElementById('mandatoryNotificationGate');
        const dashboard = document.getElementById('studentDashboard');
        if (gate && !gate.hidden) gate.hidden = true;
        if (document.body?.classList?.contains?.('notifications-blocked')) document.body.classList.remove('notifications-blocked');
        if (dashboard) {
            if (dashboard.inert) dashboard.inert = false;
            if (dashboard.hasAttribute('inert')) dashboard.removeAttribute('inert');
            if (dashboard.hasAttribute('aria-hidden')) dashboard.removeAttribute('aria-hidden');
        }
    }

    function startWorkspace() {
        unlockWorkspace();
        try {
            if (typeof startStudentWorkspace === 'function') startStudentWorkspace();
        } catch (error) {
            console.error('Student workspace bootstrap failed:', error);
        }
    }

    function recoverStaleFeedback() {
        const feedback = document.getElementById('portalOperationFeedback');
        if (!feedback?.classList.contains('is-visible')) return;
        const text = feedback.querySelector('.portal-operation-message')?.textContent || '';
        // Background notification setup must never impersonate a student save operation.
        if (/^Saving…?$|notification/i.test(text)) {
            try { window.PortalOperationFeedback?.forceHide?.(); }
            catch (_) { feedback.classList.remove('is-visible'); }
        }
    }

    function boot() {
        startWorkspace();
        recoverStaleFeedback();
        setTimeout(startWorkspace, 0);
        setTimeout(() => {
            unlockWorkspace();
            recoverStaleFeedback();
        }, 750);
    }

    const observer = new MutationObserver(() => {
        unlockWorkspace();
        recoverStaleFeedback();
    });

    function observe() {
        if (!document.body) return;
        observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden'], childList: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            boot();
            observe();
        }, { once: true });
    } else {
        boot();
        observe();
    }

    window.addEventListener('pageshow', boot);
})();