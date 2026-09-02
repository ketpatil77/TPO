(() => {
    if (!document.body.classList.contains('observer-shell')) return;

    const sections = () => [
        document.getElementById('observerTab-students'),
        document.getElementById('observerTab-roster')
    ].filter(Boolean);

    let frame = 0;

    function paginationHeight(section) {
        const pagination = section.querySelector('.pagination-bar');
        if (!pagination || pagination.hidden) return 0;
        const rect = pagination.getBoundingClientRect();
        return Math.max(48, Math.ceil(rect.height || 0));
    }

    function fitSection(section) {
        if (!section?.classList.contains('active')) return;
        const shell = section.querySelector('.table-shell');
        if (!shell) return;

        const rect = shell.getBoundingClientRect();
        const viewport = window.visualViewport?.height || window.innerHeight;
        const mobile = window.innerWidth <= 760;
        const minHeight = mobile ? 320 : 360;
        const bottomGap = mobile ? 10 : 12;
        const available = Math.floor(viewport - Math.max(0, rect.top) - paginationHeight(section) - bottomGap);
        const height = Math.max(minHeight, available);

        shell.style.setProperty('--tpc-table-fill-height', `${height}px`);
        shell.style.height = `${height}px`;
        shell.dataset.tpcViewportFill = 'true';
    }

    function fitActive() {
        sections().forEach(fitSection);
    }

    function scheduleFit() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(fitActive);
    }

    function observeVisibility() {
        if (!('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) scheduleFit();
        }, { threshold: [0, 0.2, 0.5, 0.8, 1] });
        sections().forEach(section => {
            const shell = section.querySelector('.table-shell');
            if (shell) observer.observe(shell);
        });
    }

    function observePagination() {
        if (!('ResizeObserver' in window)) return;
        const observer = new ResizeObserver(scheduleFit);
        sections().forEach(section => {
            const pagination = section.querySelector('.pagination-bar');
            if (pagination) observer.observe(pagination);
        });
    }

    function boot() {
        scheduleFit();
        observeVisibility();
        observePagination();

        document.querySelector('.observer-tabs')?.addEventListener('click', event => {
            if (event.target.closest('.tab-btn')) setTimeout(scheduleFit, 0);
        });
        window.addEventListener('resize', scheduleFit, { passive: true });
        window.addEventListener('orientationchange', scheduleFit, { passive: true });
        window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
