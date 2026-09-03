(() => {
  const workspace = document.body.classList.contains('student-dashboard-page') ||
    document.body.classList.contains('admin-dashboard-page') ||
    document.body.classList.contains('observer-shell');
  if (!workspace || window.__AIT_PORTAL_INTEGRITY__) return;
  window.__AIT_PORTAL_INTEGRITY__ = true;

  let scheduled = false;

  function panelFor(control) {
    if (!control) return null;
    try { return document.getElementById(control); } catch (_) { return null; }
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
    if (/lazy/i.test(leftControl) && !/lazy/i.test(rightControl)) return right;
    if (/lazy/i.test(rightControl) && !/lazy/i.test(leftControl)) return left;
    return left;
  }

  function removeNodeWithPanel(button) {
    const control = button?.getAttribute?.('aria-controls');
    button?.remove();
    if (!control) return;
    const panel = document.getElementById(control);
    if (panel && /(?:-lazy|placeholder)$/i.test(control)) panel.remove();
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

    const realRanking = nav.querySelector('[aria-controls="tab-ranking"]');
    if (realRanking) {
      nav.querySelectorAll('[aria-controls="tab-ranking-lazy"]').forEach(removeNodeWithPanel);
      document.getElementById('tab-ranking-lazy')?.remove();
    }

    const remaining = [...nav.querySelectorAll(':scope > .tab-btn[aria-controls], :scope > button[role="tab"][aria-controls]')];
    const active = remaining.filter(button => button.classList.contains('active') || button.getAttribute('aria-selected') === 'true');
    const winner = active[0] || remaining[0] || null;
    if (active.length > 1) {
      active.slice(1).forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
        const panel = panelFor(button.getAttribute('aria-controls'));
        panel?.classList.remove('active');
      });
    }
    remaining.forEach(button => {
      const selected = button === winner && (button.classList.contains('active') || button.getAttribute('aria-selected') === 'true');
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

  function fixInteractiveWidths() {
    document.querySelectorAll('.dashboard-wrapper input, .dashboard-wrapper select, .dashboard-wrapper textarea, .dashboard-wrapper button, .dashboard-wrapper .glass-card').forEach(node => {
      if (node instanceof HTMLElement) node.style.minWidth = node.style.minWidth === '0px' ? node.style.minWidth : '';
    });
  }

  function run() {
    scheduled = false;
    document.querySelectorAll('.tabs-nav').forEach(cleanTabNav);
    cleanDuplicatePanels();
    fixInteractiveWidths();
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
