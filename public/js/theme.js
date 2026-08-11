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
            button.textContent = dark ? 'Light mode' : 'Dark mode';
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
    });

    media.addEventListener('change', event => {
        if (!localStorage.getItem(storageKey)) applyTheme(event.matches ? 'dark' : 'light');
    });
})();
