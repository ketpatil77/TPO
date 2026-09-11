# Ranking v4 QA checklist

Use this checklist after ranking-related changes and before deployment.

## Leaderboard rendering

- [ ] Fast rows remain visible while detailed score data loads.
- [ ] The UI does not fall back to the legacy list after the v4 renderer is active.
- [ ] Final detailed rows keep the expected visual layout.
- [ ] Exactly one movement marker is shown per row.
- [ ] Full student names wrap instead of being silently truncated.
- [ ] Profile photos load when valid avatar data is available.

## Scoring

- [ ] Score breakdown remains available after the fast-to-detailed transition.
- [ ] The first 10 verified certificates score 2 points each.
- [ ] Each verified certificate after the first 10 scores 1.5 points.
- [ ] Pending and rejected certificates contribute 0 points until verification.
- [ ] Reranking reflects certificate-score changes at the index 9/10 boundary.

## Responsive and theme checks

- [ ] Dark theme remains readable.
- [ ] Light theme remains readable.
- [ ] Narrow mobile layouts keep names and score information usable.
- [ ] No MutationObserver loop or repeated renderer updates occur.

## Regression checks

- [ ] The legacy ranking container remains hidden when v4 is active.
- [ ] Automated ranking and impersonation tests pass before release.