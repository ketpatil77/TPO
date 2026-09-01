(() => {
    if (window.portalTablesInitialized) return;
    window.portalTablesInitialized = true;
    const selector = '.data-table, .observer-table, .student-table';

    function labelTable(table) {
        const labels = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
        if (!labels.length) return;
        const wrapper = table.closest('.table-responsive, .table-shell, .student-table-shell');
        if (wrapper && !wrapper.dataset.scrollLabeled) {
            wrapper.dataset.scrollLabeled = 'true';
            wrapper.tabIndex = 0;
            wrapper.setAttribute('role', 'region');
            wrapper.setAttribute('aria-label', 'Records table');
            const hint = document.createElement('p'); hint.className = 'table-scroll-help'; hint.textContent = 'Scroll table horizontally to see all columns.';
            wrapper.before(hint);
            const updateScrollHint = () => {
                const overflow = wrapper.scrollWidth > wrapper.clientWidth + 1 && wrapper.clientWidth > 0;
                hint.hidden = !overflow;
                wrapper.setAttribute('aria-label', overflow ? 'Records table. Scroll horizontally to view all columns.' : 'Records table');
            };
            const resize = new ResizeObserver(updateScrollHint);
            resize.observe(wrapper); resize.observe(table);
            updateScrollHint();
        }
        table.querySelectorAll('thead th').forEach(cell => cell.setAttribute('scope', 'col'));
        table.querySelectorAll('tbody tr').forEach(row => {
            [...row.cells].forEach((cell, index) => {
                if (cell.colSpan > 1) return;
                cell.dataset.label = labels[index] || `Field ${index + 1}`;
            });
        });
    }

    function labelAll(root = document) {
        if (root.matches?.(selector)) labelTable(root);
        root.querySelectorAll?.(selector).forEach(labelTable);
    }

    document.addEventListener('DOMContentLoaded', () => {
        labelAll();
        new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) labelAll(node.closest?.(selector) || node);
        }))).observe(document.body, { childList: true, subtree: true });
    });
})();
