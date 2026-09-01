(() => {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    const selectors = [
        '#academicVerificationBadge',
        '.evidence-status-inline',
        '.evidence-status-holder',
        '.skill-verification-summary'
    ];

    function cleanup() {
        selectors.forEach(selector => document.querySelectorAll(selector).forEach(node => node.remove()));
    }

    function init() {
        cleanup();
        new MutationObserver(cleanup).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
