const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const competitionSource = fs.readFileSync(path.join(__dirname, '../src/services/rankingCompetition.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '../public/js/ranking-competition-v1.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, '../public/css/ranking-competition-v1.css'), 'utf8');
const migrationSource = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260904193000_add_leaderboard_competition_state.sql'), 'utf8');

test('ranking competition thresholds and public event rules are explicit', () => {
  assert.match(competitionSource, /PRESSURE_GAP\s*=\s*6/);
  assert.match(competitionSource, /SAFE_LEAD_GAP\s*=\s*20/);
  assert.match(competitionSource, /MAJOR_CLIMB\s*=\s*5/);
  assert.match(competitionSource, /num\(row\.rank\)===1/);
  assert.match(competitionSource, /num\(row\.rank\)<=3/);
  assert.match(competitionSource, /num\(old\.current_rank\)>10&&num\(row\.rank\)<=10/);
  assert.match(competitionSource, /rankDelta>=MAJOR_CLIMB/);
  assert.match(competitionSource, /\[7,14\]/);
  assert.match(competitionSource, /weekly_top_gainer/);
});

test('ranking competition handles ties by finding a different rank rival', () => {
  assert.match(competitionSource, /function nearestDifferentRank/);
  assert.match(competitionSource, /num\(rows\[i\]\.rank \?\? rows\[i\]\.current_rank\) !== rank/);
  assert.match(competitionSource, /nearestDifferentRank\(active,i,-1\)/);
  assert.match(competitionSource, /nearestDifferentRank\(active,i,1\)/);
});

test('competition events are idempotent and baseline rollout is quiet', () => {
  assert.match(migrationSource, /event_key\s+text\s+not null\s+unique/i);
  assert.match(competitionSource, /if\(!states\.length\)/);
  assert.match(competitionSource, /initializeBaseline/);
  assert.match(migrationSource, /baseline/i);
});

test('competition UI is network-light and does not install mutation observers or fetch wrappers', () => {
  assert.doesNotMatch(uiSource, /MutationObserver/);
  assert.doesNotMatch(uiSource, /window\.fetch\s*=/);
  assert.match(uiSource, /setInterval\(tickHoldTimers,\s*60000\)/);
  assert.match(uiSource, /\/api\/student\/rankings-view\/competition/);
});

test('competition UI has mobile and reduced-motion contracts', () => {
  assert.match(cssSource, /@media \(max-width:600px\)/);
  assert.match(cssSource, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(cssSource, /grid-template-columns:1fr 1fr/);
  assert.match(cssSource, /min-height:36px/);
});

test('selected engagement labels are present', () => {
  for (const label of ['Rank Defender', 'Stronghold', 'Rank Guardian', 'Top 10%', 'Skill Builder', 'Project Builder', 'Verified Achiever']) {
    assert.match(competitionSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
