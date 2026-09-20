/* ==========================================================================
   Student Workspace Sidebar Logic
   Handles collapse/expand state, mobile drawer toggles, and accordion/flyout groups.
   ========================================================================== */

(function () {
    'use strict';

    // Synchronize active-group class on parent groups
    function syncActiveGroupClass() {
        document.querySelectorAll('.student-sidebar-group').forEach(group => {
            const hasActiveTab = group.querySelector('.tab-btn.active') !== null;
            group.classList.toggle('active-group', hasActiveTab);
        });
    }

    // Global toggle function for accordion sidebar groups & collapsed flyouts
    window.toggleSidebarGroup = function (headerEl) {
        if (!headerEl) return;
        const body = document.body;
        const group = headerEl.closest('.student-sidebar-group');
        if (!group) return;

        if (body.classList.contains('sidebar-collapsed')) {
            // In collapsed mode, toggle flyout-open class on click
            const isFlyoutOpen = group.classList.contains('flyout-open');
            document.querySelectorAll('.student-sidebar-group').forEach(g => {
                g.classList.remove('flyout-open');
            });
            if (!isFlyoutOpen) {
                group.classList.add('flyout-open');
            }
        } else {
            // In expanded mode, toggle accordion open class
            const isOpen = group.classList.toggle('open');
            headerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
    };

    function initStudentSidebar() {
        const body = document.body;
        const collapseBtn = document.getElementById('studentSidebarCollapseBtn');
        const mobileTrigger = document.getElementById('studentMobileNavTrigger');
        const closeBtn = document.getElementById('studentSidebarCloseBtn');
        const overlay = document.getElementById('studentSidebarOverlay');

        // Initial active-group synchronization
        syncActiveGroupClass();

        // Restore saved sidebar collapse state from localStorage on desktop
        const isCollapsed = localStorage.getItem('student_sidebar_collapsed') === 'true';
        if (isCollapsed && window.innerWidth >= 1024) {
            body.classList.add('sidebar-collapsed');
            if (collapseBtn) collapseBtn.setAttribute('aria-expanded', 'false');
        }

        // Toggle desktop collapse
        if (collapseBtn) {
            collapseBtn.addEventListener('click', function () {
                const collapsed = body.classList.toggle('sidebar-collapsed');
                localStorage.setItem('student_sidebar_collapsed', collapsed);
                collapseBtn.setAttribute('aria-expanded', !collapsed);
                // Close any open flyouts on toggle
                document.querySelectorAll('.student-sidebar-group').forEach(g => {
                    g.classList.remove('flyout-open');
                });
            });
        }

        // Mobile drawer open
        if (mobileTrigger) {
            mobileTrigger.addEventListener('click', function () {
                body.classList.add('sidebar-open');
            });
        }

        // Mobile drawer close
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                body.classList.remove('sidebar-open');
            });
        }

        // Mobile overlay click to close
        if (overlay) {
            overlay.addEventListener('click', function () {
                body.classList.remove('sidebar-open');
            });
        }

        // Auto close mobile drawer, close flyouts, and auto-expand active group when any tab button is clicked
        const sidebar = document.getElementById('studentSidebar');
        if (sidebar) {
            sidebar.addEventListener('click', function (e) {
                const btn = e.target.closest('.tab-btn');
                if (btn) {
                    const parentGroup = btn.closest('.student-sidebar-group');
                    if (parentGroup) {
                        parentGroup.classList.add('open');
                        const header = parentGroup.querySelector('.sidebar-group-header');
                        if (header) header.setAttribute('aria-expanded', 'true');
                    }
                    // Close flyouts on tab selection
                    document.querySelectorAll('.student-sidebar-group').forEach(g => {
                        g.classList.remove('flyout-open');
                    });
                    if (window.innerWidth < 1024) {
                        body.classList.remove('sidebar-open');
                    }
                    setTimeout(syncActiveGroupClass, 50);
                }
            });
        }

        // Close flyouts when clicking outside sidebar in collapsed mode
        document.addEventListener('click', function (e) {
            if (!e.target.closest('#studentSidebar')) {
                document.querySelectorAll('.student-sidebar-group.flyout-open').forEach(g => {
                    g.classList.remove('flyout-open');
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStudentSidebar);
    } else {
        initStudentSidebar();
    }
})();
