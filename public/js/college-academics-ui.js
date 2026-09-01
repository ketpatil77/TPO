(() => {
  function apply() {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    // CGPA is editable by students and counts automatically. It does not use
    // the general profile-evidence verification workflow.
    document.getElementById('academicVerificationBadge')?.remove();
    document.getElementById('collegeAcademicNotice')?.remove();

    const overall = document.getElementById('editOverallCgpa');
    if (overall) {
      overall.readOnly = false;
      overall.classList.remove('locked-field', 'college-managed-academic');
      overall.removeAttribute('aria-readonly');
      overall.removeAttribute('title');
      const hint = document.getElementById('overallCgpaHint');
      if (hint && /college-managed|cannot edit|supplied by the college/i.test(hint.textContent || '')) {
        hint.textContent = '';
      }
    }

    document.querySelectorAll('.sem-input').forEach(input => {
      input.readOnly = false;
      input.classList.remove('locked-field', 'college-managed-academic');
      input.removeAttribute('aria-readonly');
      input.removeAttribute('title');
    });

    const lateral = document.getElementById('lateralEntry');
    if (lateral) {
      lateral.disabled = false;
      lateral.closest('.lateral-entry-control')?.classList.remove('college-managed-academic');
    }

    document.querySelectorAll('.college-managed-academic').forEach(node => node.classList.remove('college-managed-academic'));
  }

  function install() {
    apply();
    if (document.body.classList.contains('student-dashboard-page')) {
      new MutationObserver(apply).observe(document.getElementById('dashboardContent') || document.body, { childList:true, subtree:true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();