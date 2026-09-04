const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('admin student directory loads profile completion enhancement', () => {
  const portalSections = read('public/js/portal-sections.js');
  const cards = read('public/js/admin-student-mobile-cards.js');

  assert.match(portalSections, /admin-student-mobile-cards\.js\?v=20260904-completion1/);
  assert.match(cards, /student-completion-head/);
  assert.match(cards, /student-completion-cell/);
  assert.match(cards, /\/api\/admin\/profile-completion/);
  assert.match(cards, /th\.textContent = 'Completion'/);
  assert.match(cards, /PROFILE/);
});
