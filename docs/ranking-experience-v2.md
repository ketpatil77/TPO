# Ranking experience v2

This UI-only iteration keeps the existing Profile and CGPA section unchanged while moving the Ranking tab directly after it.

It adds:
- idle JS preloading so opening Ranking does not wait for script downloads;
- a fast ranking snapshot from the existing competition endpoint before the full detailed leaderboard finishes calculating;
- a persistent hide/show control for the Defense leaderboard UI only; rank tracking continues server-side;
- personalized badge surfacing from existing profile/rank/verification signals;
- explicit dark/light contrast overrides and mobile breakpoints for the compact ranking cards.

No database schema changes are required.
