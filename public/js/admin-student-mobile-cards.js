(() => {
  if (!document.body.classList.contains('admin-dashboard-page')) return;

  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  function firstLine(value) {
    return String(value || '').split('\n').map(part => part.trim()).filter(Boolean)[0] || '';
  }

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setExpanded(row, expanded) {
    row.classList.toggle('is-mobile-expanded', expanded);
    row.setAttribute('aria-expanded', String(expanded));
    const button = row.querySelector('.mobile-student-summary');
    if (button) button.setAttribute('aria-expanded', String(expanded));
  }

  function toggleRow(row) {
    if (!mobileQuery.matches) return;
    setExpanded(row, !row.classList.contains('is-mobile-expanded'));
  }

  function enhanceRow(row) {
    if (!(row instanceof HTMLTableRowElement) || row.dataset.mobileStudentCard === 'ready' || row.cells.length !== 8) return;

    const cells = [...row.cells];
    const prn = firstLine(cells[0].innerText);
    const name = firstLine(cells[1].innerText) || 'Student';
    const branchClass = compact(cells[2].innerText).replace(/\s*\(\s*/g, ' · ').replace(/\s*\)\s*/g, '');
    const year = compact(cells[3].innerText);
    const cgpaRaw = compact(cells[4].querySelector('strong')?.textContent || '—');
    const cgpa = cgpaRaw.replace(/\s*CGPA\s*/i, '') || '—';

    row.dataset.mobileStudentCard = 'ready';
    row.classList.add('student-mobile-directory-row');
    row.setAttribute('aria-expanded', 'false');

    const summary = make('button', 'mobile-student-summary');
    summary.type = 'button';
    summary.setAttribute('aria-expanded', 'false');
    summary.setAttribute('aria-label', `Show details for ${name}`);

    const identity = make('span', 'mobile-student-identity');
    identity.appendChild(make('strong', '', name));
    const metaParts = [prn, branchClass, year].filter(Boolean);
    identity.appendChild(make('small', '', metaParts.join(' · ')));

    const score = make('span', 'mobile-student-score');
    score.appendChild(make('strong', '', cgpa));
    score.appendChild(make('small', '', 'CGPA'));

    const chevron = make('span', 'mobile-student-chevron', '⌄');
    chevron.setAttribute('aria-hidden', 'true');

    summary.append(identity, score, chevron);
    cells[0].appendChild(summary);

    summary.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleRow(row);
    });

    row.addEventListener('click', event => {
      if (!mobileQuery.matches) return;
      if (event.target.closest('a,button,input,select,textarea,label')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleRow(row);
    }, true);
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

  const resetExpanded = event => {
    if (event.matches) return;
    tbody.querySelectorAll('.student-mobile-directory-row.is-mobile-expanded').forEach(row => setExpanded(row, false));
  };
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', resetExpanded);
  else mobileQuery.addListener(resetExpanded);
})();