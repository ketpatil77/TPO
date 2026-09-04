(() => {
  if (window.__aitResponsiveViewportGuardInstalled) return;
  window.__aitResponsiveViewportGuardInstalled = true;

  const TOLERANCE = 2;
  let scheduled = false;
  let observer = null;

  function viewportWidth() {
    return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  }

  function canIgnore(element) {
    if (!(element instanceof Element)) return true;
    if (element.matches('[data-rf-horizontal-allowed="true"], [hidden]')) return true;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed' && element.closest('.toast-container')) return true;
    return false;
  }

  function isOverflowingViewport(element, width) {
    if (canIgnore(element)) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    return rect.right > width + TOLERANCE || rect.left < -TOLERANCE;
  }

  function candidates() {
    return document.querySelectorAll([
      'main', '.dashboard-content', '.dashboard-main', '.workspace-content',
      '.tab-content', '.glass-card', '.card', '.panel', '.modal-card',
      '.table-container', '.table-wrap', '.table-responsive', '.responsive-table',
      'table', 'form', '.item-actions', '.workflow-actions', '.actions',
      '.button-group', '.tabs-nav', '.tab-list', '.workspace-tabs', '.dashboard-tabs'
    ].join(','));
  }

  function clearMarks() {
    document.querySelectorAll('[data-rf-overflow="true"]').forEach(element => {
      element.removeAttribute('data-rf-overflow');
    });
  }

  function auditViewport() {
    scheduled = false;
    const width = viewportWidth();
    if (!width) return;

    clearMarks();
    const offenders = [];
    candidates().forEach(element => {
      if (isOverflowingViewport(element, width)) {
        element.setAttribute('data-rf-overflow', 'true');
        offenders.push(element);
      }
    });

    const documentOverflow = document.documentElement.scrollWidth > width + TOLERANCE || document.body?.scrollWidth > width + TOLERANCE;
    document.documentElement.classList.toggle('rf-has-overflow', documentOverflow || offenders.length > 0);
    document.documentElement.dataset.rfViewport = String(width);
    document.documentElement.dataset.rfOverflowCount = String(offenders.length);

    window.dispatchEvent(new CustomEvent('ait:responsive-audit', {
      detail: { width, documentOverflow, offenderCount: offenders.length }
    }));
  }

  function scheduleAudit() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(auditViewport);
  }

  function installObserver() {
    if (observer) return;
    observer = new MutationObserver(scheduleAudit);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open']
    });
  }

  function loadStudentExperienceSuite() {
    if (!document.body.classList.contains('student-dashboard-page')) return;
    if (!document.querySelector('link[data-student-experience-suite]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/student-experience-suite-v1.css?v=20260904-suite1';
      link.dataset.studentExperienceSuite = 'true';
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-student-experience-suite]')) {
      const script = document.createElement('script');
      script.src = '/js/student-experience-suite-v1.js?v=20260904-suite1';
      script.defer = true;
      script.dataset.studentExperienceSuite = 'true';
      document.body.appendChild(script);
    }
  }

  function install() {
    document.documentElement.classList.add('rf-foundation-v1');
    installObserver();
    loadStudentExperienceSuite();
    scheduleAudit();

    window.addEventListener('resize', scheduleAudit, { passive: true });
    window.addEventListener('orientationchange', scheduleAudit, { passive: true });
    window.addEventListener('pageshow', scheduleAudit);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleAudit();
    });

    if (document.fonts?.ready) document.fonts.ready.then(scheduleAudit).catch(() => {});
    setTimeout(scheduleAudit, 250);
    setTimeout(scheduleAudit, 1000);
  }

  window.AITResponsive = {
    audit: auditViewport,
    scheduleAudit,
    getState() {
      return {
        viewport: Number(document.documentElement.dataset.rfViewport || 0),
        overflowCount: Number(document.documentElement.dataset.rfOverflowCount || 0),
        hasOverflow: document.documentElement.classList.contains('rf-has-overflow')
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
