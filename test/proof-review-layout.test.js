const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('proof verification keeps actions inside the portal without horizontal scrolling', () => {
  const css = read('public/css/proof-workflow.css');
  assert.match(css, /#tab-proof-review,#observerTab-proof-review\{[^}]*overflow-x:hidden!important/s);
  assert.match(css, /\.proof-review-table-shell\{[^}]*overflow:hidden!important/s);
  assert.match(css, /\.proof-review-table thead tr,\.proof-review-table tbody tr\{[^}]*display:grid!important/s);
  assert.match(css, /minmax\(225px,1\.3fr\)/);
  assert.match(css, /\.proof-review-actions\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/s);
  assert.match(css, /@media\(max-width:1100px\)[\s\S]*grid-template-areas:"student type" "branch branch" "entry entry" "uploaded uploaded" "actions actions"!important/);
  assert.doesNotMatch(css, /overflow-x:auto/);
  assert.doesNotMatch(css, /\.proof-review-table\{[^}]*min-width:\s*9\d\dpx/s);
});

test('all authenticated portals load the current proof layout cache version', () => {
  const loader = read('public/js/portal-responsive.js');
  assert.match(loader, /\/css\/proof-workflow\.css\?v=20260904-fit1/);
});
