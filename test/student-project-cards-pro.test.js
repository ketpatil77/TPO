const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../public/css/student-projects-pro.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/js/student-projects-pro.js'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../worker/index.mjs'), 'utf8');

test('student project cards use aligned responsive rows without desktop grid holes', () => {
  assert.match(css, /align-items:\s*stretch\s*!important/);
  assert.match(css, /align-self:\s*stretch\s*!important/);
  assert.match(css, /height:\s*100%\s*!important/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,1fr\)\s*!important/);
  assert.match(css, /height:\s*auto\s*!important/);
});

test('project card body grows so footers align while summaries stay scan-friendly', () => {
  assert.match(css, /\.project-card-body\s*\{[\s\S]*flex:\s*1 1 auto/);
  assert.match(css, /-webkit-line-clamp:\s*3/);
  assert.match(css, /margin-top:\s*auto/);
});

test('mobile project actions use full-width link rail and proper touch targets', () => {
  assert.match(css, /Phone footer is intentionally two-level/);
  assert.match(css, /flex-direction:\s*column/);
  assert.match(css, /min-height:\s*40px\s*!important/);
  assert.match(css, /width:\s*100%/);
});

test('project enhancer moves secondary actions out of the title area and compacts tags', () => {
  assert.match(js, /project-card-footer/);
  assert.match(js, /footer\.appendChild\(actions\)/);
  assert.match(js, /chips\.slice\(5\)/);
  assert.match(js, /project-tag-more/);
  assert.match(js, /MutationObserver/);
});

test('student dashboard loads project redesign as versioned static assets', () => {
  assert.match(worker, /student-projects-pro\.css\?v=20260904-projects2/);
  assert.match(worker, /student-projects-pro\.js\?v=20260904-projects2/);
});
