(() => {
    if (!document.body.classList.contains('observer-shell')) return;

    const section = document.getElementById('observerTab-dob');
    const list = document.getElementById('observerDobList');
    if (!section || !list) return;

    const storageModeKey = 'tpo-dob-view-mode';
    const storageHiddenKey = 'tpo-dob-view-hidden';
    let mode = localStorage.getItem(storageModeKey) || 'latest';
    let hidden = localStorage.getItem(storageHiddenKey) === 'true';
    if (!['all', 'latest', 'pending'].includes(mode)) mode = 'latest';

    const tableShell = list.closest('.table-shell');
    const toolbar = section.querySelector('.observer-toolbar');

    const controls = document.createElement('div');
    controls.className = 'dob-view-controls';
    controls.innerHTML = `
        <div class="dob-view-controls-top">
            <strong>DOB correction requests</strong>
            <label class="dob-hide-toggle">
                <span data-dob-hide-label>${hidden ? 'Show list' : 'Hide list'}</span>
                <input type="checkbox" data-dob-hide ${hidden ? 'checked' : ''} aria-label="Hide DOB correction request list">
            </label>
        </div>
        <div class="dob-mode-switch" role="group" aria-label="DOB request view">
            <button type="button" data-dob-mode="all">All</button>
            <button type="button" data-dob-mode="latest">Latest 2</button>
            <button type="button" data-dob-mode="pending">Pending</button>
        </div>`;

    if (toolbar) toolbar.insertAdjacentElement('afterend', controls);
    else section.prepend(controls);

    const hideInput = controls.querySelector('[data-dob-hide]');
    const hideLabel = controls.querySelector('[data-dob-hide-label]');

    function rows() {
        return [...list.querySelectorAll('tr')].filter(row => !row.querySelector('td[colspan]'));
    }

    function decorateRows() {
        const labels = ['PRN', 'Name', 'Submitted DOB', 'Status', 'Action'];
        rows().forEach(row => {
            [...row.cells].forEach((cell, index) => {
                if (labels[index]) cell.dataset.label = labels[index];
            });
        });
    }

    function applyView() {
        decorateRows();
        const allRows = rows();
        const visibleRows = mode === 'pending'
            ? allRows.filter(row => String(row.cells[3]?.textContent || '').toLowerCase().includes('pending'))
            : mode === 'latest'
                ? allRows.slice(0, 2)
                : allRows;
        const visibleSet = new Set(visibleRows);

        allRows.forEach(row => {
            row.hidden = !visibleSet.has(row);
            row.style.display = visibleSet.has(row) ? '' : 'none';
        });

        controls.querySelectorAll('[data-dob-mode]').forEach(button => {
            const active = button.dataset.dobMode === mode;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        if (tableShell) {
            tableShell.hidden = hidden;
            tableShell.style.display = hidden ? 'none' : '';
        }
        if (hideLabel) hideLabel.textContent = hidden ? 'Show list' : 'Hide list';
        if (hideInput) hideInput.checked = hidden;
    }

    controls.querySelectorAll('[data-dob-mode]').forEach(button => {
        button.addEventListener('click', () => {
            mode = button.dataset.dobMode;
            hidden = false;
            localStorage.setItem(storageModeKey, mode);
            localStorage.setItem(storageHiddenKey, 'false');
            applyView();
        });
    });

    hideInput?.addEventListener('change', () => {
        hidden = hideInput.checked;
        localStorage.setItem(storageHiddenKey, String(hidden));
        applyView();
    });

    const observer = new MutationObserver(() => requestAnimationFrame(applyView));
    observer.observe(list, { childList: true });
    applyView();
})();
