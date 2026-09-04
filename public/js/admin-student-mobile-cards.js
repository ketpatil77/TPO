(() => {
  if (!document.body.classList.contains('admin-dashboard-page')) return;

  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  const completionByPrn = new Map();
  const completionCache = new Map();
  const CACHE_MS = 30000;
  let refreshTimer = null;
  let requestSequence = 0;

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

  function injectStyles() {
    if (document.getElementById('admin-profile-completion-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-profile-completion-styles';
    style.textContent = `
      .student-table .student-completion-head,.student-table .student-completion-cell{width:92px;min-width:78px;text-align:center!important}
      .student-profile-completion{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:0}
      .student-profile-completion strong{font-size:.82rem;line-height:1;font-variant-numeric:tabular-nums;color:var(--text-heading)}
      .student-profile-completion-track{display:block;width:58px;max-width:100%;height:4px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,var(--border-color) 78%,transparent)}
      .student-profile-completion-track>i{display:block;width:var(--profile-completion,0%);height:100%;border-radius:inherit;background:var(--workspace-accent,var(--accent));transition:width .25s ease}
      .student-profile-completion.is-complete strong{color:#86efac}
      .student-profile-completion.is-low strong{color:#fca5a5}
      @media(max-width:760px){.student-table .student-completion-head,.student-table .student-completion-cell{width:auto;min-width:0}}
    `;
    document.head.appendChild(style);
  }

  function ensureHeader() {
    const table = tbody.closest('table');
    const headerRow = table?.tHead?.rows?.[0];
    if (!headerRow) return;
    if (!headerRow.querySelector('.student-completion-head')) {
      const th = document.createElement('th');
      th.className = 'student-completion-head';
      th.textContent = 'Completion';
      const actionHead = headerRow.cells[headerRow.cells.length - 1];
      headerRow.insertBefore(th, actionHead || null);
    }
    tbody.querySelectorAll('tr').forEach(row => {
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) row.cells[0].colSpan = 9;
    });
  }

  function rowPrn(row) {
    if (row.dataset.studentPrn) return row.dataset.studentPrn;
    const first = row.cells?.[0];
    if (!first) return '';
    const original = first.querySelector(':scope > strong')?.textContent || first.querySelector('strong')?.textContent || '';
    const prn = compact(original);
    if (prn) row.dataset.studentPrn = prn;
    return prn;
  }

  function completionClass(value) {
    if (value >= 100) return 'is-complete';
    if (value < 50) return 'is-low';
    return '';
  }

  function paintCompletion(cell, record) {
    if (!cell) return;
    const value = Number.isFinite(Number(record?.completion)) ? Math.max(0, Math.min(100, Number(record.completion))) : null;
    const missingText = Array.isArray(record?.missing) ? record.missing.join(', ') : '';
    const state = `${value === null ? 'na' : value}|${missingText}`;
    if (cell.dataset.completionState === state) return;
    cell.dataset.completionState = state;
    cell.textContent = '';
    const wrap = make('div', `student-profile-completion ${value === null ? '' : completionClass(value)}`.trim());
    const label = make('strong', '', value === null ? '—' : `${Math.round(value)}%`);
    const track = make('span', 'student-profile-completion-track');
    const fill = document.createElement('i');
    fill.style.setProperty('--profile-completion', value === null ? '0%' : `${value}%`);
    track.append(fill);
    wrap.append(label, track);
    if (missingText) wrap.title = `Missing: ${missingText}`;
    else if (value === 100) wrap.title = 'Profile complete';
    cell.append(wrap);
  }

  function ensureCompletionCell(row) {
    if (!(row instanceof HTMLTableRowElement)) return null;
    if (row.cells.length === 1 && row.cells[0].colSpan > 1) {
      row.cells[0].colSpan = 9;
      return null;
    }
    let cell = row.querySelector('.student-completion-cell');
    if (!cell) {
      const actionCell = row.cells[row.cells.length - 1];
      if (!actionCell) return null;
      cell = document.createElement('td');
      cell.className = 'student-completion-cell';
      cell.setAttribute('data-label', 'Completion');
      row.insertBefore(cell, actionCell);
    }
    const prn = rowPrn(row);
    paintCompletion(cell, completionByPrn.get(prn));
    return cell;
  }

  function openStudent(student, row) {
    if (student?.id && typeof window.openStudentModal === 'function') {
      window.openStudentModal(student.id);
      return;
    }
    row.cells[row.cells.length - 1]?.querySelector('button')?.click();
  }

  function updateMobileScore(row, prn) {
    const score = row.querySelector('.mobile-student-score');
    if (!score) return;
    const record = completionByPrn.get(prn);
    const value = Number.isFinite(Number(record?.completion)) ? `${Math.round(Number(record.completion))}%` : '—';
    if (score.dataset.profileCompletion === value) return;
    score.dataset.profileCompletion = value;
    score.replaceChildren(make('strong', '', value), make('small', '', 'PROFILE'));
  }

  function enhanceRow(row) {
    if (!(row instanceof HTMLTableRowElement)) return;
    if (row.cells.length === 1 && row.cells[0].colSpan > 1) {
      row.cells[0].colSpan = 9;
      return;
    }

    ensureCompletionCell(row);
    const cells = [...row.cells];
    const prn = rowPrn(row);
    const student = studentByPrn(prn);
    if (!student) return;

    if (row.dataset.mobileStudentCard === 'ready') {
      updateMobileScore(row, prn);
      return;
    }

    const name = compact(student.name) || 'Student';
    const meta = [prn, student.branch, student.class, student.year].map(compact).filter(Boolean).join(' · ');

    row.dataset.mobileStudentCard = 'ready';
    row.classList.add('student-mobile-directory-row');

    const card = make('button', 'mobile-student-summary');
    card.type = 'button';
    card.setAttribute('aria-label', `Open profile for ${name}`);

    const identity = make('span', 'mobile-student-identity');
    identity.append(make('strong', '', name), make('small', '', meta));

    const score = make('span', 'mobile-student-score');
    const record = completionByPrn.get(prn);
    const completion = Number.isFinite(Number(record?.completion)) ? `${Math.round(Number(record.completion))}%` : '—';
    score.dataset.profileCompletion = completion;
    score.append(make('strong', '', completion), make('small', '', 'PROFILE'));

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
    ensureHeader();
    root.querySelectorAll?.('tr').forEach(enhanceRow);
    if (root.matches?.('tr')) enhanceRow(root);
  }

  function scopeKey() {
    const branch = document.getElementById('filterBranch')?.value || 'all';
    const year = document.getElementById('filterYear')?.value || 'all';
    return `${branch}|${year}`;
  }

  async function loadCompletion() {
    const key = scopeKey();
    const cached = completionCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      completionByPrn.clear();
      cached.rows.forEach(row => completionByPrn.set(String(row.prn), row));
      enhanceAll();
      return;
    }

    const sequence = ++requestSequence;
    const [branch, year] = key.split('|');
    const params = new URLSearchParams();
    if (branch && branch !== 'all') params.set('branch', branch);
    if (year && year !== 'all') params.set('year', year);
    params.set('_ts', String(Date.now()));
    const token = localStorage.getItem('tpo_admin_token');

    try {
      const response = await fetch(`/api/admin/profile-completion?${params.toString()}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' } : { 'Cache-Control': 'no-cache' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || sequence !== requestSequence) return;
      const rows = Array.isArray(data?.data?.rows) ? data.data.rows : [];
      completionCache.set(key, { at: Date.now(), rows });
      completionByPrn.clear();
      rows.forEach(row => completionByPrn.set(String(row.prn), row));
      enhanceAll();
    } catch (_) {}
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      enhanceAll();
      loadCompletion();
    }, 80);
  }

  injectStyles();
  enhanceAll();
  loadCompletion();

  ['filterBranch', 'filterYear'].forEach(id => document.getElementById(id)?.addEventListener('change', () => {
    completionByPrn.clear();
    scheduleRefresh();
  }));

  new MutationObserver(records => {
    let hasRows = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          enhanceAll(node);
          hasRows = true;
        }
      }
    }
    if (hasRows) scheduleRefresh();
  }).observe(tbody, { childList: true, subtree: true });
})();