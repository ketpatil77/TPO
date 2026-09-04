const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lazy = fs.readFileSync(path.join(__dirname, '../public/js/student-ranking-lazy.js'), 'utf8');
const ux = fs.readFileSync(path.join(__dirname, '../public/js/ranking-experience-v2.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/css/ranking-experience-v2.css'), 'utf8');

test('ranking is placed directly after Profile and CGPA without changing other tab order', () => {
  assert.match(lazy, /tab-edit-profile/);
  assert.match(lazy, /profile\.after\(button\)/);
  assert.doesNotMatch(lazy, /competitionTab|researchTab/);
});

test('ranking modules preload while full profile ranking data stays deferred until open', () => {
  assert.match(lazy, /requestIdleCallback/);
  assert.match(lazy, /Ranking data deferred until the leaderboard opens/);
  assert.match(lazy, /profile-ranking\.js/);
  assert.match(lazy, /ranking-experience-v2\.js\?v=20260904-v3/);
});

test('quick competition snapshot stays visible while detailed scoring loads', () => {
  assert.match(ux, /rankings-view\/competition/);
  assert.match(ux, /renderQuickPreview/);
  assert.match(ux, /Detailed score breakdowns are loading in the background/);
  assert.match(ux, /keepFastRowsVisible/);
  assert.match(ux, /slice\(0,15\)/);
  assert.doesNotMatch(ux, /MutationObserver/);
  assert.doesNotMatch(ux, /window\.fetch\s*=/);
});

test('movement arrows and momentum meter render in fast and detailed rows', () => {
  assert.match(ux, /ranking-move-pill/);
  assert.match(ux, /ranking-meter-pill/);
  assert.match(ux, /↑\$\{n\}/);
  assert.match(ux, /↓\$\{Math\.abs\(n\)\}/);
  assert.match(ux, /annotateDetailedRows/);
  assert.match(css, /\.ranking-move-pill\.up/);
  assert.match(css, /\.ranking-move-pill\.down/);
  assert.match(css, /\.ranking-meter-pill\.stable/);
});

test('defense leaderboard visibility is local UI state only', () => {
  assert.match(ux, /ait-ranking-defense-hidden/);
  assert.match(ux, /localStorage\.setItem\(DEFENSE_KEY/);
  assert.match(ux, /rank-chaos-holds/);
  assert.doesNotMatch(ux, /leaderboard_rank_state|method:\s*['"](?:DELETE|PATCH|PUT)/);
});

test('personalized badge model includes rank, momentum, growth and existing profile badges', () => {
  for (const label of ['College #1','Top 3','Fast Climber','Hot Streak','Growth Streak','Unbeaten','Protected Lead','Battle Ready']) {
    assert.ok(ux.includes(label), `expected badge label ${label}`);
  }
  assert.match(ux, /c\.badges/);
});

test('dark and light themes have explicit readable card contrast and mobile layouts', () => {
  assert.match(css, /var\(--text-heading\) !important/);
  assert.match(css, /var\(--text-muted\) !important/);
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});
