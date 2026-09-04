const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gateSource = fs.readFileSync(path.join(__dirname, '../public/js/push-gate-utils.js'), 'utf8');
const swSource = fs.readFileSync(path.join(__dirname, '../public/student-push-sw.js'), 'utf8');

test('browser notification permission is optional and never blocks the student workspace', () => {
    assert.match(gateSource, /Browser push is[\s\S]*optional enhancement/);
    assert.match(gateSource, /dashboard\.inert = false/);
    assert.match(gateSource, /openWorkspace\(\)/);
    assert.match(gateSource, /In-app notifications already work/);
});

test('permission prompt is only reached from explicit browser-alert enable action', () => {
    assert.match(gateSource, /enableOptionalBrowserNotifications/);
    assert.match(gateSource, /Notification\.requestPermission\(\)/);
    assert.match(gateSource, /data-enable-browser-alerts/);
});

test('service worker collapses push categories and suppresses duplicate visible pushes', () => {
    assert.match(swSource, /ait-profile-updates/);
    assert.match(swSource, /ait-placement-updates/);
    assert.match(swSource, /ait-portal-updates/);
    assert.match(swSource, /getNotifications\(\{ tag \}\)/);
    assert.match(swSource, /duplicate/);
    assert.match(swSource, /renotify: false/);
    assert.doesNotMatch(swSource, /renotify: true/);
});
