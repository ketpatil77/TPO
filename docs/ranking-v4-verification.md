# Ranking v4 verification notes

Ranking v4 keeps a single visible leaderboard renderer while preserving the detailed Profile Points calculation and progressive row loading.

## Expected behavior

- Fast rows remain visible while detailed score data is loading.
- The UI stays on the v4 renderer and does not swap back to the legacy list.
- Detailed score breakdowns replace placeholders when the data is ready without changing the row layout.
- Exactly one movement marker is visible for each row.
- Fast rows use profile photos when valid avatar data is available and allow full names to wrap.
- The v4 stylesheet provides readable contrast in dark and light themes.

## Certificate scoring

- Verified certificates 1–10: **2 points each**.
- Verified certificates after number 10: **1.5 points each**.
- Pending and rejected certificates: **0 points** until verification.

## Regression coverage

Tests cover the certificate index 9/10 boundary, reranking after scoring changes, prevention of MutationObserver loops, hiding of the legacy ranking container, preservation of score breakdowns, and narrow mobile layout behavior.

For the manual QA checklist, see [ranking-v4-qa.md](ranking-v4-qa.md).