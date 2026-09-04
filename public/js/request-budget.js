(() => {
  if (window.__aitRequestBudgetInstalled) return;
  window.__aitRequestBudgetInstalled = true;

  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function budgetedSetInterval(callback, delay, ...args) {
    const nextDelay = Number(delay);
    const source = typeof callback === 'function' ? Function.prototype.toString.call(callback) : String(callback || '');

    // Browser push is the realtime transport. Do not burn Worker requests polling the
    // same notification inbox every 30 seconds for every logged-in student.
    if (nextDelay <= 30000 && source.includes('loadStudentNotifications')) return 0;

    // Live Activity still refreshes automatically, but at a free-tier-safe cadence
    // and only while that tab is active (the activity module already enforces that).
    if (nextDelay <= 15000 && (source.includes('tab-student-activity') || source.includes('load(false, true)'))) {
      return nativeSetInterval(callback, 2 * 60 * 1000, ...args);
    }

    return nativeSetInterval(callback, nextDelay, ...args);
  };

  const nativeFetch = window.fetch.bind(window);
  const inflight = new Map();
  const responseCache = new Map();
  const pushSubscriptionCache = new Map();
  const shortTtl = new Map([
    ['/api/student/workflow/notifications', 10000],
    ['/api/student/profile', 3000],
    ['/api/student/push/config', 6 * 60 * 60 * 1000]
  ]);

  function authFor(headers) {
    return headers.get('authorization') || localStorage.getItem('tpo_token') || localStorage.getItem('tpo_admin_token') || localStorage.getItem('tpo_observer_token') || '';
  }

  function requestInfo(input, init = {}) {
    try {
      const request = input instanceof Request ? input : null;
      const method = String(init.method || request?.method || 'GET').toUpperCase();
      const url = new URL(request?.url || String(input), location.href);
      if (method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/api/')) return null;
      const headers = new Headers(request?.headers || undefined);
      new Headers(init.headers || undefined).forEach((value, key) => headers.set(key, value));
      return { url, key: `${url.href}|${authFor(headers)}`, ttl: shortTtl.get(url.pathname) || 0 };
    } catch (_) {
      return null;
    }
  }

  function pushSubscriptionInfo(input, init = {}) {
    try {
      const request = input instanceof Request ? input : null;
      const method = String(init.method || request?.method || 'GET').toUpperCase();
      const url = new URL(request?.url || String(input), location.href);
      if (method !== 'POST' || url.origin !== location.origin || url.pathname !== '/api/student/push/subscriptions') return null;
      const headers = new Headers(request?.headers || undefined);
      new Headers(init.headers || undefined).forEach((value, key) => headers.set(key, value));
      const body = typeof init.body === 'string' ? init.body : '';
      return { key: `${url.href}|${authFor(headers)}|${body}` };
    } catch (_) {
      return null;
    }
  }

  function clearCachedPath(pathname) {
    for (const key of responseCache.keys()) {
      try {
        const urlText = key.split('|', 1)[0];
        if (new URL(urlText).pathname === pathname) responseCache.delete(key);
      } catch (_) { /* ignore malformed cache keys */ }
    }
  }

  window.fetch = async function budgetedFetch(input, init = {}) {
    const subscriptionInfo = pushSubscriptionInfo(input, init);
    if (subscriptionInfo) {
      const now = Date.now();
      const cached = pushSubscriptionCache.get(subscriptionInfo.key);
      if (cached && now - cached.at < 6 * 60 * 60 * 1000) return cached.response.clone();
      const response = await nativeFetch(input, init);
      if (response.ok) pushSubscriptionCache.set(subscriptionInfo.key, { at: now, response: response.clone() });
      responseCache.clear();
      return response;
    }

    const info = requestInfo(input, init);
    if (!info) {
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'GET') responseCache.clear();
      return nativeFetch(input, init);
    }

    const now = Date.now();
    const cached = responseCache.get(info.key);
    if (info.ttl && cached && now - cached.at < info.ttl) return cached.response.clone();
    if (cached && (!info.ttl || now - cached.at >= info.ttl)) responseCache.delete(info.key);

    if (inflight.has(info.key)) return (await inflight.get(info.key)).clone();

    const pending = nativeFetch(input, init).then(response => {
      if (response.ok && info.ttl) responseCache.set(info.key, { at: Date.now(), response: response.clone() });
      return response;
    }).finally(() => inflight.delete(info.key));

    inflight.set(info.key, pending);
    return (await pending).clone();
  };

  let lastNotificationRefreshAt = 0;
  function refreshStudentNotifications(force = false) {
    if (document.hidden || typeof window.loadStudentNotifications !== 'function') return;
    const now = Date.now();
    if (!force && now - lastNotificationRefreshAt < 2 * 60 * 1000) return;
    lastNotificationRefreshAt = now;
    clearCachedPath('/api/student/workflow/notifications');
    Promise.resolve(window.loadStudentNotifications()).catch(() => {});
  }

  // A push arriving while the portal is open refreshes the in-app inbox exactly once.
  // No background notification polling is required.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'AIT_PUSH_RECEIVED') refreshStudentNotifications(true);
    });
  }

  // If push was unavailable while the tab was hidden, one bounded refresh on return
  // catches up important in-app notifications without continuous Worker traffic.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshStudentNotifications(false);
  });
  window.addEventListener('focus', () => refreshStudentNotifications(false));
})();
