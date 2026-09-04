const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('proof verification fits actions inside the portal without horizontal scrolling', () => {
  const css = read('public/css/proof-workflow.css');
  assert.match(css, /\.proof-review-table-shell\{[^}]*overflow-x:hidden/s);
  assert.match(css, /\.proof-review-table\{[^}]*min-width:0!important/s);
  assert.match(css, /\.proof-review-actions\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(css, /\.proof-review-table th:nth-child\(6\),\.proof-review-table td:nth-child\(6\)\{width:22%\}/);
  assert.doesNotMatch(css, /\.proof-review-table\{[^}]*min-width:\s*9\d\dpx/s);
});

test('all authenticated portals load the current proof layout cache version', () => {
  const loader = read('public/js/portal-responsive.js');
  assert.match(loader, /\/css\/proof-workflow\.css\?v=20260904-fit1/);
});
