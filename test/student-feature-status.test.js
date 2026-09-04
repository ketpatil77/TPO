const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '../public/js/student-feature-status.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/css/student-feature-status.css'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../worker/index.mjs'), 'utf8');

test('student feature registry keeps current discovery labels explicit', () => {
  assert.match(js, /tab-competitions[^\n]*status: 'new'/);
  assert.match(js, /tab-free-learning[^\n]*status: 'new'/);
  assert.match(js, /tab-certificates[^\n]*status: 'new'/);
  assert.match(js, /tab-ranking', 'tab-ranking-lazy'[^\n]*status: 'hot'/);
});

test('ranking HOT badge survives lazy-tab replacement and loading text changes', () => {
  assert.match(js, /tab-ranking-lazy/);
  assert.match(js, /MutationObserver\(queueApply\)/);
  assert.match(js, /childList: true/);
  assert.match(js, /badge\.textContent !== label/);
  assert.match(js, /normalized === 'hot' \? 'HOT' : 'NEW'/);
});

test('feature observer updates are idempotent instead of feeding themselves forever', () => {
  assert.match(js, /button\.dataset\.featureStatus !== normalized/);
  assert.match(js, /button\.dataset\.featureKey !== key/);
  assert.match(js, /attributeFilter: \['aria-controls', 'data-feature-status'\]/);
});

test('feature badges are persistent and intentionally non-pulsing', () => {
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /\.student-new-badge\.is-hot/);
  assert.match(css, /\.student-new-badge\.is-new/);
  assert.doesNotMatch(js, /ait-feature-seen/);
});

test('future modules have a declarative NEW badge path and registration API', () => {
  assert.match(js, /data-feature-status="new" or "hot"/);
  assert.match(js, /window\.AITFeatureStatus/);
  assert.match(js, /register\(key, controls, status = 'new'\)/);
});

test('student dashboard loads feature status assets', () => {
  assert.match(worker, /student-feature-status\.css\?v=20260904-feature1/);
  assert.match(worker, /student-feature-status\.js\?v=20260904-feature1/);
});
