(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const STYLE_ID = 'leaderboard-compact-score-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#tab-ranking .leaderboard-entry-details {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 12px 10px !important;
  box-sizing: border-box !important;
  text-align: center !important;
}
#tab-ranking .leaderboard-entry-details > summary {
  width: 100% !important;
  min-height: 32px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 5px !important;
  list-style: none !important;
  cursor: pointer !important;
  color: var(--text-muted) !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  text-align: center !important;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent) !important;
}
#tab-ranking .leaderboard-entry-details > summary::-webkit-details-marker { display: none !important; }
#tab-ranking .leaderboard-entry-details > summary::after {
  content: '⌄';
  display: inline-block;
  margin-left: 3px;
  font-size: .9em;
  transition: transform .16s ease;
}
#tab-ranking .leaderboard-entry-details[open] > summary::after { transform: rotate(180deg); }
#tab-ranking .leaderboard-entry-details[open] > summary { color: var(--text-heading) !important; }

#tab-ranking .ranking-score-explainer {
  width: min(100%, 520px) !important;
  min-height: 0 !important;
  margin: 8px auto !important;
  padding: 8px 10px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-wrap: wrap !important;
  gap: 6px 10px !important;
  border-radius: 10px !important;
  text-align: center !important;
}
#tab-ranking .ranking-score-explainer > strong {
  margin: 0 !important;
  font-size: 14px !important;
  line-height: 1.1 !important;
}
#tab-ranking .ranking-score-explainer > strong.potential {
  font-size: 11px !important;
}

#tab-ranking .ranking-breakdown-grid-v3 {
  width: min(100%, 520px) !important;
  margin: 0 auto !important;
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 6px !important;
}
#tab-ranking .ranking-category-score {
  min-width: 0 !important;
  min-height: 42px !important;
  padding: 7px 8px !important;
  display: grid !important;
  place-items: center !important;
  gap: 2px !important;
  border-radius: 9px !important;
  text-align: center !important;
}
#tab-ranking .ranking-category-score small {
  width: 100% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  font-size: 9px !important;
  line-height: 1.1 !important;
  text-transform: capitalize !important;
}
#tab-ranking .ranking-category-score strong {
  font-size: 14px !important;
  line-height: 1 !important;
}
#tab-ranking .ranking-category-score em {
  margin: 0 !important;
  font-size: 8px !important;
  line-height: 1.05 !important;
}

/* Exact evidence rows were useful for debugging, not for a leaderboard. */
#tab-ranking .ranking-exact-details,
#tab-ranking .ranking-explanation-list {
  display: none !important;
}

@media (max-width: 760px) {
  #tab-ranking .leaderboard-entry-details {
    padding: 0 10px 9px !important;
  }
  #tab-ranking .leaderboard-entry-details > summary {
    min-height: 30px !important;
  }
  #tab-ranking .ranking-score-explainer {
    margin: 6px auto !important;
    padding: 7px 9px !important;
  }
  #tab-ranking .ranking-breakdown-grid-v3 {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 5px !important;
  }
  #tab-ranking .ranking-category-score {
    min-height: 38px !important;
    padding: 6px 8px !important;
  }
}
`;
    document.head.appendChild(style);
  }

  function compact(details) {
    if (!details || details.dataset.compactScoreReady === 'true') return;
    details.dataset.compactScoreReady = 'true';

    const summary = details.querySelector(':scope > summary');
    if (summary) summary.textContent = 'Score breakdown';

    const explainer = details.querySelector(':scope > .ranking-score-explainer');
    if (explainer) {
      const total = [...explainer.children].find(node => node.tagName === 'STRONG' && !node.classList.contains('potential'));
      const potential = explainer.querySelector('strong.potential');
      explainer.querySelectorAll(':scope > span').forEach(node => node.remove());
      if (total) total.textContent = total.textContent.replace(/\s*points?\s*$/i, ' pts');
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

    /* Keep only useful category totals. The old item-by-item audit caused multi-screen scrolling. */
    details.querySelector(':scope > .ranking-explanation-list')?.remove();
    details.querySelector(':scope > .ranking-exact-details')?.remove();
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
