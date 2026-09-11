# Ranking v4 summary

Ranking v4 stabilizes the visible leaderboard while preserving detailed score breakdowns and improving row rendering.

## Changes

- Keeps one visible leaderboard renderer instead of allowing legacy and v4 rows to compete for display.
- Loads fast rows first and fills detailed score information when it becomes available.
- Uses profile photos when valid avatar data is available.
- Prevents duplicate movement markers and keeps one marker per row.
- Preserves full student names by allowing them to wrap on narrow layouts.
- Applies the updated verified-certificate scoring rule.

## Certificate scoring

- First 10 verified certificates: **2 points each**.
- Each verified certificate after the first 10: **1.5 points each**.
- Pending or rejected certificates: **0 points** until verified.

See [ranking-v4-qa.md](ranking-v4-qa.md) for the verification checklist and [ranking-v4-verification.md](ranking-v4-verification.md) for implementation notes.