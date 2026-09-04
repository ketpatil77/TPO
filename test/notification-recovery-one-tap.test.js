const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recovery = fs.readFileSync(path.join(__dirname, '../public/js/notification-settings-recovery.js'), 'utf8');

test('notification recovery uses direct native permission flow instead of long instruction modal', () => {
  assert.doesNotMatch(recovery, /notification-settings-steps|<ol|Tap the site-controls \/ tune icon/);
  assert.match(recovery, /Notification\.permission === 'default'/);
  assert.match(recovery, /enableMandatoryNotifications/);
  assert.match(recovery, /Allow notifications/);
});

test('notification recovery provides platform-native shortcuts for iPhone and Chromium', () => {
  assert.match(recovery, /display-mode: standalone/);
  assert.match(recovery, /navigator\.share/);
  assert.match(recovery, /app-settings:/);
  assert.match(recovery, /chrome:\/\/settings\/content\/siteDetails/);
  assert.match(recovery, /recheckOnReturn/);
});
