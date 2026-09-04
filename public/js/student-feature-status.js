(() => {
  if (window.__aitStudentFeatureStatusInstalled) return;
  window.__aitStudentFeatureStatusInstalled = true;

  // Student-facing feature labels live in one place so a newly introduced section can
  // be marked NEW without scattering badge HTML across multiple feature modules.
  const registry = new Map([
    ['competitions', { controls: ['tab-competitions'], status: 'new' }],
    ['free-learning', { controls: ['tab-free-learning'], status: 'new' }],
    ['certificates', { controls: ['tab-certificates'], status: 'new' }],
    ['ranking', { controls: ['tab-ranking', 'tab-ranking-lazy'], status: 'hot' }]
  ]);
  const defer = typeof queueMicrotask === 'function' ? queueMicrotask : callback => Promise.resolve().then(callback);

  function normalizedStatus(value) {
    return String(value || 'new').toLowerCase() === 'hot' ? 'hot' : 'new';
  }

  function badgeFor(button) {
    return Array.from(button.children).find(node => node.classList?.contains('student-new-badge')) || null;
  }

  function applyBadge(button, key, status = 'new') {
    if (!button) return;
    const normalized = normalizedStatus(status);
    const label = normalized === 'hot' ? 'HOT' : 'NEW';
    let badge = badgeFor(button);

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'student-new-badge';
      button.appendChild(badge);
    }

    if (badge.textContent !== label) badge.textContent = label;
    badge.classList.remove('is-fresh', 'is-new', 'is-hot');
    badge.classList.add(normalized === 'hot' ? 'is-hot' : 'is-new');
    badge.dataset.featureBadge = key;
    badge.setAttribute('aria-label', normalized === 'hot' ? 'Hot feature' : 'New feature');

    button.dataset.featureKey = key;
    button.dataset.featureStatus = normalized;
  }

  function applyRegistry() {
    const tabs = document.querySelector('.tabs-nav');
    if (!tabs) return;

    for (const [key, definition] of registry.entries()) {
      for (const control of definition.controls) {
        tabs.querySelectorAll(`.tab-btn[aria-controls="${control}"]`).forEach(button => {
          applyBadge(button, key, definition.status);
        });
      }
    }

    // Future modules can opt in declaratively with data-feature-status="new" or "hot".
    tabs.querySelectorAll('.tab-btn[data-feature-status]').forEach(button => {
      const key = button.dataset.featureKey || button.getAttribute('aria-controls') || 'feature';
      applyBadge(button, key, button.dataset.featureStatus);
    });
  }

  let queued = false;
  function queueApply() {
    if (queued) return;
    queued = true;
    defer(() => {
      queued = false;
      applyRegistry();
    });
  }

  function install() {
    applyRegistry();
    const tabs = document.querySelector('.tabs-nav');
    if (!tabs) return;

    new MutationObserver(queueApply).observe(tabs, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-controls', 'data-feature-status']
    });
  }

  window.AITFeatureStatus = {
    register(key, controls, status = 'new') {
      const list = Array.isArray(controls) ? controls : [controls];
      registry.set(String(key), { controls: list.filter(Boolean), status: normalizedStatus(status) });
      applyRegistry();
    },
    refresh: applyRegistry
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
