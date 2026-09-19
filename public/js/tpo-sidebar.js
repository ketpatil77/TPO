/**
 * Placement Portal AIT - TPO Sidebar Controller
 * Handles mobile off-canvas drawer, desktop collapse/open, and tooltip management.
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

        // Manage tooltips: only show in collapsed icon-rail mode
        function syncTooltips() {
            const isCollapsed = body.classList.contains('sidebar-collapsed');
            sidebar.querySelectorAll('.tab-btn').forEach(btn => {
                if (isCollapsed) {
                    const label = btn.querySelector('.tab-label');
                    const text = label ? label.textContent.trim() : btn.textContent.trim();
                    if (text) btn.setAttribute('title', text);
                } else {
                    btn.removeAttribute('title');
                }
            });
        }
        syncTooltips();

        // Observe dynamic tab additions (from flagged-review-queue.js, proof-review-ui.js, etc.)
        const observer = new MutationObserver((mutations) => {
            let needsTooltipSync = false;
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('tab-btn')) {
                        // If node was directly appended to sidebar instead of into a section
                        if (node.parentElement === sidebar) {
                            const bodyContainer = sidebar.querySelector('.tpo-sidebar-body');
                            const targetSection = bodyContainer ? bodyContainer.querySelector('.tpo-sidebar-section:last-child') : null;
                            if (targetSection) {
                                targetSection.appendChild(node);
                            }
                        }
                        needsTooltipSync = true;
                    }
                });
            });
            if (needsTooltipSync) syncTooltips();
        });
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
            syncTooltips();
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
                syncTooltips();
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

        // Allow clicking the collapsed brand icon to re-expand
        const brand = sidebar.querySelector('.tpo-sidebar-brand');
        if (brand) {
            brand.addEventListener('click', (e) => {
                if (body.classList.contains('sidebar-collapsed')) {
                    e.preventDefault();
                    toggleDesktopCollapse(false);
                }
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
            syncTooltips();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }
})();
