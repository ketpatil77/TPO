(() => {
    if (!document.body.classList.contains('observer-shell')) return;

    const section = document.getElementById('observerTab-dob');
    const list = document.getElementById('observerDobList');
    if (!section || !list) return;

    const storageModeKey = 'tpo-dob-view-mode';
    const storageOpenKey = 'tpo-dob-history-open';
    let mode = localStorage.getItem(storageModeKey) || 'latest';
    let historyOpen = localStorage.getItem(storageOpenKey) === 'true';
    if (!['all', 'latest', 'pending'].includes(mode)) mode = 'latest';

    const tableShell = list.closest('.table-shell');
    const toolbar = section.querySelector('.observer-toolbar');
    if (!tableShell) return;

    const details = document.createElement('details');
    details.className = 'task-disclosure dob-history-disclosure';
    details.open = historyOpen;

    const summary = document.createElement('summary');
    summary.innerHTML = '<strong>DOB correction request history</strong><span>Show or hide processed and pending requests.</span>';

    tableShell.before(details);
    details.append(summary, tableShell);

    const controls = document.createElement('div');
    controls.className = 'dob-view-controls';
    controls.innerHTML = `
        <div class="dob-mode-switch" role="group" aria-label="DOB request view">
            <button type="button" data-dob-mode="all">All</button>
            <button type="button" data-dob-mode="latest">Latest 2</button>
            <button type="button" data-dob-mode="pending">Pending</button>
        </div>`;
    tableShell.before(controls);

    function rows() {
        return [...list.querySelectorAll('tr')].filter(row => !row.querySelector('td[colspan]'));
    }

    function decorateRows() {
        const labels = ['PRN', 'Name', 'Submitted DOB', 'Branch', 'Status', 'Action'];
        rows().forEach(row => {
            [...row.cells].forEach((cell, index) => {
                if (labels[index]) cell.dataset.label = labels[index];
            });
        });
    }

    function statusCell(row) {
        const cells = [...row.cells];
        return cells.find(cell => /approved|rejected|pending/i.test(String(cell.textContent || ''))) || cells[cells.length - 2];
    }

    function applyView() {
        decorateRows();
        const allRows = rows();
        const visibleRows = mode === 'pending'
            ? allRows.filter(row => /pending/i.test(String(statusCell(row)?.textContent || '')))
            : mode === 'latest'
                ? allRows.slice(0, 2)
                : allRows;
        const visibleSet = new Set(visibleRows);

        allRows.forEach(row => {
            const visible = visibleSet.has(row);
            row.hidden = !visible;
            row.style.display = visible ? '' : 'none';
        });

        controls.querySelectorAll('[data-dob-mode]').forEach(button => {
            const active = button.dataset.dobMode === mode;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    controls.querySelectorAll('[data-dob-mode]').forEach(button => {
        button.addEventListener('click', event => {
            event.preventDefault();
            mode = button.dataset.dobMode;
            localStorage.setItem(storageModeKey, mode);
            details.open = true;
            localStorage.setItem(storageOpenKey, 'true');
            applyView();
        });
    });

    details.addEventListener('toggle', () => {
        historyOpen = details.open;
        localStorage.setItem(storageOpenKey, String(historyOpen));
    });

    const observer = new MutationObserver(() => requestAnimationFrame(applyView));
    observer.observe(list, { childList: true });
    applyView();
})();
