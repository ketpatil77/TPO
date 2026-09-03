(() => {
  if (!document.body.classList.contains('admin-dashboard-page')) return;

  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function studentByPrn(prn) {
    try {
      return (Array.isArray(allStudentsData) ? allStudentsData : []).find(student => String(student.prn) === String(prn)) || null;
    } catch (_) {
      return null;
    }
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function openStudent(student, row) {
    if (student?.id && typeof window.openStudentModal === 'function') {
      window.openStudentModal(student.id);
      return;
    }
    row.querySelector('td:nth-child(8) button')?.click();
  }

  function enhanceRow(row) {
    if (!(row instanceof HTMLTableRowElement) || row.dataset.mobileStudentCard === 'ready' || row.cells.length !== 8) return;

    const cells = [...row.cells];
    const prn = compact(cells[0].textContent);
    const student = studentByPrn(prn);
    if (!student) return;

    const name = compact(student.name) || 'Student';
    const meta = [prn, student.branch, student.class, student.year].map(compact).filter(Boolean).join(' · ');
    const cgpa = student.profile_active && student.cgpa_overall ? Number(student.cgpa_overall).toFixed(2) : '—';

    row.dataset.mobileStudentCard = 'ready';
    row.classList.add('student-mobile-directory-row');

    const card = make('button', 'mobile-student-summary');
    card.type = 'button';
    card.setAttribute('aria-label', `Open profile for ${name}`);

    const identity = make('span', 'mobile-student-identity');
    identity.append(make('strong', '', name), make('small', '', meta));

    const score = make('span', 'mobile-student-score');
    score.append(make('strong', '', cgpa), make('small', '', 'CGPA'));

    const arrow = make('span', 'mobile-student-chevron', '›');
    arrow.setAttribute('aria-hidden', 'true');

    card.append(identity, score, arrow);
    cells[0].append(card);

    card.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openStudent(student, row);
    });
  }

  function enhanceAll(root = tbody) {
    root.querySelectorAll?.('tr').forEach(enhanceRow);
    if (root.matches?.('tr')) enhanceRow(root);
  }

  enhanceAll();
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) enhanceAll(node);
      }
    }
  }).observe(tbody, { childList: true, subtree: true });
})();