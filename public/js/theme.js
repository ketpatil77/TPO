(function () {
    const storageKey = 'tpo-theme';
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function preferredTheme() {
        const saved = localStorage.getItem(storageKey);
        return saved === 'light' || saved === 'dark' ? saved : (media.matches ? 'dark' : 'light');
    }

    function applyTheme(theme) {
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
        document.querySelectorAll('[data-theme-toggle]').forEach(button => {
            const dark = theme === 'dark';
            button.innerHTML = dark
                ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 19a1 1 0 0 1-1-1v-2a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1zM4.93 4.93a1 1 0 0 1 1.41 0l1.42 1.41a1 1 0 1 1-1.42 1.42L4.93 6.34a1 1 0 0 1 0-1.41zm12.73 12.73a1 1 0 0 1 1.41 0l1.42 1.42a1 1 0 1 1 1.41 1.41l-1.41-1.41a1 1 0 0 1 0-1.42zM3 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm19 0a1 1 0 0 1-1 1h-2a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1zM6.34 17.66a1 1 0 0 1 0 1.41l-1.41 1.42a1 1 0 1 1-1.42-1.42l1.41-1.41a1 1 0 0 1 1.42 0zm12.73-12.73a1 1 0 0 1 0 1.42l-1.42 1.41a1 1 0 1 1-1.41-1.42l1.41-1.41a1 1 0 0 1 1.42 0z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
            button.setAttribute('aria-pressed', String(dark));
        });
    }

    function fixStudentNavbar() {
        if (!document.body.classList.contains('student-dashboard-page')) return;
        const nav = document.querySelector('.navbar-inner');
        if (!nav) return;
        const left = nav.children[0];
        const right = nav.children[1];
        if (!left || !right) return;

        /* The old KP/PRN pill is removed as a whole so it cannot reserve blank space. */
        const avatar = document.getElementById('navStudentAvatar');
        if (avatar) {
            const chip = avatar.closest('div[style*="border-radius"]') || avatar.parentElement;
            if (chip && chip.parentElement === right) chip.remove();
        }
        const prn = document.getElementById('navStudentPrn');
        if (prn) prn.remove();

        /* Use the recovered KP space: title gets flexible room and the action group moves left. */
        nav.style.setProperty('display', 'flex', 'important');
        nav.style.setProperty('flex-flow', 'row nowrap', 'important');
        nav.style.setProperty('align-items', 'center', 'important');
        nav.style.setProperty('justify-content', 'space-between', 'important');
        nav.style.setProperty('width', '100%', 'important');
        nav.style.setProperty('max-width', 'none', 'important');
        nav.style.setProperty('padding', '0 18px', 'important');
        nav.style.setProperty('gap', '12px', 'important');
        nav.style.setProperty('overflow', 'hidden', 'important');

        left.style.setProperty('flex', '1 1 auto', 'important');
        left.style.setProperty('min-width', '0', 'important');
        left.style.setProperty('max-width', 'none', 'important');
        left.style.setProperty('overflow', 'hidden', 'important');

        const titleBlock = left.querySelector(':scope > div:last-child');
        if (titleBlock) {
            titleBlock.style.setProperty('min-width', '0', 'important');
            titleBlock.style.setProperty('overflow', 'visible', 'important');
            const title = titleBlock.querySelector(':scope > div:first-child');
            if (title) {
                title.style.setProperty('white-space', 'nowrap', 'important');
                title.style.setProperty('overflow', 'visible', 'important');
                title.style.setProperty('text-overflow', 'clip', 'important');
            }
        }

        right.style.setProperty('flex', '0 0 auto', 'important');
        right.style.setProperty('width', 'auto', 'important');
        right.style.setProperty('min-width', '0', 'important');
        right.style.setProperty('max-width', 'none', 'important');
        right.style.setProperty('overflow', 'visible', 'important');
        right.style.setProperty('gap', '8px', 'important');
        right.style.setProperty('margin-right', '28px', 'important');

        const logout = document.getElementById('logoutBtn');
        if (logout) {
            logout.style.setProperty('width', '104px', 'important');
            logout.style.setProperty('min-width', '104px', 'important');
            logout.style.setProperty('max-width', '104px', 'important');
            logout.style.setProperty('height', '36px', 'important');
            logout.style.setProperty('display', 'flex', 'important');
            logout.style.setProperty('align-items', 'center', 'important');
            logout.style.setProperty('justify-content', 'center', 'important');
            logout.style.setProperty('white-space', 'nowrap', 'important');
            logout.style.setProperty('overflow', 'visible', 'important');
            logout.style.setProperty('margin', '0', 'important');
            logout.style.setProperty('padding', '5px 8px', 'important');
        }
    }

    applyTheme(preferredTheme());

    document.addEventListener('DOMContentLoaded', () => {
        const nav = document.querySelector('.navbar-inner');
        let toggleBtn = nav ? nav.querySelector('[data-theme-toggle]') : null;
        if (nav && !toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'theme-toggle';
            toggleBtn.dataset.themeToggle = '';
            nav.appendChild(toggleBtn);
        }
        document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
                localStorage.setItem(storageKey, next);
                applyTheme(next);
            });
        });
        applyTheme(root.dataset.theme || preferredTheme());
        fixStudentNavbar();
        requestAnimationFrame(fixStudentNavbar);
        setTimeout(fixStudentNavbar, 250);

        document.querySelectorAll('.tabs-nav[role="tablist"]').forEach(tablist => {
            const tabs = [...tablist.querySelectorAll('[role="tab"]')];
            tabs.forEach((tab, index) => {
                tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
                tab.addEventListener('keydown', event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                    tabs[next].focus();
                    tabs[next].click();
                    tabs.forEach(item => { item.tabIndex = item === tabs[next] ? 0 : -1; });
                });
            });
        });
    });

    media.addEventListener('change', event => {
        if (!localStorage.getItem(storageKey)) applyTheme(event.matches ? 'dark' : 'light');
    });
})();