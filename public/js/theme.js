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
            button.textContent = dark ? 'Light' : 'Dark';
            button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
            button.setAttribute('aria-pressed', String(dark));
        });
    }

    applyTheme(preferredTheme());

    document.addEventListener('DOMContentLoaded', () => {
        const nav = document.querySelector('.navbar-inner');
        if (nav && !nav.querySelector('[data-theme-toggle]')) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'theme-toggle';
            button.dataset.themeToggle = '';
            button.addEventListener('click', () => {
                const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
                localStorage.setItem(storageKey, next);
                applyTheme(next);
            });
            nav.appendChild(button);
        }
        applyTheme(root.dataset.theme || preferredTheme());

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
