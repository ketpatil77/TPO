(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const STYLE_ID = 'leaderboard-compact-score-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#tab-ranking .leaderboard-entry-details > summary,
#tab-ranking .ranking-exact-details > summary {
  list-style: none;
  cursor: pointer;
}
#tab-ranking .leaderboard-entry-details > summary::-webkit-details-marker,
#tab-ranking .ranking-exact-details > summary::-webkit-details-marker { display: none; }
#tab-ranking .leaderboard-entry-details > summary::after,
#tab-ranking .ranking-exact-details > summary::after {
  content: '⌄';
  display: inline-block;
  margin-left: 6px;
  font-size: .9em;
  transition: transform .16s ease;
}
#tab-ranking .leaderboard-entry-details[open] > summary::after,
#tab-ranking .ranking-exact-details[open] > summary::after { transform: rotate(180deg); }
#tab-ranking .ranking-exact-details {
  margin-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
}
#tab-ranking .ranking-exact-details > summary {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: .78rem;
  font-weight: 700;
}
#tab-ranking .ranking-exact-details[open] > summary {
  color: var(--text-heading);
}
@media (max-width: 760px) {
  #tab-ranking .leaderboard-entry-details {
    margin: 0 !important;
    padding: 0 11px 11px !important;
  }
  #tab-ranking .leaderboard-entry-details > summary {
    width: 100% !important;
    min-height: 34px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 4px !important;
    border-top: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent) !important;
    color: var(--text-muted) !important;
    font-size: 11px !important;
    line-height: 1 !important;
    text-align: center !important;
  }
  #tab-ranking .leaderboard-entry-details[open] > summary {
    color: var(--text-heading) !important;
  }
  #tab-ranking .ranking-score-explainer {
    min-height: 0 !important;
    margin: 8px 0 !important;
    padding: 9px 11px !important;
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 6px 10px !important;
    border-radius: 12px !important;
  }
  #tab-ranking .ranking-score-explainer > strong {
    margin: 0 !important;
    font-size: 15px !important;
    line-height: 1.1 !important;
  }
  #tab-ranking .ranking-score-explainer > strong.potential {
    font-size: 11px !important;
  }
  #tab-ranking .ranking-breakdown-grid-v3 {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px !important;
    margin: 0 !important;
  }
  #tab-ranking .ranking-category-score {
    min-height: 46px !important;
    padding: 8px 10px !important;
    border-radius: 10px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-template-rows: auto auto !important;
    align-items: center !important;
    gap: 1px 8px !important;
  }
  #tab-ranking .ranking-category-score small {
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    font-size: 10px !important;
    line-height: 1.15 !important;
    text-transform: capitalize !important;
  }
  #tab-ranking .ranking-category-score strong {
    grid-row: 1 / 3 !important;
    grid-column: 2 !important;
    font-size: 15px !important;
    line-height: 1 !important;
  }
  #tab-ranking .ranking-category-score em {
    margin: 0 !important;
    font-size: 8px !important;
    line-height: 1.1 !important;
  }
  #tab-ranking .ranking-exact-details {
    margin-top: 8px !important;
  }
  #tab-ranking .ranking-exact-details > summary {
    min-height: 36px !important;
    font-size: 11px !important;
  }
  #tab-ranking .ranking-explanation-list {
    margin-top: 7px !important;
  }
  #tab-ranking .ranking-reason-group {
    margin-bottom: 7px !important;
  }
}
`;
    document.head.appendChild(style);
  }

  function compact(details) {
    if (!details || details.dataset.compactScoreReady === 'true') return;
    details.dataset.compactScoreReady = 'true';

    const summary = details.querySelector(':scope > summary');
    if (summary) summary.textContent = 'Score details';

    const explainer = details.querySelector(':scope > .ranking-score-explainer');
    if (explainer) {
      const total = [...explainer.children].find(node => node.tagName === 'STRONG' && !node.classList.contains('potential'));
      const potential = explainer.querySelector('strong.potential');
      explainer.querySelectorAll(':scope > span').forEach(node => node.remove());
      if (total) total.textContent = total.textContent.replace(/\s*points?\s*$/i, ' pts total');
      if (potential) potential.textContent = potential.textContent.replace(/competition\s+pending/i, 'pending');
    }

    const grid = details.querySelector(':scope > .ranking-breakdown-grid-v3');
    if (grid) {
      grid.querySelectorAll('.ranking-category-score').forEach(card => {
        const points = Number.parseFloat(card.querySelector('strong')?.textContent || '0') || 0;
        const hasPending = card.classList.contains('has-pending');
        if (points <= 0 && !hasPending) {
          card.remove();
          return;
        }
        const state = card.querySelector('em');
        if (state && /^counted$/i.test(state.textContent.trim())) state.remove();
      });
    }

    const list = details.querySelector(':scope > .ranking-explanation-list');
    if (list) {
      const exact = document.createElement('details');
      exact.className = 'ranking-exact-details';
      const exactSummary = document.createElement('summary');
      exactSummary.textContent = 'Exact scoring items';
      exact.appendChild(exactSummary);
      list.before(exact);
      exact.appendChild(list);
    }
  }

  function scan(root = document) {
    if (root.matches?.('.leaderboard-entry-details')) compact(root);
    root.querySelectorAll?.('.leaderboard-entry-details').forEach(compact);
  }

  const list = document.getElementById('rankingList');
  if (!list) return;
  scan(list);

  if ('MutationObserver' in window) {
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      }));
    }).observe(list, { childList: true });
  }
})();
