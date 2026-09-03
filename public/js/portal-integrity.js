(() => {
  const workspace = document.body.classList.contains('student-dashboard-page') ||
    document.body.classList.contains('admin-dashboard-page') ||
    document.body.classList.contains('observer-shell');
  if (!workspace || window.__AIT_PORTAL_INTEGRITY__) return;
  window.__AIT_PORTAL_INTEGRITY__ = true;

  let scheduled = false;
  const placeholderPattern = /(?:lazy|placeholder|loading)/i;

  function panelFor(control) {
    if (!control) return null;
    try { return document.getElementById(control); } catch (_) { return null; }
  }

  function labelOf(button) {
    return String(button?.textContent || '').replace(/\bnew\b/ig, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function preferButton(left, right) {
    const leftControl = left.getAttribute('aria-controls') || '';
    const rightControl = right.getAttribute('aria-controls') || '';
    const leftPanel = panelFor(leftControl);
    const rightPanel = panelFor(rightControl);
    if (leftPanel && !rightPanel) return left;
    if (rightPanel && !leftPanel) return right;
    if (left.classList.contains('active') && !right.classList.contains('active')) return left;
    if (right.classList.contains('active') && !left.classList.contains('active')) return right;
    if (placeholderPattern.test(leftControl) && !placeholderPattern.test(rightControl)) return right;
    if (placeholderPattern.test(rightControl) && !placeholderPattern.test(leftControl)) return left;
    return left;
  }

  function removeNodeWithPanel(button) {
    const control = button?.getAttribute?.('aria-controls');
    button?.remove();
    if (!control || !placeholderPattern.test(control)) return;
    panelFor(control)?.remove();
  }

  function cleanTabNav(nav) {
    const buttons = [...nav.querySelectorAll(':scope > .tab-btn[aria-controls], :scope > button[role="tab"][aria-controls]')];
    const byControl = new Map();
    buttons.forEach(button => {
      const control = button.getAttribute('aria-controls');
      if (!control) return;
      const existing = byControl.get(control);
      if (!existing) {
        byControl.set(control, button);
        return;
      }
      const keep = preferButton(existing, button);
      const remove = keep === existing ? button : existing;
      byControl.set(control, keep);
      removeNodeWithPanel(remove);
    });

    const afterControlCleanup = [...nav.querySelectorAll(':scope > .tab-btn[aria-controls], :scope > button[role="tab"][aria-controls]')];
    const byLabel = new Map();
    afterControlCleanup.forEach(button => {
      const label = labelOf(button);
      if (!label) return;
      const existing = byLabel.get(label);
      if (!existing) {
        byLabel.set(label, button);
        return;
      }
      const existingControl = existing.getAttribute('aria-controls') || '';
      const currentControl = button.getAttribute('aria-controls') || '';
      if (!placeholderPattern.test(existingControl) && !placeholderPattern.test(currentControl)) return;
      const keep = preferButton(existing, button);
      const remove = keep === existing ? button : existing;
      byLabel.set(label, keep);
      removeNodeWithPanel(remove);
    });

    const remaining = [...nav.querySelectorAll(':scope > .tab-btn[aria-controls], :scope > button[role="tab"][aria-controls]')];
    const active = remaining.filter(button => button.classList.contains('active') || button.getAttribute('aria-selected') === 'true');
    const winner = active[0] || null;
    if (active.length > 1) {
      active.slice(1).forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
        panelFor(button.getAttribute('aria-controls'))?.classList.remove('active');
      });
    }
    remaining.forEach(button => {
      const selected = button === winner;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
  }

  function cleanDuplicatePanels() {
    const seen = new Map();
    document.querySelectorAll('.tab-content[id], [role="tabpanel"][id]').forEach(panel => {
      const existing = seen.get(panel.id);
      if (!existing) {
        seen.set(panel.id, panel);
        return;
      }
      const keep = existing.classList.contains('active') ? existing : panel.classList.contains('active') ? panel : existing;
      const remove = keep === existing ? panel : existing;
      seen.set(panel.id, keep);
      remove.remove();
    });
  }

  function run() {
    scheduled = false;
    document.querySelectorAll('.tabs-nav').forEach(cleanTabNav);
    cleanDuplicatePanels();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.tabs-nav [aria-controls]');
    if (!button) return;
    const nav = button.closest('.tabs-nav');
    if (!nav) return;
    queueMicrotask(() => {
      nav.querySelectorAll('[aria-controls]').forEach(item => {
        const selected = item === button;
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.tabIndex = selected ? 0 : -1;
      });
      schedule();
    });
  }, true);

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
