const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const login = read('public/js/student-login-resilience.js');
const dashboard = read('public/js/student-dashboard-resilience.js');
const worker = read('worker/index.mjs');

test('student login uses one successful auth request and redirects without a secondary session gate', () => {
    assert.match(login, /addEventListener\('submit', resilientStudentLogin, true\)/);
    assert.match(login, /fetch\('\/api\/auth\/login'/);
    assert.match(login, /credentials: 'same-origin'/);
    assert.match(login, /LOGIN_TIMEOUT_MS = 15000/);
    assert.match(login, /window\.location\.replace\('\/dashboard'\)/);
    assert.doesNotMatch(login, /\/api\/auth\/me/);
});

test('student dashboard cannot be disabled by background notification setup', () => {
    assert.match(dashboard, /gate && !gate\.hidden/);
    assert.match(dashboard, /dashboard\.inert = false/);
    assert.match(dashboard, /removeAttribute\('aria-hidden'\)/);
    assert.match(dashboard, /startStudentWorkspace/);
    assert.match(dashboard, /PortalOperationFeedback\?\.forceHide/);
});

test('production worker injects both student resilience modules with cache-busted versions', () => {
    assert.match(worker, /student-login-resilience\.js\?v=20260904-login1/);
    assert.match(worker, /student-dashboard-resilience\.js\?v=20260904-dashboard1/);
    assert.match(worker, /patchLoginHtml/);
    assert.match(worker, /assetPath === '\/index\.html'/);
});
