const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-secret-that-is-at-least-32-characters-long';
const route = require('../src/routes/freeLearningV2');
const { RESOURCES, TARGET_COUNTS, recommendedFor } = route._catalog;

test('curated Free Learning catalog has the approved 75-resource provider mix', () => {
  assert.equal(RESOURCES.length, 75);
  assert.equal(new Set(RESOURCES.map(row => row.id)).size, 75);
  const providers = RESOURCES.reduce((out,row) => ((out[row.provider]=(out[row.provider]||0)+1),out),{});
  assert.deepEqual(providers, {'Simplilearn SkillUp':45,'HP LIFE':20,'IBM SkillsBuild':10});
  assert.equal(RESOURCES.filter(row => row.is_new).length, 30);
  assert.equal(RESOURCES.filter(row => row.provider === 'Simplilearn SkillUp' && row.is_new).length, 0);
  assert.ok(RESOURCES.every(row => row.course_free && row.certificate_free && /^https:\/\//.test(row.url)));
});

test('approved branch/year recommendation counts are exact', () => {
  for (const [branch, years] of Object.entries(TARGET_COUNTS)) {
    for (const [year, expected] of Object.entries(years)) {
      assert.equal(recommendedFor(branch, year).length, expected, `${branch} ${year}`);
    }
  }
});

test('new certificates are placed before existing curated certificates', () => {
  for (const [branch, years] of Object.entries(TARGET_COUNTS)) {
    for (const year of Object.keys(years)) {
      const rows = recommendedFor(branch, year);
      const firstOld = rows.findIndex(row => !row.is_new);
      if (firstOld < 0) continue;
      assert.equal(rows.slice(firstOld).some(row => row.is_new), false, `${branch} ${year}`);
    }
  }
});

test('legacy Simplilearn IDs remain stable while new IDs use a separate range', () => {
  assert.equal(RESOURCES.find(row => row.title === 'Python for Beginners').id, 1);
  assert.equal(RESOURCES.find(row => row.title === 'Introduction to Six Sigma').id, 141);
  assert.ok(RESOURCES.filter(row => row.is_new).every(row => row.id >= 1001));
});

test('server mounts curated discovery before legacy progress fallback', () => {
  const server = fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
  assert.match(server,/freeLearningV2Routes = require\('\.\/routes\/freeLearningV2'\)/);
  assert.match(server,/free-learning', freeLearningV2Routes\);\s*app\.use\('\/api\/student\/free-learning', freeLearningRoutes\)/s);
  const v2 = fs.readFileSync(path.join(__dirname,'../src/routes/freeLearningV2.js'),'utf8');
  assert.match(v2,/if\(!resource\) return next\(\)/);
});

test('student UI marks new certificates and avoids observer/fetch-wrapper regressions', () => {
  const ui = fs.readFileSync(path.join(__dirname,'../public/js/free-learning-v2.js'),'utf8');
  const worker = fs.readFileSync(path.join(__dirname,'../worker/index.mjs'),'utf8');
  assert.match(ui,/row\.is_new\?'<span class="student-new-badge is-new free-learning-new-badge"/);
  assert.doesNotMatch(ui,/MutationObserver/);
  assert.doesNotMatch(ui,/window\.fetch\s*=/);
  assert.match(worker,/free-learning-v2\.js\?v=20260906-catalog2/);
  assert.match(worker,/free-learning-v2\.css\?v=20260906-catalog2/);
});
