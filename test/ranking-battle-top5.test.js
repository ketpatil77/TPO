const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/profileRankingView.js'), 'utf8');

test('leaderboard battles include non-broadcast captures into the Top 5', () => {
  assert.match(source, /event\.event_type === 'rank_capture'/);
  assert.match(source, /Number\(event\.rank_to\) <= 5/);
  assert.match(source, /includeTopFiveCaptures/);
  assert.match(source, /leaderboard_events/);
});
