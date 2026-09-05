'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('fast leaderboard uses the live Profile Point engine instead of stale rank-state points', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/rankingQuickV4.js'), 'utf8');
  assert.match(source, /buildLeaderboard\(currentStudentId, 'all', 'all'\)/);
  assert.match(source, /applyCertificateScoringV4\(liveRaw\)/);
  assert.match(source, /points:\s*num\(row\.points\)/);
  assert.match(source, /rank:\s*num\(row\.rank\)/);
  assert.doesNotMatch(source, /points:\s*num\(state\.current_points\)/);
  assert.doesNotMatch(source, /rank:\s*num\(state\.current_rank\)/);
});

test('score breakdown endpoint and fast leaderboard both bypass browser caches', () => {
  const ui = fs.readFileSync(path.join(__dirname, '../public/js/ranking-stable-v4.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/profileRankingView.js'), 'utf8');
  assert.match(ui, /rankings-view\/fast/);
  assert.match(ui, /rankings-view\/details/);
  assert.match(ui, /cache:'no-store'/);
  assert.match(route, /no-store, no-cache, must-revalidate/);
});
