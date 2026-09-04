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
  assert.match(lazy, /ranking-experience-v2\.js/);
});

test('quick competition snapshot gives immediate rank and student rows', () => {
  assert.match(ux, /rankings-view\/competition/);
  assert.match(ux, /renderQuickPreview/);
  assert.match(ux, /updating full leaderboard/);
  assert.match(ux, /slice\(0,15\)/);
  assert.doesNotMatch(ux, /MutationObserver/);
  assert.doesNotMatch(ux, /window\.fetch\s*=/);
});

test('defense leaderboard visibility is local UI state only', () => {
  assert.match(ux, /ait-ranking-defense-hidden/);
  assert.match(ux, /localStorage\.setItem\(CACHE_KEY/);
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
