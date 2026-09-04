(() => {
    if (window.__AIT_STUDENT_DASHBOARD_RESILIENCE__) return;
    window.__AIT_STUDENT_DASHBOARD_RESILIENCE__ = true;

    function unlockWorkspace() {
        const gate = document.getElementById('mandatoryNotificationGate');
        const dashboard = document.getElementById('studentDashboard');
        if (gate && !gate.hidden) gate.hidden = true;
        document.body?.classList?.remove?.('notifications-blocked');
        if (dashboard) {
            dashboard.inert = false;
            dashboard.removeAttribute('inert');
            dashboard.removeAttribute('aria-hidden');
            dashboard.style.pointerEvents = '';
        }
    }

    function recoverStaleFeedback() {
        const feedback = document.getElementById('portalOperationFeedback');
        if (!feedback?.classList.contains('is-visible')) return;
        const text = feedback.querySelector('.portal-operation-message')?.textContent || '';
        if (/^Saving…?$|notification/i.test(text)) {
            try { window.PortalOperationFeedback?.forceHide?.(); }
            catch (_) { feedback.classList.remove('is-visible'); }
        }
    }

    // Dashboard initialization belongs to the primary dashboard script. This helper only removes
    // interaction locks and stale feedback; it never starts the workspace a second time.
    function boot() {
        unlockWorkspace();
        recoverStaleFeedback();
        setTimeout(() => {
            unlockWorkspace();
            recoverStaleFeedback();
        }, 500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
    window.addEventListener('pageshow', boot);
})();