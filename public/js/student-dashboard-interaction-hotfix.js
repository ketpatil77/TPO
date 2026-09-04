(() => {
  if (window.__AIT_STUDENT_INTERACTION_HOTFIX__) return;
  window.__AIT_STUDENT_INTERACTION_HOTFIX__ = true;

  const style = document.createElement('style');
  style.id = 'studentInteractionRecoveryStyle';
  style.textContent = `
    body.student-dashboard-page,
    body.student-dashboard-page.notifications-blocked {
      overflow-y: auto !important;
      overscroll-behavior-y: auto !important;
      touch-action: pan-y !important;
      pointer-events: auto !important;
    }
    body.student-dashboard-page #studentDashboard {
      pointer-events: auto !important;
      touch-action: auto !important;
    }
    body.student-dashboard-page #mandatoryNotificationGate {
      display: none !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);

  function unlock() {
    const dashboard = document.getElementById('studentDashboard');
    const gate = document.getElementById('mandatoryNotificationGate');
    if (gate) {
      gate.hidden = true;
      gate.style.display = 'none';
      gate.style.pointerEvents = 'none';
    }
    document.body?.classList?.remove?.('notifications-blocked');
    if (document.body) {
      document.body.style.overflowY = 'auto';
      document.body.style.pointerEvents = 'auto';
      document.body.style.touchAction = 'pan-y';
    }
    if (dashboard) {
      try { dashboard.inert = false; } catch (_) {}
      dashboard.removeAttribute('inert');
      dashboard.removeAttribute('aria-hidden');
      dashboard.style.pointerEvents = 'auto';
      dashboard.style.touchAction = 'auto';
    }
  }

  function hideStaleBusyUi() {
    const feedback = document.getElementById('portalOperationFeedback');
    if (!feedback?.classList.contains('is-visible')) return;
    const message = feedback.querySelector('.portal-operation-message')?.textContent || '';
    if (/^Saving…?$|notification/i.test(message)) {
      try { window.PortalOperationFeedback?.forceHide?.(); }
      catch (_) { feedback.classList.remove('is-visible'); }
    }
  }

  function installOverrides() {
    try {
      window.setMandatoryNotificationGate = function (_blocked, message = '') {
        unlock();
        if (message) {
          const status = document.getElementById('notificationSetupStatus');
          const target = document.getElementById('notificationSetupMessage');
          if (status) status.hidden = false;
          if (target) target.textContent = message;
        }
      };
      setMandatoryNotificationGate = window.setMandatoryNotificationGate;
    } catch (_) {}

    unlock();
    hideStaleBusyUi();
    try {
      if (typeof window.startStudentWorkspace === 'function') window.startStudentWorkspace();
      else if (typeof startStudentWorkspace === 'function') startStudentWorkspace();
    } catch (error) {
      console.error('Student workspace start recovery failed:', error);
    }

    const dashboard = document.getElementById('studentDashboard');
    if (document.body && dashboard && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        const bodyBlocked = document.body.classList.contains('notifications-blocked');
        const dashboardBlocked = dashboard.hasAttribute('inert') || dashboard.getAttribute('aria-hidden') === 'true';
        if (bodyBlocked || dashboardBlocked) unlock();
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
      observer.observe(dashboard, { attributes: true, attributeFilter: ['inert', 'aria-hidden', 'style'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installOverrides, { once: true });
  else installOverrides();

  function recover() {
    unlock();
    hideStaleBusyUi();
  }

  window.addEventListener('pageshow', recover);
  window.addEventListener('focus', recover);
  window.addEventListener('touchstart', unlock, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) queueMicrotask(recover); });
})();