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

    // The dashboard's own script owns initialization. Calling startStudentWorkspace() again here
    // duplicated listeners and network work and could leave Chrome in a permanent busy state.
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