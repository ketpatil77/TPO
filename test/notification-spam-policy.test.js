const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gateSource = fs.readFileSync(path.join(__dirname, '../public/js/push-gate-utils.js'), 'utf8');
const swSource = fs.readFileSync(path.join(__dirname, '../public/student-push-sw.js'), 'utf8');

test('notification assurance never hard-blocks portal content on browser permission', () => {
    assert.match(gateSource, /Hard-blocking site content until browser notification permission is granted/);
    assert.match(gateSource, /dashboard\.inert = false/);
    assert.match(gateSource, /neverBrowserGateWorkspace\(\)/);
    assert.match(gateSource, /Browser alerts are required for off-site placement updates/);
});

test('important in-app notifications require explicit acknowledgement', () => {
    assert.match(gateSource, /mandatoryImportantNotification/);
    assert.match(gateSource, /priority === 'important'/);
    assert.match(gateSource, /Acknowledge/);
    assert.match(gateSource, /acknowledgeImportant/);
    assert.match(gateSource, /markAllExceptMandatoryImportant/);
});

test('browser permission prompt only runs from explicit enable action', () => {
    assert.match(gateSource, /enableAssuredBrowserNotifications/);
    assert.match(gateSource, /Notification\.requestPermission\(\)/);
    assert.match(gateSource, /data-enable-browser-alerts/);
});

test('service worker collapses ordinary categories, deduplicates exact pushes, and re-notifies new ranking updates', () => {
    assert.match(swSource, /ait-profile-updates/);
    assert.match(swSource, /ait-placement-updates/);
    assert.match(swSource, /ait-portal-updates/);
    assert.match(swSource, /ait-ranking-updates/);
    assert.match(swSource, /tab=ranking/);
    assert.match(swSource, /renotify: true/);
    assert.match(swSource, /renotify: false/);
    assert.match(swSource, /getNotifications\(\{ tag \}\)/);
    assert.match(swSource, /duplicate/);
});
