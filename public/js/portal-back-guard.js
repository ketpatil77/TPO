(() => {
    const configs = [
        {
            bodyClass: 'student-dashboard-page',
            homeTrigger: () => document.querySelector('.tabs-nav [aria-controls="tab-overview"]'),
            logoutButton: () => document.getElementById('logoutBtn'),
            prepareHome: () => {}
        },
        {
            bodyClass: 'admin-dashboard-page',
            homeTrigger: () => document.querySelector('.admin-tabs [aria-controls="tab-analytics"]'),
            logoutButton: () => document.getElementById('adminLogoutBtn'),
            prepareHome: () => {}
        },
        {
            bodyClass: 'observer-shell',
            homeTrigger: () => document.querySelector('.observer-tabs .tab-btn[data-tab="students"]'),
            logoutButton: () => document.getElementById('observerLogout'),
            prepareHome: () => {
                const overview = document.querySelector('.observer-overview-disclosure');
                if (overview) overview.open = true;
            }
        }
    ];

    let config = null;
    let backStage = 0;
    let installed = false;
    let leavingByChoice = false;
    let hintTimer = null;

    function roleConfig() {
        return configs.find(item => document.body.classList.contains(item.bodyClass)) || null;
    }

    function isHome() {
        const trigger = config?.homeTrigger();
        if (!trigger) return true;
        return trigger.classList.contains('active') || trigger.getAttribute('aria-selected') === 'true';
    }

    function goHome() {
        const trigger = config?.homeTrigger();
        config?.prepareHome?.();
        if (trigger && !isHome()) trigger.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function ensureHistoryGuard() {
        const current = history.state && typeof history.state === 'object' ? history.state : {};
        history.replaceState({ ...current, portalBackBase: true }, document.title, location.href);
        history.pushState({ ...current, portalBackGuard: true }, document.title, location.href);
    }

    function rearmHistoryGuard() {
        if (leavingByChoice) return;
        const current = history.state && typeof history.state === 'object' ? history.state : {};
        history.pushState({ ...current, portalBackGuard: true }, document.title, location.href);
    }

    function buildUi() {
        if (document.getElementById('portalLogoutConfirm')) return;

        const modal = document.createElement('div');
        modal.id = 'portalLogoutConfirm';
        modal.className = 'portal-logout-confirm';
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'portalLogoutTitle');
        modal.innerHTML = `
            <section class="portal-logout-card" role="document">
                <span class="eyebrow">Leave workspace?</span>
                <h2 id="portalLogoutTitle">Do you want to sign out?</h2>
                <p>Your session will stay active unless you choose Yes.</p>
                <div class="portal-logout-actions">
                    <button id="portalLogoutNo" class="btn btn-secondary" type="button">No, stay</button>
                    <button id="portalLogoutYes" class="btn btn-danger" type="button">Yes, sign out</button>
                </div>
            </section>`;
        document.body.appendChild(modal);

        const hint = document.createElement('div');
        hint.id = 'portalBackHint';
        hint.className = 'portal-back-hint';
        hint.hidden = true;
        hint.setAttribute('role', 'status');
        hint.setAttribute('aria-live', 'polite');
        hint.textContent = 'Press back again to sign out';
        document.body.appendChild(hint);

        document.getElementById('portalLogoutNo').addEventListener('click', closeConfirm);
        document.getElementById('portalLogoutYes').addEventListener('click', () => {
            leavingByChoice = true;
            hideHint();
            modal.hidden = true;
            const button = config?.logoutButton();
            if (button) button.click();
            else window.location.href = '/';
        });
        modal.addEventListener('click', event => {
            if (event.target === modal) closeConfirm();
        });
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeConfirm();
            }
        });
    }

    function showHint() {
        const hint = document.getElementById('portalBackHint');
        if (!hint) return;
        clearTimeout(hintTimer);
        hint.hidden = false;
        hintTimer = setTimeout(() => { hint.hidden = true; }, 2200);
    }

    function hideHint() {
        clearTimeout(hintTimer);
        const hint = document.getElementById('portalBackHint');
        if (hint) hint.hidden = true;
    }

    function showConfirm() {
        hideHint();
        const modal = document.getElementById('portalLogoutConfirm');
        if (!modal) return;
        modal.hidden = false;
        document.getElementById('portalLogoutNo')?.focus();
    }

    function closeConfirm() {
        const modal = document.getElementById('portalLogoutConfirm');
        if (modal) modal.hidden = true;
        backStage = 0;
        config?.homeTrigger()?.focus({ preventScroll: true });
    }

    function closeOpenWorkspaceModal() {
        const openModal = [...document.querySelectorAll('.modal-backdrop.active')]
            .find(node => node.id !== 'portalLogoutConfirm');
        if (!openModal) return false;
        const closeButton = openModal.querySelector('.close-btn, button[aria-label="Close"]');
        if (closeButton) closeButton.click();
        else openModal.classList.remove('active');
        return true;
    }

    function handleBack() {
        if (leavingByChoice) return;
        rearmHistoryGuard();

        const confirm = document.getElementById('portalLogoutConfirm');
        if (confirm && !confirm.hidden) {
            closeConfirm();
            return;
        }

        if (closeOpenWorkspaceModal()) {
            backStage = 0;
            return;
        }

        if (!isHome()) {
            goHome();
            backStage = 1;
            showHint();
            return;
        }

        if (backStage === 0) {
            backStage = 1;
            showHint();
            return;
        }

        backStage = 0;
        showConfirm();
    }

    function install() {
        if (installed) return;
        config = roleConfig();
        if (!config) return;
        installed = true;
        buildUi();
        ensureHistoryGuard();

        window.addEventListener('popstate', handleBack);
        window.addEventListener('pageshow', event => {
            if (event.persisted && !leavingByChoice) {
                backStage = 0;
                ensureHistoryGuard();
            }
        });

        document.addEventListener('click', event => {
            const tab = event.target.closest('.tab-btn');
            if (!tab) return;
            if (tab !== config.homeTrigger()) backStage = 0;
            hideHint();
        }, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
})();
