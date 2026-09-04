(() => {
  if (window.__aitNotificationSettingsRecoveryInstalled) return;
  window.__aitNotificationSettingsRecoveryInstalled = true;

  const inheritedSetInterval = window.setInterval.bind(window);
  window.setInterval = function notificationSafeInterval(callback, delay, ...args) {
    const milliseconds = Number(delay);
    const source = typeof callback === 'function' ? Function.prototype.toString.call(callback) : String(callback || '');
    if (milliseconds <= 30000 && source.includes('scheduleImportantSync')) return 0;
    return inheritedSetInterval(callback, milliseconds, ...args);
  };

  const ua = () => navigator.userAgent || '';
  const isIOS = () => /iPhone|iPad|iPod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = () => /Android/i.test(ua());
  const isChrome = () => /Chrome|CriOS/i.test(ua()) && !/Edg|OPR|SamsungBrowser/i.test(ua());
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  const supportsPush = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  let recoveryOpen = false;
  let checking = false;
  let permissionStatus = null;

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

  function ensureRecovery() {
    let modal = document.getElementById('notificationSettingsRecovery');
    if (modal) return modal;

    const style = document.createElement('style');
    style.id = 'notificationSettingsRecoveryStyle';
    style.textContent = `
      .notification-settings-recovery{position:fixed;inset:0;z-index:100001;display:grid;place-items:center;padding:16px;background:rgba(4,7,12,.78);backdrop-filter:blur(7px)}
      .notification-settings-recovery[hidden]{display:none!important}
      .notification-settings-recovery-card{width:min(500px,100%);padding:20px;border:1px solid var(--border-color,#374151);border-radius:18px;background:var(--bg-card,#171d28);color:var(--text-main,#f7f8fb);box-shadow:0 24px 70px rgba(0,0,0,.45)}
      .notification-settings-recovery-icon{width:48px;height:48px;display:grid;place-items:center;margin-bottom:12px;border-radius:14px;background:rgba(243,201,105,.12);font-size:1.35rem}
      .notification-settings-recovery-card h2{margin:0 0 7px;font-size:1.3rem}.notification-settings-recovery-card p{margin:0;color:var(--text-body,#c4cad4);line-height:1.5}
      .notification-settings-help{display:none;margin-top:13px;padding:12px;border:1px solid var(--border-color,#374151);border-radius:12px;background:rgba(148,163,184,.055)}
      .notification-settings-help.is-visible{display:block}.notification-settings-help strong{display:block;margin-bottom:6px;font-size:.84rem}.notification-settings-help span{display:block;color:var(--text-body,#c4cad4);font-size:.8rem;line-height:1.45}
      .notification-settings-help b{color:var(--text-main,#f7f8fb)}
      .notification-settings-state{min-height:21px;margin-top:11px;font-size:.88rem;color:var(--text-body,#c4cad4)}
      .notification-settings-actions{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:15px}
      @media(max-width:520px){.notification-settings-recovery{align-items:end;padding:10px}.notification-settings-recovery-card{border-radius:17px}.notification-settings-actions{grid-template-columns:1fr}.notification-settings-actions .btn{width:100%}}
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
        <div class="notification-settings-recovery-icon" aria-hidden="true">🔔</div>
        <h2 id="notificationSettingsRecoveryTitle">Enable notifications</h2>
        <p id="notificationSettingsRecoveryIntro">The portal needs notification access for placement updates.</p>
        <div id="notificationSettingsHelp" class="notification-settings-help" aria-live="polite"></div>
        <div id="notificationSettingsRecoveryState" class="notification-settings-state" role="status"></div>
        <div class="notification-settings-actions">
          <button id="notificationSettingsPrimary" class="btn btn-primary" type="button">Allow notifications</button>
          <button id="notificationSettingsClose" class="btn btn-secondary" type="button">Close</button>
        </div>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelector('#notificationSettingsClose').addEventListener('click', closeRecovery);
    modal.querySelector('#notificationSettingsPrimary').addEventListener('click', primaryRecoveryAction);
    modal.addEventListener('click', event => { if (event.target === modal) closeRecovery(); });
    return modal;
  }

  function blockedHelp() {
    if (isIOS()) {
      return isStandalone()
        ? '<strong>One manual permission change is required by iPhone.</strong><span>Open <b>Settings → Apps → AIT Placement Portal → Notifications</b> and turn on <b>Allow Notifications</b>. Return here and the portal will detect it automatically.</span>'
        : '<strong>iPhone Web Push works from a Home Screen web app.</strong><span>Add AIT Placement Portal to the Home Screen first. Open it from the new icon, then tap <b>Allow notifications</b>.</span>';
    }
    if (isAndroid() && isChrome()) {
      return '<strong>Chrome will not let a website reopen a permission you already blocked.</strong><span>Tap the <b>site controls icon beside the address</b> → <b>Permissions</b> → <b>Notifications</b> → <b>Allow</b>. Return here and the portal will detect it automatically.</span>';
    }
    if (isAndroid()) {
      return '<strong>Your browser has locked this permission.</strong><span>Open this site’s permissions from the browser address bar, change <b>Notifications</b> to <b>Allow</b>, then return here.</span>';
    }
    return '<strong>The browser has locked this permission after it was blocked.</strong><span>Open the site controls beside the address bar, change <b>Notifications</b> to <b>Allow</b>, then return here.</span>';
  }

  function recoveryCopy() {
    if (isIOS() && !isStandalone()) {
      return {
        title: 'Set up iPhone notifications',
        intro: 'AIT Portal must run as a Home Screen web app before iPhone can deliver Web Push.',
        label: 'Open iPhone share menu',
        showHelp: true
      };
    }
    if ('Notification' in window && Notification.permission === 'default') {
      return {
        title: 'Enable notifications',
        intro: 'Tap below. Your browser will show its real Allow notification dialog immediately.',
        label: 'Allow notifications',
        showHelp: false
      };
    }
    if ('Notification' in window && Notification.permission === 'denied') {
      return {
        title: 'Notifications are blocked',
        intro: 'This permission was denied earlier. Browsers intentionally prevent websites from forcing that permission screen open again.',
        label: 'I allowed it · Check now',
        showHelp: true
      };
    }
    return {
      title: 'Enable notifications',
      intro: 'Connect this device to placement notifications.',
      label: 'Enable notifications',
      showHelp: false
    };
  }

  function refreshRecovery(message = '') {
    const modal = ensureRecovery();
    const copy = recoveryCopy();
    const help = modal.querySelector('#notificationSettingsHelp');
    modal.querySelector('#notificationSettingsRecoveryTitle').textContent = copy.title;
    modal.querySelector('#notificationSettingsRecoveryIntro').textContent = copy.intro;
    modal.querySelector('#notificationSettingsPrimary').textContent = copy.label;
    if (help) {
      help.classList.toggle('is-visible', Boolean(copy.showHelp));
      help.innerHTML = copy.showHelp ? blockedHelp() : '';
    }
    if (message) modal.querySelector('#notificationSettingsRecoveryState').textContent = message;
  }

  function openRecovery(message = '') {
    const modal = ensureRecovery();
    recoveryOpen = true;
    modal.hidden = false;
    refreshRecovery(message);
    setTimeout(() => modal.querySelector('#notificationSettingsPrimary')?.focus(), 20);
  }

  function closeRecovery() {
    recoveryOpen = false;
    const modal = document.getElementById('notificationSettingsRecovery');
    if (modal) modal.hidden = true;
  }

  async function connectNotifications() {
    if (checking) return false;
    checking = true;
    const modal = document.getElementById('notificationSettingsRecovery');
    const state = modal?.querySelector('#notificationSettingsRecoveryState');
    const button = modal?.querySelector('#notificationSettingsPrimary');
    if (button) { button.disabled = true; button.textContent = 'Connecting…'; }
    try {
      if (Notification.permission !== 'granted') return false;
      if (state) state.textContent = 'Permission allowed. Connecting this device…';
      const connected = typeof window.checkMandatoryNotificationAccess === 'function'
        ? await window.checkMandatoryNotificationAccess()
        : true;
      closeRecovery();
      if (connected !== false) hideStatus();
      else setStatus('Notification permission is allowed. Delivery is reconnecting.', 'Retry notification setup');
      return connected !== false;
    } catch (error) {
      const message = error?.message || 'Permission is allowed, but delivery could not reconnect yet.';
      if (state) state.textContent = message;
      setStatus(message, 'Retry notification setup');
      return false;
    } finally {
      checking = false;
      if (button) { button.disabled = false; refreshRecovery(); }
    }
  }

  async function requestNativePermission() {
    if (Notification.permission === 'denied') return false;
    if (typeof window.enableMandatoryNotifications === 'function') {
      await window.enableMandatoryNotifications();
    } else {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return false;
    }
    return Notification.permission === 'granted' ? connectNotifications() : false;
  }

  async function openIosHomeScreenFlow() {
    const state = document.getElementById('notificationSettingsRecoveryState');
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AIT Placement Portal', text: 'Add AIT Placement Portal to your Home Screen for placement notifications.', url: location.href });
        if (state) state.textContent = 'Add the portal to the Home Screen, then open it from its new icon.';
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    if (state) state.textContent = 'Open the browser Share menu and add AIT Placement Portal to the Home Screen.';
  }

  async function recheckPermission({ announce = false } = {}) {
    if (!supportsPush()) return false;
    if (Notification.permission === 'granted') return connectNotifications();
    if (Notification.permission === 'default') {
      refreshRecovery(announce ? 'Permission is ready to be requested. Tap Allow notifications.' : '');
      return false;
    }
    refreshRecovery(announce ? 'Still blocked. Change the site permission to Allow, then return here.' : '');
    return false;
  }

  async function primaryRecoveryAction() {
    if (isIOS() && !isStandalone()) {
      await openIosHomeScreenFlow();
      return;
    }
    if (!supportsPush()) {
      openRecovery('This browser cannot receive Web Push. Use current Safari, Chrome, or Edge.');
      return;
    }
    if (Notification.permission === 'granted') {
      await connectNotifications();
      return;
    }
    if (Notification.permission === 'default') {
      await requestNativePermission();
      if (Notification.permission !== 'granted') openRecovery('Permission was not allowed. The browser now requires a manual permission change.');
      return;
    }
    await recheckPermission({ announce: true });
  }

  async function smartRecovery() {
    if (isIOS() && !isStandalone()) {
      openRecovery();
      return false;
    }
    if (!supportsPush()) {
      openRecovery('This browser cannot receive Web Push notifications.');
      return false;
    }
    if (Notification.permission === 'granted') return connectNotifications();
    if (Notification.permission === 'default') return requestNativePermission();
    openRecovery();
    return false;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#retryNotificationSetup, #enableMandatoryNotifications');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    smartRecovery();
  }, true);

  async function recheckOnReturn() {
    if (!supportsPush()) return;
    if (Notification.permission === 'granted') {
      await connectNotifications();
      return;
    }
    if (recoveryOpen) refreshRecovery();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) recheckOnReturn(); });
  window.addEventListener('focus', recheckOnReturn);
  window.addEventListener('pageshow', recheckOnReturn);

  try {
    navigator.permissions?.query?.({ name: 'notifications' }).then(permission => {
      permissionStatus = permission;
      permission.addEventListener?.('change', () => {
        if (permission.state === 'granted') recheckOnReturn();
        else if (recoveryOpen) refreshRecovery();
      });
    }).catch(() => {});
  } catch (_) {}
})();
