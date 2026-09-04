# Ranking v4 verification notes

This iteration keeps exactly one visible leaderboard renderer while the existing detailed Profile Points calculation runs in a hidden compatibility container.

Expected behavior:
- Fast rows remain visible; the UI never swaps back to the legacy list.
- Detailed score breakdowns replace the placeholder only when ready, without changing the visible row design.
- Exactly one movement marker is visible per row.
- Fast rows include signed profile photos when available and full wrapping names.
- Dark and light theme contrast is handled by the v4 stylesheet.
- Certificate scoring: first 10 verified certificates = 2 points each; every verified certificate after 10 = 1.5 points; pending/rejected = 0 until verification.

Edge cases checked by tests:
- certificate index 9 vs 10 boundary
- reranking after the scoring change
- no MutationObserver loop
- original legacy ranking container is hidden
- score breakdown remains present
- mobile narrow viewport rules exist
