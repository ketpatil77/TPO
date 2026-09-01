(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const tabs = document.querySelector('.tabs-nav');
        if (tabs) {
            tabs.addEventListener('keydown', event => {
                if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !event.target.matches('.tab-btn')) return;
                const buttons = [...tabs.querySelectorAll('.tab-btn')]; const i = buttons.indexOf(event.target);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                event.preventDefault(); buttons[next].focus(); buttons[next].click();
            });
        }
        document.getElementById('notificationGateSignOut')?.addEventListener('click', () => document.getElementById('logoutBtn')?.click());

        if (document.body.classList.contains('student-dashboard-page') && !document.querySelector('script[data-competitions-module]')) {
            const script = document.createElement('script');
            script.src = '/js/competitions.js?v=20260901-1';
            script.defer = true;
            script.dataset.competitionsModule = 'true';
            document.body.appendChild(script);
        }
    });
})();
