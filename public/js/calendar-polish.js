(() => {
    if (!document.body.classList.contains('admin-dashboard-page')) return;

    const host = document.getElementById('driveCalendar');
    if (!host) return;

    function nativeButton(selector) {
        return host.querySelector(selector);
    }

    function currentTitle() {
        return host.querySelector('.fc-toolbar-title')?.textContent?.trim() || 'Placement Calendar';
    }

    function activeView() {
        if (nativeButton('.fc-dayGridMonth-button')?.classList.contains('fc-button-active')) return 'month';
        if (nativeButton('.fc-timeGridWeek-button')?.classList.contains('fc-button-active')) return 'week';
        if (nativeButton('.fc-listWeek-button')?.classList.contains('fc-button-active')) return 'list';
        return 'month';
    }

    function sync(toolbar) {
        if (!toolbar?.isConnected) return;
        const title = toolbar.querySelector('[data-calendar-title]');
        if (title) title.textContent = currentTitle();
        const view = activeView();
        toolbar.querySelectorAll('[data-calendar-view]').forEach(button => {
            const active = button.dataset.calendarView === view;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function trigger(selector, toolbar) {
        const button = nativeButton(selector);
        if (!button) return;
        button.click();
        requestAnimationFrame(() => sync(toolbar));
        setTimeout(() => sync(toolbar), 80);
    }

    function buildToolbar() {
        const fc = host.querySelector('.fc');
        const native = host.querySelector('.fc-header-toolbar');
        if (!fc || !native) return false;
        if (fc.querySelector('.ait-calendar-toolbar')) return true;

        const toolbar = document.createElement('div');
        toolbar.className = 'ait-calendar-toolbar';
        toolbar.setAttribute('aria-label', 'Placement calendar controls');
        toolbar.innerHTML = `
            <div class="ait-calendar-primary-row">
                <button class="ait-calendar-nav" type="button" data-calendar-action="prev" aria-label="Previous period">‹</button>
                <div class="ait-calendar-title" data-calendar-title aria-live="polite">${currentTitle()}</div>
                <button class="ait-calendar-nav" type="button" data-calendar-action="next" aria-label="Next period">›</button>
            </div>
            <div class="ait-calendar-secondary-row">
                <button class="ait-calendar-today" type="button" data-calendar-action="today">Today</button>
                <div class="ait-calendar-segmented" role="group" aria-label="Calendar view">
                    <button class="ait-calendar-view" type="button" data-calendar-view="month">Month</button>
                    <button class="ait-calendar-view" type="button" data-calendar-view="week">Week</button>
                    <button class="ait-calendar-view" type="button" data-calendar-view="list">List</button>
                </div>
            </div>`;

        native.insertAdjacentElement('afterend', toolbar);

        toolbar.querySelector('[data-calendar-action="prev"]').addEventListener('click', () => trigger('.fc-prev-button', toolbar));
        toolbar.querySelector('[data-calendar-action="next"]').addEventListener('click', () => trigger('.fc-next-button', toolbar));
        toolbar.querySelector('[data-calendar-action="today"]').addEventListener('click', () => trigger('.fc-today-button', toolbar));
        toolbar.querySelector('[data-calendar-view="month"]').addEventListener('click', () => trigger('.fc-dayGridMonth-button', toolbar));
        toolbar.querySelector('[data-calendar-view="week"]').addEventListener('click', () => trigger('.fc-timeGridWeek-button', toolbar));
        toolbar.querySelector('[data-calendar-view="list"]').addEventListener('click', () => trigger('.fc-listWeek-button', toolbar));

        sync(toolbar);
        return true;
    }

    if (!buildToolbar()) {
        const observer = new MutationObserver(() => {
            if (buildToolbar()) observer.disconnect();
        });
        observer.observe(host, { childList: true, subtree: true });
    }
})();
