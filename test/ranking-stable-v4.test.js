const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { certificatePointAtV4, certificateTotalV4, applyCertificateScoringV4 } = require('../src/services/rankingScoreV4');
const stableJs = fs.readFileSync(path.join(__dirname, '../public/js/ranking-stable-v4.js'), 'utf8');
const stableCss = fs.readFileSync(path.join(__dirname, '../public/css/ranking-stable-v4.css'), 'utf8');
const lazy = fs.readFileSync(path.join(__dirname, '../public/js/student-ranking-lazy.js'), 'utf8');
const route = fs.readFileSync(path.join(__dirname, '../src/routes/profileRankingView.js'), 'utf8');

test('certificate scoring v4 gives 2 points for first ten and 1.5 after ten', () => {
  assert.equal(certificatePointAtV4(0), 2);
  assert.equal(certificatePointAtV4(9), 2);
  assert.equal(certificatePointAtV4(10), 1.5);
  assert.equal(certificatePointAtV4(24), 1.5);
  assert.equal(certificateTotalV4(10), 20);
  assert.equal(certificateTotalV4(12), 23);
});

test('certificate scoring v4 reranks rows and updates rule copy', () => {
  const data = {
    current: { student_id:'a' },
    rows: [
      { student_id:'a', is_me:true, name:'A', points:20, pending_points:0, potential_points:20, breakdown:{certificates:5}, pending_breakdown:{certificates:0}, certificate_counts:{verified:10,pending:0}, explanations:{certificates:[]}, pending_explanations:{certificates:[]} },
      { student_id:'b', is_me:false, name:'B', points:30, pending_points:0, potential_points:30, breakdown:{certificates:0}, pending_breakdown:{certificates:0}, certificate_counts:{verified:0,pending:0}, explanations:{certificates:[]}, pending_explanations:{certificates:[]} }
    ],
    rules:{}
  };
  const result = applyCertificateScoringV4(data);
  assert.equal(result.rows.find(row => row.student_id === 'a').points, 35);
  assert.equal(result.rows.find(row => row.student_id === 'a').rank, 1);
  assert.match(result.rules.certificates, /first 10 verified certificates = 2 points each/i);
});

test('stable ranking keeps the legacy renderer hidden and owns the visible list', () => {
  assert.match(stableJs, /original\.hidden = true/);
  assert.match(stableJs, /rankingStableListV4/);
  assert.match(stableJs, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(stableJs, /MutationObserver/);
});

test('stable rows include photos, full names, movement, momentum and score breakdown', () => {
  assert.match(stableJs, /row\.avatar_url/);
  assert.match(stableJs, /ranking-v5-move/);
  assert.match(stableJs, /ranking-v5-momentum/);
  assert.match(stableJs, /Score breakdown/);
  assert.match(stableCss, /white-space:normal!important/);
  assert.match(stableCss, /text-overflow:clip!important/);
  assert.match(stableCss, /rank-chaos-inline.*display:none!important/s);
});

test('fast and per-student detail endpoints are wired into ranking', () => {
  assert.match(route, /router\.get\('\/fast'/);
  assert.match(route, /router\.get\('\/details\/:studentId'/);
  assert.match(route, /applyCertificateScoringV4/);
  assert.match(stableJs, /rankings-view\/fast/);
  assert.match(stableJs, /rankings-view\/details/);
  assert.match(lazy, /ranking-stable-v4\.js/);
});

test('stable ranking has explicit mobile and light-theme treatment', () => {
  assert.match(stableCss, /@media \(max-width:700px\)/);
  assert.match(stableCss, /@media \(max-width:430px\)/);
  assert.match(stableCss, /:root\[data-theme="light"\]/);
  assert.match(stableCss, /flex-wrap:nowrap!important/);
});
