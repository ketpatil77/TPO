const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../public/css/ranking-stable-v4.css'), 'utf8');

test('ranking score breakdown content stays left-aligned across categories and evidence rows', () => {
  assert.match(css, /\.ranking-v5-breakdown-body\s*\{[^}]*text-align:left/s);
  assert.match(css, /\.ranking-breakdown-grid-v3\s*\{[^}]*text-align:left/s);
  assert.match(css, /\.ranking-category-score\s*\{[^}]*text-align:left/s);
  assert.match(css, /\.ranking-v5-detail-group\s*\{[^}]*text-align:left/s);
  assert.match(css, /\.ranking-v5-evidence\s*>\s*div\s*\{[^}]*text-align:left/s);
  assert.match(css, /\.ranking-v5-evidence\s+b\s*\{[^}]*text-align:right/s);
});
