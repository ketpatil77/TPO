(() => {
    function loadCompactRecordStyles() {
        if (!document.querySelector('link[data-mobile-records]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/mobile-records.css?v=20260901-3';
            link.dataset.mobileRecords = 'true';
            document.head.appendChild(link);
        }
        if (!document.querySelector('link[data-competition-compact]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/competitions.css?v=20260901-3';
            link.dataset.competitionCompact = 'true';
            document.head.appendChild(link);
        }
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

        document.getElementById('notificationGateSignOut')?.addEventListener('click', () => document.getElementById('logoutBtn')?.click());

        if (document.body.classList.contains('student-dashboard-page')) {
            loadCompactRecordStyles();
            compactResearchCards();
            const researchList = document.getElementById('researchList');
            if (researchList) new MutationObserver(compactResearchCards).observe(researchList, { childList: true });

            if (!document.querySelector('script[data-competitions-module]')) {
                const script = document.createElement('script');
                script.src = '/js/competitions.js?v=20260901-3';
                script.defer = true;
                script.dataset.competitionsModule = 'true';
                script.addEventListener('load', loadCompactRecordStyles);
                document.body.appendChild(script);
            }
        }
    });
})();
