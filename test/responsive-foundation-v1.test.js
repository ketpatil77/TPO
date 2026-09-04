const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../public/css/responsive-foundation-v1.css'), 'utf8');
const guard = fs.readFileSync(path.join(__dirname, '../public/js/responsive-viewport-guard.js'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../worker/index.mjs'), 'utf8');

test('responsive foundation is loaded by every authenticated workspace', () => {
  assert.match(worker, /responsive-foundation-v1\.css\?v=20260904-rf1/);
  assert.match(worker, /responsive-viewport-guard\.js\?v=20260904-rf1/);
  assert.match(worker, /patchDashboardHtml/);
});

test('foundation defines phone tablet desktop and low-height laptop behavior', () => {
  assert.match(css, /@media \(max-width: 599px\)/);
  assert.match(css, /@media \(min-width: 600px\) and \(max-width: 1023px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /@media \(min-width: 1024px\) and \(max-height: 800px\)/);
});

test('foundation prevents accidental horizontal document scrolling', () => {
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 280px\), 1fr\)\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('runtime viewport guard detects and marks layout overflow', () => {
  assert.match(guard, /documentElement\.scrollWidth > width/);
  assert.match(guard, /getBoundingClientRect\(\)/);
  assert.match(guard, /data-rf-overflow/);
  assert.match(guard, /rf-has-overflow/);
  assert.match(guard, /AITResponsive/);
  assert.match(guard, /MutationObserver/);
  assert.match(guard, /orientationchange/);
});

test('modal and control rules remain usable on phones', () => {
  assert.match(css, /--rf-control-h: 44px/);
  assert.match(css, /max-height: 92dvh/);
  assert.match(css, /flex: 1 1 120px/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
});
