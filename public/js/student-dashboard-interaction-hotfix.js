(() => {
  if (window.__AIT_STUDENT_INTERACTION_HOTFIX__) return;
  window.__AIT_STUDENT_INTERACTION_HOTFIX__ = true;

  function unlock() {
    const dashboard = document.getElementById('studentDashboard');
    const gate = document.getElementById('mandatoryNotificationGate');
    if (gate) gate.hidden = true;
    document.body?.classList?.remove?.('notifications-blocked');
    if (dashboard) {
      try { dashboard.inert = false; } catch (_) {}
      dashboard.removeAttribute('inert');
      dashboard.removeAttribute('aria-hidden');
      dashboard.style.pointerEvents = '';
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
    // Browser notifications are useful, but a delivery/configuration failure must never
    // disable the authenticated workspace. Keep setup best-effort and non-blocking.
    try {
      window.setMandatoryNotificationGate = function (_blocked, message = '') {
        unlock();
        if (message) {
          const target = document.getElementById('notificationSetupMessage');
          if (target) target.textContent = message;
        }
      };
      // Classic-script global bindings may not be writable through window in every browser.
      // Assignment covers that case without creating another initialization path.
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installOverrides, { once: true });
  } else {
    installOverrides();
  }

  // Recover after BFCache restores / mobile tab resumes. No MutationObserver, no loop.
  window.addEventListener('pageshow', () => {
    unlock();
    hideStaleBusyUi();
  });
  window.addEventListener('focus', unlock);
})();