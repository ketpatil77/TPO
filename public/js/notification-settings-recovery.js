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
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  const supportsPush = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  let recoveryOpen = false;
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

  function ensureRecovery() {
    let modal = document.getElementById('notificationSettingsRecovery');
    if (modal) return modal;

    const style = document.createElement('style');
    style.id = 'notificationSettingsRecoveryStyle';
    style.textContent = `
      .notification-settings-recovery{position:fixed;inset:0;z-index:100001;display:grid;place-items:center;padding:16px;background:rgba(4,7,12,.78);backdrop-filter:blur(7px)}
      .notification-settings-recovery[hidden]{display:none!important}
      .notification-settings-recovery-card{width:min(470px,100%);padding:20px;border:1px solid var(--border-color,#374151);border-radius:18px;background:var(--bg-card,#171d28);color:var(--text-main,#f7f8fb);box-shadow:0 24px 70px rgba(0,0,0,.45)}
      .notification-settings-recovery-icon{width:48px;height:48px;display:grid;place-items:center;margin-bottom:12px;border-radius:14px;background:rgba(243,201,105,.12);font-size:1.35rem}
      .notification-settings-recovery-card h2{margin:0 0 7px;font-size:1.3rem}.notification-settings-recovery-card p{margin:0;color:var(--text-body,#c4cad4);line-height:1.5}
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

  function recoveryCopy() {
    if (isIOS() && !isStandalone()) {
      return {
        title: 'Set up iPhone notifications',
        intro: 'AIT Portal must be added to the Home Screen before iPhone can deliver Web Push notifications.',
        label: 'Open iPhone setup'
      };
    }
    if ('Notification' in window && Notification.permission === 'default') {
      return {
        title: 'Enable notifications',
        intro: 'Tap below and your browser will show its native Allow notification dialog.',
        label: 'Allow notifications'
      };
    }
    if ('Notification' in window && Notification.permission === 'denied') {
      return {
        title: 'Notifications are blocked',
        intro: 'The browser has already blocked this site, so the native Allow dialog cannot be shown again until the permission is reset.',
        label: isIOS() ? 'Open notification settings' : 'Open site settings'
      };
    }
    return {
      title: 'Enable notifications',
      intro: 'Connect this device to placement notifications.',
      label: 'Enable notifications'
    };
  }

  function openRecovery(message = '') {
    const modal = ensureRecovery();
    const copy = recoveryCopy();
    recoveryOpen = true;
    modal.hidden = false;
    modal.querySelector('#notificationSettingsRecoveryTitle').textContent = copy.title;
    modal.querySelector('#notificationSettingsRecoveryIntro').textContent = copy.intro;
    modal.querySelector('#notificationSettingsPrimary').textContent = copy.label;
    modal.querySelector('#notificationSettingsRecoveryState').textContent = message;
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
      if (button) { button.disabled = false; button.textContent = recoveryCopy().label; }
    }
  }

  async function requestNativePermission() {
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
        if (state) state.textContent = 'Choose “Add to Home Screen”, then open AIT Portal and tap Allow notifications.';
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    if (state) state.textContent = 'Use Safari Share → Add to Home Screen, then open AIT Portal.';
  }

  function tryOpenBrowserSiteSettings() {
    const state = document.getElementById('notificationSettingsRecoveryState');
    const settingsUrl = `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}`;
    let leftPage = false;
    const markLeft = () => { leftPage = true; };
    window.addEventListener('blur', markLeft, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) leftPage = true; }, { once: true });
    try { window.open(settingsUrl, '_blank', 'noopener'); } catch (_) { /* fallback below */ }
    setTimeout(() => {
      if (!leftPage && state) state.textContent = 'Chrome blocked automatic settings opening. Tap the site controls beside the address and set Notifications to Allow.';
      else if (state) state.textContent = 'Set Notifications to Allow, then return here.';
    }, 700);
  }

  function tryOpenIosSettings() {
    const state = document.getElementById('notificationSettingsRecoveryState');
    let leftPage = false;
    const onHidden = () => { if (document.hidden) leftPage = true; };
    document.addEventListener('visibilitychange', onHidden, { once: true });
    try { window.location.href = 'app-settings:'; } catch (_) { /* fallback below */ }
    setTimeout(() => {
      if (!leftPage && state) state.textContent = 'iOS blocked automatic Settings opening. Open Settings → Notifications → AIT Placement Portal.';
    }, 900);
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
      if (Notification.permission !== 'granted') openRecovery('Permission was not allowed. Tap again after changing the browser permission.');
      return;
    }
    if (Notification.permission === 'denied') {
      if (isIOS()) tryOpenIosSettings();
      else tryOpenBrowserSiteSettings();
    }
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

  // Own both notification setup buttons so iPhone never falls into the old unsupported
  // Notification API path and default permission always stays inside the original click gesture.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#retryNotificationSetup, #enableMandatoryNotifications');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    smartRecovery();
  }, true);

  async function recheckOnReturn() {
    if (!supportsPush() || Notification.permission !== 'granted') return;
    const statusVisible = !statusElements().box?.hidden;
    if (!recoveryOpen && !statusVisible) return;
    await connectNotifications();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) recheckOnReturn(); });
  window.addEventListener('focus', recheckOnReturn);

  try {
    navigator.permissions?.query?.({ name: 'notifications' }).then(permission => {
      permission.addEventListener?.('change', () => {
        if (permission.state === 'granted') recheckOnReturn();
      });
    }).catch(() => {});
  } catch (_) {}
})();
