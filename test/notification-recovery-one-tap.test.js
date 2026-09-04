const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recovery = fs.readFileSync(path.join(__dirname, '../public/js/notification-settings-recovery.js'), 'utf8');

test('notification recovery uses direct native permission flow for fresh permission', () => {
  assert.match(recovery, /Notification\.permission === 'default'/);
  assert.match(recovery, /enableMandatoryNotifications/);
  assert.match(recovery, /Allow notifications/);
  assert.match(recovery, /Notification\.requestPermission/);
});

test('notification recovery owns both setup buttons including the iPhone gate button', () => {
  assert.match(recovery, /#retryNotificationSetup, #enableMandatoryNotifications/);
  assert.match(recovery, /stopImmediatePropagation/);
});

test('blocked permission no longer pretends chrome or ios settings can be opened by a webpage', () => {
  assert.doesNotMatch(recovery, /chrome:\/\/settings\/content\/siteDetails/);
  assert.doesNotMatch(recovery, /app-settings:/);
  assert.match(recovery, /Browsers intentionally prevent websites from forcing that permission screen open again/);
  assert.match(recovery, /I allowed it · Check now/);
});

test('blocked Android and iPhone recovery is platform aware and auto rechecks on return', () => {
  assert.match(recovery, /site controls icon beside the address/);
  assert.match(recovery, /Settings → Apps → AIT Placement Portal → Notifications/);
  assert.match(recovery, /display-mode: standalone/);
  assert.match(recovery, /navigator\.share/);
  assert.match(recovery, /visibilitychange/);
  assert.match(recovery, /window\.addEventListener\('focus', recheckOnReturn\)/);
  assert.match(recovery, /window\.addEventListener\('pageshow', recheckOnReturn\)/);
});

test('blocked-state recheck stays local until permission becomes granted', () => {
  assert.match(recovery, /if \(Notification\.permission === 'granted'\) return connectNotifications\(\)/);
  assert.match(recovery, /Still blocked\. Change the site permission to Allow/);
  assert.doesNotMatch(recovery, /setInterval\([^\n]*recheckPermission/);
});
