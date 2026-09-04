const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lazy = fs.readFileSync(path.join(__dirname, '../public/js/student-ranking-lazy.js'), 'utf8');
const route = fs.readFileSync(path.join(__dirname, '../src/routes/profileRankingView.js'), 'utf8');

test('ranking competition loads only with lazy ranking module', () => {
  assert.match(lazy, /ranking-competition-v1\.js/);
  assert.match(lazy, /profile-ranking\.js/);
  assert.match(lazy, /loadRanking/);
});

test('ranking route keeps competition failure isolated from authoritative ranking', () => {
  assert.match(route, /enrichCollegeLeaderboard/);
  assert.match(route, /catch \(competitionError\)/);
  assert.match(route, /return res\.json\(\{ success: true, data \}\)/);
});

test('competition endpoint is authenticated through router middleware and no-store', () => {
  assert.match(route, /router\.use\(authenticateStudent\)/);
  assert.match(route, /router\.get\('\/competition'/);
  assert.match(route, /Cache-Control/);
});
