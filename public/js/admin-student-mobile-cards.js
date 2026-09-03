(() => {
  if (!document.body.classList.contains('admin-dashboard-page')) return;

  const mobileQuery = window.matchMedia('(max-width: 760px)');
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

  function countLabel(value, singular, short) {
    const count = Number(value || 0);
    return `${count} ${short || (count === 1 ? singular : `${singular}s`)}`;
  }

  function detailBlock(label, value) {
    const block = make('div', 'mobile-student-detail-block');
    block.append(make('small', '', label), make('strong', '', value));
    return block;
  }

  function buildDetails(student, row) {
    const panel = make('div', 'mobile-student-details');
    panel.setAttribute('aria-hidden', 'true');

    const grid = make('div', 'mobile-student-detail-grid');
    const cgpa = student?.profile_active && student?.cgpa_overall
      ? Number(student.cgpa_overall).toFixed(2)
      : '—';
    const academic = `${cgpa} CGPA · ${countLabel(student?.active_backlogs, 'backlog')}`;
    const experience = [
      countLabel(student?.internships_count, 'internship', 'int'),
      countLabel(student?.certificates_count, 'certificate', 'cert'),
      countLabel(student?.projects_count, 'project', 'proj'),
      countLabel(student?.research_papers_count, 'research paper', 'research')
    ].join(' · ');
    const profileType = !student?.profile_active ? 'Profile pending' : (student?.has_diploma ? 'Diploma' : 'Regular');
    const documents = `${profileType} · ${student?.resume_url ? 'Resume ready' : 'No resume'}`;
    const status = student?.profile_active ? 'Student profile active' : 'Awaiting first login';

    grid.append(
      detailBlock('Academic', academic),
      detailBlock('Experience', experience),
      detailBlock('Documents', documents),
      detailBlock('Status', status)
    );
    panel.appendChild(grid);

    const actions = make('div', 'mobile-student-detail-actions');
    const openButton = make('button', 'mobile-student-open-profile', 'Open full profile');
    openButton.type = 'button';
    openButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (student?.id && typeof window.openStudentModal === 'function') window.openStudentModal(student.id);
      else row.querySelector('td:nth-child(8) button')?.click();
    });
    actions.appendChild(openButton);
    panel.appendChild(actions);
    return panel;
  }

  function setExpanded(row, expanded) {
    row.classList.toggle('is-mobile-expanded', expanded);
    row.setAttribute('aria-expanded', String(expanded));
    const summary = row.querySelector('.mobile-student-summary');
    const details = row.querySelector('.mobile-student-details');
    if (summary) {
      summary.setAttribute('aria-expanded', String(expanded));
      summary.setAttribute('aria-label', `${expanded ? 'Hide' : 'Show'} details for ${summary.dataset.studentName || 'student'}`);
    }
    if (details) details.setAttribute('aria-hidden', String(!expanded));
  }

  function toggleRow(row) {
    if (!mobileQuery.matches) return;
    const opening = !row.classList.contains('is-mobile-expanded');
    if (opening) {
      tbody.querySelectorAll('.student-mobile-directory-row.is-mobile-expanded').forEach(other => {
        if (other !== row) setExpanded(other, false);
      });
    }
    setExpanded(row, opening);
  }

  function enhanceRow(row) {
    if (!(row instanceof HTMLTableRowElement) || row.dataset.mobileStudentCard === 'ready' || row.cells.length !== 8) return;

    const cells = [...row.cells];
    const prn = compact(cells[0].textContent);
    const student = studentByPrn(prn);
    if (!student) return;

    const name = compact(student.name) || 'Student';
    const branchClassYear = [student.branch, student.class, student.year].map(compact).filter(Boolean).join(' · ');
    const cgpa = student.profile_active && student.cgpa_overall ? Number(student.cgpa_overall).toFixed(2) : '—';

    row.dataset.mobileStudentCard = 'ready';
    row.classList.add('student-mobile-directory-row');
    row.setAttribute('aria-expanded', 'false');

    const summary = make('button', 'mobile-student-summary');
    summary.type = 'button';
    summary.dataset.studentName = name;
    summary.setAttribute('aria-expanded', 'false');
    summary.setAttribute('aria-label', `Show details for ${name}`);

    const identity = make('span', 'mobile-student-identity');
    identity.append(make('strong', '', name), make('small', '', `${prn}${branchClassYear ? ` · ${branchClassYear}` : ''}`));

    const score = make('span', 'mobile-student-score');
    score.append(make('strong', '', cgpa), make('small', '', 'CGPA'));

    const chevron = make('span', 'mobile-student-chevron', '⌄');
    chevron.setAttribute('aria-hidden', 'true');

    summary.append(identity, score, chevron);
    cells[0].append(summary, buildDetails(student, row));

    summary.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleRow(row);
    });

    row.addEventListener('click', event => {
      if (!mobileQuery.matches) return;
      if (event.target.closest('.mobile-student-details a, .mobile-student-details button, input, select, textarea, label')) return;
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