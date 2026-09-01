(() => {
  function apply() {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    document.getElementById('academicVerificationBadge')?.remove();

    const overall = document.getElementById('editOverallCgpa');
    if (overall) {
      overall.readOnly = true;
      overall.classList.add('locked-field');
      overall.setAttribute('aria-readonly', 'true');
      const hint = document.getElementById('overallCgpaHint');
      if (hint) hint.textContent = 'College-managed academic record. Students cannot edit CGPA.';
    }

    const semesterInputs = [...document.querySelectorAll('.sem-input')];
    semesterInputs.forEach(input => {
      input.readOnly = true;
      input.classList.add('locked-field', 'college-managed-academic');
      input.setAttribute('aria-readonly', 'true');
      input.title = 'College-managed academic record';
    });

    const semesterGrid = document.querySelector('.grid-semesters');
    if (semesterGrid && !document.getElementById('collegeAcademicNotice')) {
      const note = document.createElement('div');
      note.id = 'collegeAcademicNotice';
      note.className = 'college-academic-notice';
      note.innerHTML = '<strong>College academic record</strong><span>Semester SGPA and overall CGPA are supplied by the college and are automatically trusted for Profile Points. Contact TPO/TPC if a value is incorrect.</span>';
      semesterGrid.before(note);
    }

    const lateral = document.getElementById('lateralEntry');
    if (lateral) {
      lateral.disabled = true;
      lateral.closest('.lateral-entry-control')?.classList.add('college-managed-academic');
    }
  }

  function removeAcademicBadge() {
    document.getElementById('academicVerificationBadge')?.remove();
  }

  function install() {
    apply();
    if (document.body.classList.contains('student-dashboard-page')) {
      new MutationObserver(() => { removeAcademicBadge(); apply(); }).observe(document.getElementById('dashboardContent') || document.body, { childList:true, subtree:true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();