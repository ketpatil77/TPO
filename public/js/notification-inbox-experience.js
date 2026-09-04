(() => {
  if (window.__aitNotificationInboxExperienceInstalled) return;
  window.__aitNotificationInboxExperienceInstalled = true;

  const SUPPRESSION_KEY = 'ait-important-inbox-mode-v1';
  let inboxMode = false;
  let pendingInboxHandoff = false;
  let inboxOpening = false;
  let internalAcknowledgeClick = false;

  function readInboxMode() {
    try { return sessionStorage.getItem(SUPPRESSION_KEY) === '1'; }
    catch (_) { return false; }
  }

  function setInboxMode(enabled) {
    inboxMode = Boolean(enabled);
    try {
      if (inboxMode) sessionStorage.setItem(SUPPRESSION_KEY, '1');
      else sessionStorage.removeItem(SUPPRESSION_KEY);
    } catch (_) {}
  }

  setInboxMode(readInboxMode());

  function modal() {
    return document.getElementById('mandatoryImportantNotification');
  }

  function notificationList() {
    return document.getElementById('studentNotifications');
  }

  function importantUnreadCards() {
    const list = notificationList();
    if (!list) return [];
    return [...list.querySelectorAll('.notification-item.notification-unread')]
      .filter(card => card.querySelector('.notification-priority.important'));
  }

  function styleInterrupt() {
    const box = modal();
    if (!box) return;

    const acknowledge = box.querySelector('#mandatoryImportantAcknowledge');
    const open = box.querySelector('#mandatoryImportantOpen');
    const count = box.querySelector('#mandatoryImportantCount');

    if (acknowledge && acknowledge.textContent !== 'Got it · Open inbox') {
      acknowledge.textContent = 'Got it · Open inbox';
    }

    if (open) {
      open.hidden = true;
      open.setAttribute('aria-hidden', 'true');
      open.tabIndex = -1;
    }

    if (count) {
      const match = String(count.textContent || '').match(/(\d+)\s+unread/i);
      if (match) {
        const total = Number(match[1]);
        const nextText = total > 1 ? `· ${total - 1} more in inbox` : '';
        if (count.textContent !== nextText) count.textContent = nextText;
      }
    }
  }

  function hideRepeatedInterrupt() {
    if (!inboxMode) return;
    const box = modal();
    if (!box || box.hidden) return;
    box.hidden = true;
    document.getElementById('notificationBell')?.focus?.();
  }

  function decorateInbox() {
    const list = notificationList();
    if (!list) return;

    const cards = importantUnreadCards();
    const existing = list.querySelector('[data-important-inbox-summary]');

    if (!cards.length) {
      existing?.remove();
      if (list.querySelector('.notification-item')) setInboxMode(false);
      return;
    }

    if (!inboxMode) {
      existing?.remove();
      return;
    }

    const count = cards.length;
    const heading = `${count} important ${count === 1 ? 'update' : 'updates'} in your inbox`;
    const message = 'Review them here at your pace. The portal will not interrupt you one-by-one.';

    let summary = existing;
    if (!summary) {
      summary = document.createElement('article');
      summary.className = 'notification-item notification-batch-summary';
      summary.dataset.importantInboxSummary = 'true';
      summary.innerHTML = '<div class="notification-item-head"><div><span class="notification-priority important">Important updates</span><h4></h4></div></div><p></p>';
      list.prepend(summary);
    }

    const title = summary.querySelector('h4');
    const body = summary.querySelector('p');
    if (title && title.textContent !== heading) title.textContent = heading;
    if (body && body.textContent !== message) body.textContent = message;
  }

  function openInbox() {
    if (inboxOpening) return;
    inboxOpening = true;
    queueMicrotask(() => {
      try {
        hideRepeatedInterrupt();
        if (typeof window.openNotificationCenter === 'function') {
          window.openNotificationCenter();
        } else {
          document.getElementById('notificationBell')?.click?.();
        }
        decorateInbox();
      } finally {
        setTimeout(() => { inboxOpening = false; }, 250);
      }
    });
  }

  async function markAllFromInbox(button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Marking read…';
    try {
      const token = localStorage.getItem('tpo_token');
      const response = await fetch('/api/student/workflow/notifications/read-all', {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || data?.error || 'Could not mark notifications read.');
      setInboxMode(false);
      pendingInboxHandoff = false;
      modal() && (modal().hidden = true);
      if (typeof window.loadStudentNotifications === 'function') await window.loadStudentNotifications();
      decorateInbox();
      if (typeof window.showToast === 'function') window.showToast('Notifications marked read.', 'success');
    } catch (error) {
      if (typeof window.showToast === 'function') window.showToast(error.message || 'Could not mark notifications read.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function handleClickCapture(event) {
    const open = event.target.closest?.('#mandatoryImportantOpen');
    if (open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const acknowledge = modal()?.querySelector('#mandatoryImportantAcknowledge');
      if (acknowledge) {
        pendingInboxHandoff = true;
        internalAcknowledgeClick = true;
        acknowledge.click();
        internalAcknowledgeClick = false;
      }
      return;
    }

    const acknowledge = event.target.closest?.('#mandatoryImportantAcknowledge');
    if (acknowledge && !internalAcknowledgeClick) {
      // Let the existing assurance policy persist the acknowledgement. The handoff
      // happens only after that request succeeds and the original modal closes.
      pendingInboxHandoff = true;
      return;
    }

    const markAll = event.target.closest?.('#notificationCenterModal .notification-center-toolbar button');
    if (markAll && inboxMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      markAllFromInbox(markAll);
    }
  }

  function observeExperience() {
    const observer = new MutationObserver(() => {
      const box = modal();
      styleInterrupt();

      if (pendingInboxHandoff && box?.hidden) {
        pendingInboxHandoff = false;
        setInboxMode(true);
        openInbox();
        return;
      }

      hideRepeatedInterrupt();
      decorateInbox();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden']
    });
  }

  function install() {
    document.addEventListener('click', handleClickCapture, true);
    observeExperience();
    styleInterrupt();
    hideRepeatedInterrupt();
    decorateInbox();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
