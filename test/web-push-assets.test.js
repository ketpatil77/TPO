const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTimeout } = require('../public/js/push-gate-utils');

test('mandatory notification setup cannot remain pending forever', async () => {
    await assert.rejects(withTimeout(new Promise(() => {}), 20, 'setup timed out'), /setup timed out/);
});

test('mandatory notification gate blocks workspace and prompts only after explicit click', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'public/js/dashboard.js'), 'utf8');
    const html = fs.readFileSync(path.join(process.cwd(), 'public/dashboard.html'), 'utf8');
    assert.match(source, /enableMandatoryNotifications'\)\.addEventListener\('click', enableMandatoryNotifications\)/);
    const enableStart = source.indexOf('async function enableMandatoryNotifications');
    const permissionPrompt = source.indexOf('Notification.requestPermission()', enableStart);
    assert.ok(enableStart > -1 && permissionPrompt > enableStart);
    assert.equal(source.slice(0, enableStart).includes('Notification.requestPermission()'), false);
    assert.match(source, /dashboard\.inert = blocked/);
    assert.match(source, /ensureMandatorySubscription\(data, registration\)/);
    assert.match(source, /withTimeout\([\s\S]*pushManager\.subscribe/);
    assert.match(source, /finally\s*{\s*button\.disabled = false/);
    assert.match(html, /push-gate-utils\.js/);
    assert.match(html, /id="mandatoryNotificationGate"/);
    assert.doesNotMatch(html, /pushOptInButton|pushTestButton|Send test|Disable reminders/);
});

test('student service worker displays push payload and opens profile editor', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'public/student-push-sw.js'), 'utf8');
    assert.match(source, /addEventListener\('push'/);
    assert.match(source, /showNotification/);
    assert.match(source, /icon:\s*message\.icon/);
    assert.match(source, /badge:\s*message\.badge/);
    assert.match(source, /renotify:\s*true/);
    assert.match(source, /skipWaiting/);
    assert.match(source, /clients\.claim/);
    assert.match(source, /addEventListener\('notificationclick'/);
    assert.match(source, /edit-profile/);
});

test('all student alert creation paths use shared Web Push dispatcher', () => {
    const routes = ['workflow.js', 'observer.js', 'launchOperations.js', 'adminDrives.js', 'advanced.js']
        .map(file => fs.readFileSync(path.join(process.cwd(), 'src/routes', file), 'utf8'));
    for (const source of routes) assert.doesNotMatch(source, /db\.insert\(['"]notifications['"]/);
    assert.match(routes[0], /createStudentNotification/);
    assert.match(routes[1], /createStudentNotification/);
    assert.match(routes[2], /createStudentNotification/);
    assert.match(routes[3], /notifyDriveOpen[\s\S]*createStudentNotification/);
    assert.match(routes[4], /calendar_events[\s\S]*createStudentNotification/);
    assert.match(routes[4], /interviews[\s\S]*createStudentNotification/);
    assert.match(routes[4], /offers[\s\S]*createStudentNotification/);
    assert.match(routes[4], /assessments[\s\S]*createStudentNotification/);
});
