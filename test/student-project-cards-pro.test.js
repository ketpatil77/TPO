const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../public/css/student-projects-pro.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/js/student-projects-pro.js'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../worker/index.mjs'), 'utf8');

test('student project cards use compact responsive pro layout', () => {
  assert.match(css, /align-items:start\s*!important/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:639px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)\s*!important/);
  assert.match(css, /height:auto\s*!important/);
  assert.doesNotMatch(css, /min-height:\s*(?:2[5-9]\d|[3-9]\d\d)px/);
});

test('project enhancer moves secondary actions out of the title area and compacts tags', () => {
  assert.match(js, /project-card-footer/);
  assert.match(js, /footer\.appendChild\(actions\)/);
  assert.match(js, /chips\.slice\(5\)/);
  assert.match(js, /project-tag-more/);
  assert.match(js, /MutationObserver/);
});

test('student dashboard loads project redesign as static CSS and JS assets', () => {
  assert.match(worker, /student-projects-pro\.css\?v=20260904-projects1/);
  assert.match(worker, /student-projects-pro\.js\?v=20260904-projects1/);
});
