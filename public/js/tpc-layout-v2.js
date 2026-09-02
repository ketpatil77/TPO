(() => {
    if (!document.body.classList.contains('observer-shell')) return;

    const sections = () => [
        document.getElementById('observerTab-students'),
        document.getElementById('observerTab-roster')
    ].filter(Boolean);

    let frame = 0;

    function viewportHeight() {
        return window.visualViewport?.height || window.innerHeight;
    }

    function fitSection(section) {
        if (!section?.classList.contains('active')) return;

        const desktop = window.innerWidth >= 900;
        if (!desktop) {
            section.style.removeProperty('--tpc-active-section-height');
            section.style.removeProperty('height');
            section.dataset.tpcViewportFit = 'mobile-natural';
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

    function boot() {
        scheduleFit();
        observeLayoutChanges();

        document.querySelector('.observer-tabs')?.addEventListener('click', event => {
            if (event.target.closest('.tab-btn')) setTimeout(scheduleFit, 0);
        });

        window.addEventListener('resize', scheduleFit, { passive: true });
        window.addEventListener('orientationchange', scheduleFit, { passive: true });
        window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
        window.addEventListener('pageshow', scheduleFit, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
