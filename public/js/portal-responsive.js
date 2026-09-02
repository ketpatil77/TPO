(() => {
    function loadStylesheet(href, marker) {
        if (document.querySelector(`link[data-${marker}]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute(`data-${marker}`, 'true');
        document.head.appendChild(link);
    }

    function loadScript(src, marker, onLoad) {
        const existing = document.querySelector(`script[data-${marker}]`);
        if (existing) { if (onLoad) existing.addEventListener('load', onLoad, { once:true }); return existing; }
        const script = document.createElement('script');
        script.src = src;
        script.defer = true;
        script.setAttribute(`data-${marker}`, 'true');
        if (onLoad) script.addEventListener('load', onLoad, { once:true });
        document.body.appendChild(script);
        return script;
    }

    loadStylesheet('/css/mobile-system-v2.css?v=20260901-1', 'mobile-system-v2');
    loadStylesheet('/css/mobile-tabs-fix.css?v=20260901-1', 'mobile-tabs-fix');
    loadStylesheet('/css/dashboard-polish-v3.css?v=20260901-1', 'dashboard-polish-v3');
    loadStylesheet('/css/dashboard-audit-v4.css?v=20260901-1', 'dashboard-audit-v4');
    loadStylesheet('/css/profile-ranking-v2.css?v=20260901-2', 'profile-ranking-v2');
    loadStylesheet('/css/profile-ranking-potential.css?v=20260901-2', 'profile-ranking-potential');
    loadStylesheet('/css/candidate-profile-v2.css?v=20260901-1', 'candidate-profile-v2');
    loadStylesheet('/css/college-academics.css?v=20260901-2', 'college-academics');
    loadStylesheet('/css/mobile-overflow-fix.css?v=20260901-1', 'mobile-overflow-fix');
    loadStylesheet('/css/mobile-modal-scroll-fix.css?v=20260901-2', 'mobile-modal-scroll-fix');

    function loadCompactRecordStyles() {
        loadStylesheet('/css/mobile-records.css?v=20260901-4', 'mobile-records');
        loadStylesheet('/css/competitions.css?v=20260901-4', 'competition-compact');
    }

    function compactResearchCards() {
        const list = document.getElementById('researchList');
        if (!list) return;
        list.querySelectorAll('.research-card:not([data-compact-ready])').forEach(card => {
            card.dataset.compactReady = 'true';
            card.classList.add('research-card-compact');
            const publication = card.querySelector('.research-publication');
            const abstract = [...card.children].find(node => node.tagName === 'P' && node !== publication);
            if (abstract) {
                abstract.classList.add('research-abstract-preview');
                if ((abstract.textContent || '').trim().length > 220) {
                    abstract.classList.add('is-collapsed');
                    const toggle = document.createElement('button');
                    toggle.type = 'button';
                    toggle.className = 'research-toggle';
                    toggle.textContent = 'Show abstract';
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.addEventListener('click', () => {
                        const collapsed = abstract.classList.toggle('is-collapsed');
                        toggle.textContent = collapsed ? 'Show abstract' : 'Hide abstract';
                        toggle.setAttribute('aria-expanded', String(!collapsed));
                    });
                    abstract.after(toggle);
                }
            }
            const actions = document.createElement('div');
            actions.className = 'compact-record-actions';
            const links = card.querySelector('.project-links');
            if (links) {
                [...links.children].forEach(node => actions.appendChild(node));
                links.remove();
            }
            const itemActions = card.querySelector('.item-actions');
            if (itemActions) [...itemActions.children].forEach(node => actions.appendChild(node));
            if (actions.children.length) card.appendChild(actions);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const tabs = document.querySelector('.tabs-nav');
        if (tabs) {
            tabs.addEventListener('keydown', event => {
                if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !event.target.matches('.tab-btn')) return;
                const buttons = [...tabs.querySelectorAll('.tab-btn')];
                const i = buttons.indexOf(event.target);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                event.preventDefault();
                buttons[next].focus();
                buttons[next].click();
            });
        }

        if (document.body.classList.contains('unified-auth-shell')) loadScript('/js/login-autofill.js?v=20260901-2', 'login-autofill');

        const authenticatedWorkspace = document.body.classList.contains('student-dashboard-page') || document.body.classList.contains('admin-dashboard-page') || document.body.classList.contains('observer-shell');
        if (authenticatedWorkspace) {
            loadStylesheet('/css/portal-back-guard.css?v=20260901-1', 'portal-back-guard');
            loadScript('/js/portal-back-guard.js?v=20260901-1', 'portal-back-guard-js');
        }

        document.getElementById('notificationGateSignOut')?.addEventListener('click', () => document.getElementById('logoutBtn')?.click());

        if (document.body.classList.contains('student-dashboard-page')) {
            loadCompactRecordStyles();
            compactResearchCards();
            const researchList = document.getElementById('researchList');
            if (researchList) new MutationObserver(compactResearchCards).observe(researchList, { childList:true });
            loadScript('/js/competitions.js?v=20260901-4', 'competitions-module');
            loadScript('/js/profile-ranking.js?v=20260901-6', 'profile-ranking-module');
            loadScript('/js/college-academics-ui.js?v=20260901-2', 'college-academics-ui');
            loadStylesheet('/css/student-engagement-v1.css?v=20260902-2', 'student-engagement-v1');
            loadScript('/js/rank-target-guard.js?v=20260902-1', 'rank-target-guard-js');
            loadScript('/js/student-engagement-v3.js?v=20260902-1', 'student-engagement-v3-js');
            loadStylesheet('/css/profile-declarations.css?v=20260902-1', 'profile-declarations');
            loadScript('/js/profile-declarations-ui.js?v=20260902-1', 'profile-declarations-ui');
            loadStylesheet('/css/free-learning.css?v=20260902-3', 'free-learning-css');
            loadScript('/js/free-learning.js?v=20260902-3', 'free-learning-js');
        }

        if (document.body.classList.contains('admin-dashboard-page')) loadScript('/js/calendar-polish.js?v=20260901-1', 'calendar-polish');
        if (document.body.classList.contains('observer-shell')) loadScript('/js/dob-view-controls.js?v=20260901-2', 'dob-view-controls');
        if (document.body.classList.contains('admin-dashboard-page') || document.body.classList.contains('observer-shell')) {
            loadStylesheet('/css/staff-table-actions.css?v=20260902-1', 'staff-table-actions');
            loadScript('/js/candidate-profile-v2.js?v=20260901-2', 'candidate-profile-v2-js');
            loadScript('/js/competition-review.js?v=20260901-1', 'competition-review-module');
        }
    });
})();