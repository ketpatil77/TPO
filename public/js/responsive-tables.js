(() => {
    const selector = '.data-table, .observer-table, .student-table';

    function labelTable(table) {
        const labels = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
        if (!labels.length) return;
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
