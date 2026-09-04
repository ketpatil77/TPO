(function exposePushGateUtils(root) {
    function withTimeout(promise, milliseconds, message) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), milliseconds);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    function installRespectfulNotificationPolicy() {
        if (typeof document === 'undefined' || !document.addEventListener) return;

        document.addEventListener('DOMContentLoaded', () => {
            if (!document.body?.classList?.contains('student-dashboard-page')) return;

            const originalCheck = typeof root.checkMandatoryNotificationAccess === 'function'
                ? root.checkMandatoryNotificationAccess
                : null;
            const originalRenderNotificationCenter = typeof root.renderNotificationCenter === 'function'
                ? root.renderNotificationCenter
                : null;

            function notificationsSupported() {
                return 'Notification' in root && 'serviceWorker' in navigator && 'PushManager' in root;
            }

            function openWorkspace() {
                if (typeof root.startStudentWorkspace === 'function') root.startStudentWorkspace();
            }

            function neverBlockWorkspace() {
                const gate = document.getElementById('mandatoryNotificationGate');
                const dashboard = document.getElementById('studentDashboard');
                if (gate) gate.hidden = true;
                document.body?.classList?.remove?.('notifications-blocked');
                if (dashboard) {
                    dashboard.inert = false;
                    dashboard.removeAttribute?.('aria-hidden');
                }
            }

            function hidePassiveSetupStatus() {
                const status = document.getElementById('notificationSetupStatus');
                if (status && root.Notification?.permission !== 'granted') status.hidden = true;
            }

            // Chrome treats coercive notification permission flows as abusive. Browser push is
            // therefore an optional enhancement. The in-app notification centre always works.
            root.setMandatoryNotificationGate = function setOptionalNotificationGate() {
                neverBlockWorkspace();
            };

            root.checkMandatoryNotificationAccess = async function checkOptionalNotificationAccess() {
                neverBlockWorkspace();
                openWorkspace();

                if (!notificationsSupported() || root.Notification.permission !== 'granted') {
                    hidePassiveSetupStatus();
                    return false;
                }

                if (!originalCheck) return true;
                try {
                    return await originalCheck();
                } finally {
                    neverBlockWorkspace();
                }
            };

            root.enableMandatoryNotifications = async function enableOptionalBrowserNotifications() {
                neverBlockWorkspace();
                openWorkspace();
                if (!notificationsSupported()) return false;

                try {
                    const permission = root.Notification.permission === 'granted'
                        ? 'granted'
                        : await withTimeout(root.Notification.requestPermission(), 20000, 'Browser permission prompt did not finish.');
                    if (permission !== 'granted') return false;
                    return await root.checkMandatoryNotificationAccess();
                } catch (error) {
                    const status = document.getElementById('notificationSetupStatus');
                    const message = document.getElementById('notificationSetupMessage');
                    if (status && root.Notification.permission === 'granted') status.hidden = false;
                    if (message && root.Notification.permission === 'granted') message.textContent = error.message || 'Browser alerts could not be connected.';
                    return false;
                } finally {
                    neverBlockWorkspace();
                }
            };

            function addBrowserAlertControl() {
                const box = document.getElementById('studentNotifications');
                if (!box || box.querySelector('[data-browser-alert-control]')) return;

                const card = document.createElement('article');
                card.className = 'notification-item';
                card.dataset.browserAlertControl = 'true';

                if (!notificationsSupported()) {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority">Browser alerts</span><h4>Not supported on this browser</h4></div></div><p>In-app notifications continue to work normally.</p>';
                } else if (root.Notification.permission === 'granted') {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority">Browser alerts</span><h4>Enabled on this device</h4></div></div><p>Important portal updates can appear outside the portal. In-app notifications remain the complete record.</p>';
                } else if (root.Notification.permission === 'denied') {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority">Browser alerts</span><h4>Blocked in browser settings</h4></div></div><p>In-app notifications continue normally. Browser alerts can be enabled later from Chrome site settings.</p>';
                } else {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority">Optional</span><h4>Browser alerts are off</h4></div></div><p>In-app notifications already work. Enable browser alerts only if you also want important updates outside the portal.</p><div class="workflow-actions"><button class="btn btn-secondary btn-sm" type="button" data-enable-browser-alerts>Enable browser alerts</button></div>';
                    card.querySelector('[data-enable-browser-alerts]')?.addEventListener('click', async event => {
                        const button = event.currentTarget;
                        button.disabled = true;
                        button.textContent = 'Checking…';
                        await root.enableMandatoryNotifications();
                        if (typeof root.renderNotificationCenter === 'function') root.renderNotificationCenter();
                    });
                }

                box.prepend(card);
            }

            if (originalRenderNotificationCenter) {
                root.renderNotificationCenter = function renderNotificationCenterWithBrowserControl(...args) {
                    const result = originalRenderNotificationCenter.apply(this, args);
                    addBrowserAlertControl();
                    return result;
                };
            }

            neverBlockWorkspace();
        }, { once: true });
    }

    const api = { withTimeout, installRespectfulNotificationPolicy };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.PushGateUtils = api;
        installRespectfulNotificationPolicy();
    }
})(typeof window !== 'undefined' ? window : globalThis);
