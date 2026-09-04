(() => {
  if (window.__aitNotificationSettingsRecoveryInstalled) return;
  window.__aitNotificationSettingsRecoveryInstalled = true;

  // The mandatory in-app alert layer used to wake the Worker every 30 seconds.
  // Push now carries realtime updates, so suppress that legacy timer before
  // DOMContentLoaded installs it. Visibility/focus and push events still catch up.
  const inheritedSetInterval = window.setInterval.bind(window);
  window.setInterval = function notificationSafeInterval(callback, delay, ...args) {
    const milliseconds = Number(delay);
    const source = typeof callback === 'function' ? Function.prototype.toString.call(callback) : String(callback || '');
    if (milliseconds <= 30000 && source.includes('scheduleImportantSync')) return 0;
    return inheritedSetInterval(callback, milliseconds, ...args);
  };

  const supported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const isAndroid = () => /Android/i.test(navigator.userAgent || '');
  let guideOpen = false;
  let checking = false;

  function statusElements() {
    return {
      box: document.getElementById('notificationSetupStatus'),
      text: document.getElementById('notificationSetupMessage'),
      retry: document.getElementById('retryNotificationSetup')
    };
  }

  function setStatus(message, actionLabel = '') {
    const { box, text, retry } = statusElements();
    if (box) box.hidden = false;
    if (text) text.textContent = message;
    if (retry && actionLabel) retry.textContent = actionLabel;
  }

  function hideStatus() {
    const { box } = statusElements();
    if (box) box.hidden = true;
  }

  function ensureGuide() {
    let modal = document.getElementById('notificationSettingsRecovery');
    if (modal) return modal;

    const style = document.createElement('style');
    style.id = 'notificationSettingsRecoveryStyle';
    style.textContent = `
      .notification-settings-recovery{position:fixed;inset:0;z-index:100001;display:grid;place-items:center;padding:16px;background:rgba(4,7,12,.78);backdrop-filter:blur(7px)}
      .notification-settings-recovery[hidden]{display:none!important}
      .notification-settings-recovery-card{width:min(520px,100%);max-height:min(84vh,720px);overflow:auto;padding:20px;border:1px solid var(--border-color,#374151);border-radius:18px;background:var(--bg-card,#171d28);color:var(--text-main,#f7f8fb);box-shadow:0 24px 70px rgba(0,0,0,.45)}
      .notification-settings-recovery-card h2{margin:0 0 8px;font-size:1.35rem}.notification-settings-recovery-card p{margin:0;color:var(--text-body,#c4cad4);line-height:1.5}
      .notification-settings-steps{margin:16px 0;padding-left:22px;color:var(--text-main,#f7f8fb);line-height:1.55}.notification-settings-steps li+li{margin-top:8px}
      .notification-settings-note{padding:10px 12px;border:1px solid var(--border-color,#374151);border-radius:12px;background:rgba(255,255,255,.035);font-size:.9rem}
      .notification-settings-state{min-height:22px;margin-top:12px;font-size:.9rem;color:var(--text-body,#c4cad4)}
      .notification-settings-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
      @media(max-width:520px){.notification-settings-recovery{align-items:end;padding:10px}.notification-settings-recovery-card{border-radius:16px}.notification-settings-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.id = 'notificationSettingsRecovery';
    modal.className = 'notification-settings-recovery';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'notificationSettingsRecoveryTitle');
    modal.innerHTML = `
      <section class="notification-settings-recovery-card">
        <h2 id="notificationSettingsRecoveryTitle">Allow Chrome notifications</h2>
        <p id="notificationSettingsRecoveryIntro"></p>
        <ol id="notificationSettingsRecoverySteps" class="notification-settings-steps"></ol>
        <div class="notification-settings-note">Chrome does not let a website silently undo a blocked permission. After you change it to <strong>Allow</strong>, come back here and the portal will reconnect delivery automatically.</div>
        <div id="notificationSettingsRecoveryState" class="notification-settings-state" role="status"></div>
        <div class="notification-settings-actions">
          <button id="notificationSettingsCheckAgain" class="btn btn-primary" type="button">I've allowed it · Check again</button>
          <button id="notificationSettingsClose" class="btn btn-secondary" type="button">Close</button>
        </div>
      </section>`;
    document.body.appendChild(modal);

    modal.querySelector('#notificationSettingsClose').addEventListener('click', () => closeGuide());
    modal.querySelector('#notificationSettingsCheckAgain').addEventListener('click', () => checkAgain(true));
    modal.addEventListener('click', event => { if (event.target === modal) closeGuide(); });
    return modal;
  }

  function fillGuide() {
    const modal = ensureGuide();
    const intro = modal.querySelector('#notificationSettingsRecoveryIntro');
    const steps = modal.querySelector('#notificationSettingsRecoverySteps');
    if (isAndroid()) {
      intro.textContent = 'Notifications are blocked for this portal in Chrome. Use the site controls beside the address bar to allow them.';
      steps.innerHTML = '<li>Tap the site-controls / tune icon beside the portal address.</li><li>Open <strong>Permissions</strong> or <strong>Site settings</strong>.</li><li>Open <strong>Notifications</strong> and choose <strong>Allow</strong>.</li><li>Return to this portal. We will check the permission again automatically.</li>';
    } else {
      intro.textContent = 'Notifications are blocked for this portal in Chrome. Change the permission for this site, not Chrome globally.';
      steps.innerHTML = '<li>Click the site-controls icon to the left of the portal address.</li><li>Open <strong>Site settings</strong>.</li><li>Set <strong>Notifications</strong> to <strong>Allow</strong>.</li><li>Return to this tab. We will reconnect notification delivery automatically.</li>';
    }
  }

  function openGuide() {
    const modal = ensureGuide();
    fillGuide();
    guideOpen = true;
    modal.hidden = false;
    const state = modal.querySelector('#notificationSettingsRecoveryState');
    if (state) state.textContent = 'Current Chrome permission: Blocked';
    setTimeout(() => modal.querySelector('#notificationSettingsCheckAgain')?.focus(), 20);
  }

  function closeGuide() {
    const modal = document.getElementById('notificationSettingsRecovery');
    guideOpen = false;
    if (modal) modal.hidden = true;
  }

  async function connectNotifications() {
    if (checking) return false;
    checking = true;
    const modal = document.getElementById('notificationSettingsRecovery');
    const state = modal?.querySelector('#notificationSettingsRecoveryState');
    const button = modal?.querySelector('#notificationSettingsCheckAgain');
    if (button) { button.disabled = true; button.textContent = 'Checking…'; }
    try {
      if (Notification.permission !== 'granted') return false;
      if (state) state.textContent = 'Permission allowed. Connecting this device…';
      const connected = typeof window.checkMandatoryNotificationAccess === 'function'
        ? await window.checkMandatoryNotificationAccess()
        : true;
      closeGuide();
      if (connected !== false) hideStatus();
      else setStatus('Chrome permission is allowed. Notification delivery is reconnecting; use Retry if this message remains.', 'Retry notification setup');
      return connected !== false;
    } catch (error) {
      const message = error?.message || 'Chrome permission is allowed, but delivery could not reconnect yet.';
      if (state) state.textContent = message;
      setStatus(message, 'Retry notification setup');
      return false;
    } finally {
      checking = false;
      if (button) { button.disabled = false; button.textContent = "I've allowed it · Check again"; }
    }
  }

  async function checkAgain(fromButton = false) {
    if (!supported()) {
      setStatus('This browser does not support the required notification features.', 'Check notification help');
      return false;
    }
    if (Notification.permission === 'granted') return connectNotifications();
    if (Notification.permission === 'default') {
      if (typeof window.enableMandatoryNotifications === 'function') {
        await window.enableMandatoryNotifications();
        if (Notification.permission === 'granted') return connectNotifications();
      }
      return false;
    }
    const state = document.querySelector('#notificationSettingsRecoveryState');
    if (state && fromButton) state.textContent = 'Still blocked. Set Notifications to Allow in Chrome, then return here.';
    openGuide();
    return false;
  }

  // Capture the status-card button before the old no-op denied-permission handler.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#retryNotificationSetup');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!supported()) {
      setStatus('This browser cannot receive Web Push notifications.', 'Check notification help');
      openGuide();
      return;
    }
    if (Notification.permission === 'denied') {
      openGuide();
      return;
    }
    checkAgain(true);
  }, true);

  async function recheckOnReturn() {
    if (!supported() || Notification.permission !== 'granted') return;
    const statusVisible = !statusElements().box?.hidden;
    if (!guideOpen && !statusVisible) return;
    await connectNotifications();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) recheckOnReturn(); });
  window.addEventListener('focus', recheckOnReturn);

  // Permissions API gives an immediate callback in browsers that support it.
  try {
    navigator.permissions?.query?.({ name: 'notifications' }).then(permission => {
      permission.addEventListener?.('change', () => {
        if (permission.state === 'granted') recheckOnReturn();
      });
    }).catch(() => {});
  } catch (_) { /* permission state is still checked on focus/visibility */ }
})();
