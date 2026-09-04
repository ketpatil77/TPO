(function exposePushGateUtils(root) {
    function withTimeout(promise, milliseconds, message) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), milliseconds);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    function installNotificationAssurancePolicy() {
        if (typeof document === 'undefined' || !document.addEventListener) return;

        document.addEventListener('DOMContentLoaded', () => {
            if (!document.body?.classList?.contains('student-dashboard-page')) return;

            const originalCheck = typeof root.checkMandatoryNotificationAccess === 'function' ? root.checkMandatoryNotificationAccess : null;
            const originalRenderNotificationCenter = typeof root.renderNotificationCenter === 'function' ? root.renderNotificationCenter : null;
            const originalLoadStudentNotifications = typeof root.loadStudentNotifications === 'function' ? root.loadStudentNotifications : null;
            const originalMarkAllNotificationsRead = typeof root.markAllNotificationsRead === 'function' ? root.markAllNotificationsRead : null;
            let importantSyncBusy = false;
            let importantSyncTimer = null;
            let currentImportant = null;

            function notificationsSupported() {
                return 'Notification' in root && 'serviceWorker' in navigator && 'PushManager' in root;
            }

            function openWorkspace() {
                if (typeof root.startStudentWorkspace === 'function') root.startStudentWorkspace();
            }

            function neverBrowserGateWorkspace() {
                const gate = document.getElementById('mandatoryNotificationGate');
                const dashboard = document.getElementById('studentDashboard');
                if (gate) gate.hidden = true;
                document.body?.classList?.remove?.('notifications-blocked');
                if (dashboard) {
                    dashboard.inert = false;
                    dashboard.removeAttribute?.('aria-hidden');
                }
            }

            function browserSetupStatus(message, visible = true) {
                const status = document.getElementById('notificationSetupStatus');
                const text = document.getElementById('notificationSetupMessage');
                const retry = document.getElementById('retryNotificationSetup');
                if (!status || !text) return;
                status.hidden = !visible;
                text.textContent = message || '';
                if (retry) {
                    retry.hidden = !visible;
                    retry.textContent = root.Notification?.permission === 'denied' ? 'Check Chrome notification settings' : 'Enable browser alerts';
                }
            }

            function showBrowserRequirement() {
                if (!notificationsSupported()) {
                    browserSetupStatus('Browser push is unavailable on this browser. Important placement updates remain mandatory inside the portal and must be acknowledged.');
                    return;
                }
                if (root.Notification.permission === 'granted') return;
                const denied = root.Notification.permission === 'denied';
                browserSetupStatus(denied
                    ? 'Browser alerts are blocked in Chrome. Important updates will still stop for acknowledgement inside the portal. Re-enable Notifications in Chrome site settings for off-site alerts.'
                    : 'Browser alerts are required for off-site placement updates. Important updates are also mandatory inside the portal. Enable browser alerts to receive them when the portal is closed.');
            }

            root.setMandatoryNotificationGate = function setAssuredNotificationGate() {
                // Hard-blocking site content until browser notification permission is granted is
                // treated by Chrome as an abusive permission request. Mandatory delivery is instead
                // enforced through persistent push setup plus non-dismissible in-app acknowledgement.
                neverBrowserGateWorkspace();
                showBrowserRequirement();
            };

            root.checkMandatoryNotificationAccess = async function checkAssuredNotificationAccess() {
                neverBrowserGateWorkspace();
                openWorkspace();

                if (!notificationsSupported() || root.Notification.permission !== 'granted') {
                    showBrowserRequirement();
                    scheduleImportantSync(0);
                    return false;
                }

                if (!originalCheck) {
                    browserSetupStatus('', false);
                    scheduleImportantSync(0);
                    return true;
                }

                try {
                    const connected = await originalCheck();
                    if (connected) browserSetupStatus('', false);
                    return connected;
                } catch (error) {
                    browserSetupStatus(error.message || 'Browser alerts are allowed but delivery could not be connected. Retry notification setup.');
                    return false;
                } finally {
                    neverBrowserGateWorkspace();
                    scheduleImportantSync(0);
                }
            };

            root.enableMandatoryNotifications = async function enableAssuredBrowserNotifications() {
                neverBrowserGateWorkspace();
                openWorkspace();
                if (!notificationsSupported()) {
                    showBrowserRequirement();
                    return false;
                }
                if (root.Notification.permission === 'denied') {
                    showBrowserRequirement();
                    return false;
                }

                try {
                    const permission = root.Notification.permission === 'granted'
                        ? 'granted'
                        : await withTimeout(root.Notification.requestPermission(), 20000, 'Browser permission prompt did not finish.');
                    if (permission !== 'granted') {
                        showBrowserRequirement();
                        return false;
                    }
                    return await root.checkMandatoryNotificationAccess();
                } catch (error) {
                    browserSetupStatus(error.message || 'Browser alerts could not be enabled. Important in-app alerts remain mandatory.');
                    return false;
                } finally {
                    neverBrowserGateWorkspace();
                }
            };

            function ensureImportantStyle() {
                if (document.getElementById('mandatoryImportantNotificationStyle')) return;
                const style = document.createElement('style');
                style.id = 'mandatoryImportantNotificationStyle';
                style.textContent = `
                    .mandatory-important-notification{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:18px;background:rgba(5,8,14,.78);backdrop-filter:blur(8px)}
                    .mandatory-important-notification[hidden]{display:none!important}
                    .mandatory-important-card{width:min(560px,100%);max-height:min(80vh,680px);overflow:auto;border:1px solid var(--border-color,#364152);border-radius:20px;background:var(--bg-card,#171d28);color:var(--text-main,#f5f7fb);box-shadow:0 24px 70px rgba(0,0,0,.45);padding:22px}
                    .mandatory-important-kicker{display:flex;align-items:center;gap:8px;font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#ffcf66}
                    .mandatory-important-card h2{margin:10px 0 8px;font-size:clamp(1.35rem,4vw,1.8rem)}
                    .mandatory-important-card p{margin:0;color:var(--text-body,#c4cad4);line-height:1.55;overflow-wrap:anywhere}
                    .mandatory-important-meta{margin-top:14px;font-size:.82rem;color:var(--text-muted,#8f98a8)}
                    .mandatory-important-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
                    .mandatory-important-actions button:only-child{grid-column:1/-1}
                    @media(max-width:520px){.mandatory-important-notification{padding:12px;align-items:end}.mandatory-important-card{border-radius:18px;padding:18px}.mandatory-important-actions{grid-template-columns:1fr}}
                `;
                document.head.appendChild(style);
            }

            function ensureImportantModal() {
                let modal = document.getElementById('mandatoryImportantNotification');
                if (modal) return modal;
                ensureImportantStyle();
                modal = document.createElement('div');
                modal.id = 'mandatoryImportantNotification';
                modal.className = 'mandatory-important-notification';
                modal.hidden = true;
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-labelledby', 'mandatoryImportantTitle');
                modal.innerHTML = `<section class="mandatory-important-card"><div class="mandatory-important-kicker">● Important placement update <span id="mandatoryImportantCount"></span></div><h2 id="mandatoryImportantTitle"></h2><p id="mandatoryImportantMessage"></p><div id="mandatoryImportantMeta" class="mandatory-important-meta"></div><div class="mandatory-important-actions"><button id="mandatoryImportantAcknowledge" class="btn btn-secondary" type="button">Acknowledge</button><button id="mandatoryImportantOpen" class="btn btn-primary" type="button">Open update</button></div></section>`;
                document.body.appendChild(modal);

                modal.querySelector('#mandatoryImportantAcknowledge').addEventListener('click', async () => {
                    if (!currentImportant) return;
                    await acknowledgeImportant(currentImportant.id, false);
                });
                modal.querySelector('#mandatoryImportantOpen').addEventListener('click', async () => {
                    if (!currentImportant) return;
                    await acknowledgeImportant(currentImportant.id, true);
                });
                return modal;
            }

            function renderImportant(item, total) {
                const modal = ensureImportantModal();
                currentImportant = item || null;
                if (!item) {
                    modal.hidden = true;
                    return;
                }
                modal.querySelector('#mandatoryImportantCount').textContent = total > 1 ? `· ${total} unread` : '';
                modal.querySelector('#mandatoryImportantTitle').textContent = item.title || 'Important update';
                modal.querySelector('#mandatoryImportantMessage').textContent = item.message || 'Open the notification centre for details.';
                modal.querySelector('#mandatoryImportantMeta').textContent = item.created_at ? new Date(item.created_at).toLocaleString() : '';
                const open = modal.querySelector('#mandatoryImportantOpen');
                open.hidden = !item.action_url;
                modal.hidden = false;
                setTimeout(() => (open.hidden ? modal.querySelector('#mandatoryImportantAcknowledge') : open).focus(), 20);
            }

            async function fetchNotifications() {
                const token = localStorage.getItem('tpo_token');
                const response = await fetch('/api/student/workflow/notifications', {
                    cache: 'no-store',
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!response.ok) throw new Error('Could not load mandatory placement alerts.');
                return response.json();
            }

            async function syncImportantNotifications() {
                if (importantSyncBusy || document.hidden) return;
                importantSyncBusy = true;
                clearTimeout(importantSyncTimer);
                importantSyncTimer = null;
                try {
                    const result = await fetchNotifications();
                    const important = (result.data || []).filter(item => !item.read && item.priority === 'important');
                    renderImportant(important[0] || null, important.length);
                } catch (error) {
                    console.warn('Mandatory notification sync unavailable:', error.message);
                } finally {
                    importantSyncBusy = false;
                }
            }

            function scheduleImportantSync(delay = 250) {
                clearTimeout(importantSyncTimer);
                importantSyncTimer = setTimeout(syncImportantNotifications, delay);
            }

            async function acknowledgeImportant(id, openAfter) {
                const item = currentImportant;
                const token = localStorage.getItem('tpo_token');
                const response = await fetch(`/api/student/workflow/notifications/${encodeURIComponent(id)}/read`, {
                    method: 'PUT',
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!response.ok) {
                    browserSetupStatus('Could not acknowledge the important update. Check your connection and retry.');
                    return;
                }
                currentImportant = null;
                renderImportant(null, 0);
                if (typeof originalLoadStudentNotifications === 'function') {
                    try { await originalLoadStudentNotifications(); } catch (_) {}
                }
                if (openAfter && item?.action_url) {
                    const target = new URL(item.action_url, root.location.origin);
                    if (target.origin === root.location.origin) root.location.href = target.href;
                    else root.open(target.href, '_blank', 'noopener,noreferrer');
                    return;
                }
                await syncImportantNotifications();
            }

            function addBrowserAlertControl() {
                const box = document.getElementById('studentNotifications');
                if (!box || box.querySelector('[data-browser-alert-control]')) return;
                const card = document.createElement('article');
                card.className = 'notification-item';
                card.dataset.browserAlertControl = 'true';

                if (!notificationsSupported()) {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority important">Required delivery</span><h4>Browser alerts unavailable</h4></div></div><p>Important placement updates will still require acknowledgement inside the portal.</p>';
                } else if (root.Notification.permission === 'granted') {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority important">Required delivery</span><h4>Browser alerts enabled</h4></div></div><p>Important updates can reach this device outside the portal and are also tracked in-app.</p>';
                } else if (root.Notification.permission === 'denied') {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority important">Action required</span><h4>Browser alerts blocked</h4></div></div><p>Enable Notifications in Chrome site settings for off-site alerts. Important in-app updates still require acknowledgement.</p>';
                } else {
                    card.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority important">Required delivery</span><h4>Enable browser alerts</h4></div></div><p>Use browser alerts for placement updates while the portal is closed. Important in-app updates remain mandatory too.</p><div class="workflow-actions"><button class="btn btn-primary btn-sm" type="button" data-enable-browser-alerts>Enable browser alerts</button></div>';
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
                root.renderNotificationCenter = function renderAssuredNotificationCenter(...args) {
                    const result = originalRenderNotificationCenter.apply(this, args);
                    addBrowserAlertControl();
                    scheduleImportantSync(0);
                    return result;
                };
            }

            if (originalLoadStudentNotifications) {
                root.loadStudentNotifications = async function loadAssuredStudentNotifications(...args) {
                    const result = await originalLoadStudentNotifications.apply(this, args);
                    scheduleImportantSync(0);
                    return result;
                };
            }

            if (originalMarkAllNotificationsRead) {
                root.markAllNotificationsRead = async function markAllExceptMandatoryImportant(...args) {
                    await syncImportantNotifications();
                    if (currentImportant) {
                        renderImportant(currentImportant, 1);
                        return;
                    }
                    return originalMarkAllNotificationsRead.apply(this, args);
                };
            }

            neverBrowserGateWorkspace();
            showBrowserRequirement();
            scheduleImportantSync(300);
            window.setInterval(() => { if (!document.hidden) scheduleImportantSync(0); }, 30000);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleImportantSync(0); });
        }, { once: true });
    }

    const api = { withTimeout, installNotificationAssurancePolicy };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.PushGateUtils = api;
        installNotificationAssurancePolicy();
    }
})(typeof window !== 'undefined' ? window : globalThis);
