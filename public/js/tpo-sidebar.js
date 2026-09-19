/**
 * Placement Portal AIT - TPO Sidebar Controller
 * Handles mobile off-canvas drawer, desktop collapse/open, and tooltip hydration.
 */

(function () {
    function initSidebar() {
        const body = document.body;
        if (!body.classList.contains('admin-dashboard-page')) return;

        const sidebar = document.getElementById('adminSidebar');
        if (!sidebar) return;

        // Ensure backdrop element exists in DOM
        let backdrop = document.querySelector('.tpo-sidebar-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'tpo-sidebar-backdrop';
            backdrop.setAttribute('aria-hidden', 'true');
            document.body.appendChild(backdrop);
        }

        // Hydrate tooltips for icon rail collapsed mode
        function hydrateTabTooltips() {
            sidebar.querySelectorAll('.tab-btn').forEach(btn => {
                const label = btn.querySelector('.tab-label');
                const text = label ? label.textContent.trim() : btn.textContent.trim();
                if (text && !btn.getAttribute('title')) {
                    btn.setAttribute('title', text);
                }
            });
        }
        hydrateTabTooltips();

        // Observe dynamic tab additions (from competition-review.js, evidence-review.js, etc.)
        const observer = new MutationObserver(() => hydrateTabTooltips());
        observer.observe(sidebar, { childList: true, subtree: true });

        // Update collapse button state & label
        function updateCollapseButtonState(isCollapsed) {
            const collapseBtn = document.getElementById('tpoSidebarCollapseBtn');
            if (!collapseBtn) return;
            collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
            collapseBtn.setAttribute('title', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
            collapseBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
        }

        // Toggle desktop collapse / expand
        function toggleDesktopCollapse(forceState) {
            const willCollapse = typeof forceState === 'boolean' ? forceState : !body.classList.contains('sidebar-collapsed');
            body.classList.toggle('sidebar-collapsed', willCollapse);
            updateCollapseButtonState(willCollapse);
            try {
                localStorage.setItem('tpo-sidebar-collapsed', String(willCollapse));
            } catch (_) {}
        }

        // Restore desktop collapse preference
        try {
            const saved = localStorage.getItem('tpo-sidebar-collapsed');
            if (saved === 'true' && window.innerWidth >= 1024) {
                toggleDesktopCollapse(true);
            } else {
                updateCollapseButtonState(false);
            }
        } catch (_) {}

        // Toggle mobile drawer
        function toggleMobileSidebar(open) {
            const shouldOpen = typeof open === 'boolean' ? open : !body.classList.contains('sidebar-open');
            body.classList.toggle('sidebar-open', shouldOpen);
            const trigger = document.getElementById('tpoMobileNavTrigger');
            if (trigger) {
                trigger.setAttribute('aria-expanded', String(shouldOpen));
            }
        }

        // Bind desktop collapse toggle button
        const collapseBtn = document.getElementById('tpoSidebarCollapseBtn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleDesktopCollapse();
            });
        }

        // Bind mobile hamburger button
        const mobileTrigger = document.getElementById('tpoMobileNavTrigger');
        if (mobileTrigger) {
            mobileTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMobileSidebar();
            });
        }

        // Bind mobile close button
        const closeBtn = document.getElementById('tpoSidebarCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMobileSidebar(false);
            });
        }

        // Close on backdrop click
        backdrop.addEventListener('click', () => toggleMobileSidebar(false));

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && body.classList.contains('sidebar-open')) {
                toggleMobileSidebar(false);
            }
        });

        // Auto-close drawer on mobile when any tab is selected
        sidebar.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn && window.innerWidth < 1024) {
                toggleMobileSidebar(false);
            }
        });

        // Window resize handler
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 1024 && body.classList.contains('sidebar-open')) {
                body.classList.remove('sidebar-open');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }
})();
