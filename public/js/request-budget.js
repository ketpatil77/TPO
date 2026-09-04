(() => {
  if (window.__aitRequestBudgetInstalled) return;
  window.__aitRequestBudgetInstalled = true;

  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function budgetedSetInterval(callback, delay, ...args) {
    let nextDelay = Number(delay);
    const source = typeof callback === 'function' ? Function.prototype.toString.call(callback) : String(callback || '');

    // Student push handles urgent delivery. Poll the in-app inbox only as a fallback.
    if (nextDelay <= 30000 && source.includes('loadStudentNotifications')) nextDelay = 5 * 60 * 1000;

    // The admin activity feed is useful live, but 15-second polling burns the free Worker quota.
    if (nextDelay <= 15000 && (source.includes('tab-student-activity') || source.includes('load(false, true)'))) nextDelay = 60 * 1000;

    return nativeSetInterval(callback, nextDelay, ...args);
  };

  const nativeFetch = window.fetch.bind(window);
  const inflight = new Map();
  const responseCache = new Map();
  const shortTtl = new Map([
    ['/api/student/workflow/notifications', 10000],
    ['/api/student/profile', 3000],
    ['/api/student/push/config', 6 * 60 * 60 * 1000]
  ]);

  function requestInfo(input, init = {}) {
    try {
      const request = input instanceof Request ? input : null;
      const method = String(init.method || request?.method || 'GET').toUpperCase();
      const url = new URL(request?.url || String(input), location.href);
      if (method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/api/')) return null;
      const headers = new Headers(request?.headers || undefined);
      new Headers(init.headers || undefined).forEach((value, key) => headers.set(key, value));
      const auth = headers.get('authorization') || localStorage.getItem('tpo_token') || localStorage.getItem('tpo_admin_token') || localStorage.getItem('tpo_observer_token') || '';
      return { url, key: `${url.href}|${auth}`, ttl: shortTtl.get(url.pathname) || 0 };
    } catch (_) {
      return null;
    }
  }

  window.fetch = async function budgetedFetch(input, init = {}) {
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
})();
