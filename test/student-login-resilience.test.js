const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file),'utf8');
const login = read('public/js/student-login-resilience.js');
const dashboard = read('public/js/student-dashboard-interaction-hotfix.js');
const worker = read('worker/index.mjs');

test('student login uses one successful auth request and redirects without a secondary session gate', () => {
    assert.match(login, /addEventListener\('submit', resilientStudentLogin, true\)/);
    assert.match(login, /fetch\('\/api\/auth\/login'/);
    assert.match(login, /credentials: 'same-origin'/);
    assert.match(login, /LOGIN_TIMEOUT_MS = 15000/);
    assert.match(login, /window\.location\.replace\('\/dashboard'\)/);
    assert.doesNotMatch(login, /\/api\/auth\/me/);
});

test('student dashboard remains interactive when notification setup repeatedly relocks it', () => {
    assert.match(dashboard, /gate\.hidden = true/);
    assert.match(dashboard, /dashboard\.inert = false/);
    assert.match(dashboard, /removeAttribute\('aria-hidden'\)/);
    assert.match(dashboard, /remove\?\.\('notifications-blocked'\)/);
    assert.match(dashboard, /overflow-y: auto !important/);
    assert.match(dashboard, /touch-action: pan-y !important/);
    assert.match(dashboard, /setMandatoryNotificationGate = window\.setMandatoryNotificationGate/);
    assert.match(dashboard, /MutationObserver/);
    assert.match(dashboard, /visibilitychange/);
});

test('production student dashboard excludes freeze-prone notification observers', () => {
    assert.match(worker, /student-login-resilience\.js\?v=20260904-login1/);
    assert.match(worker, /student-dashboard-interaction-hotfix\.js\?v=20260904-unlock5/);
    assert.doesNotMatch(worker, /student-dashboard-resilience\.js\?v=/);
    const studentInjection = worker.match(/if \(assetPath === '\/dashboard\.html'\)[\s\S]*?return patched;/)?.[0] || worker;
    assert.doesNotMatch(studentInjection, /notification-inbox-experience\.js/);
    assert.doesNotMatch(studentInjection, /notification-settings-recovery\.js/);
});