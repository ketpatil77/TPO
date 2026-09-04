const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const inbox = fs.readFileSync(path.join(__dirname, '../public/js/notification-inbox-experience.js'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../worker/index.mjs'), 'utf8');

test('important update inbox implementation still supports a one-time handoff when explicitly used', () => {
  assert.match(inbox, /Got it · Open inbox/);
  assert.match(inbox, /more in inbox/);
  assert.match(inbox, /pendingInboxHandoff/);
  assert.match(inbox, /setInboxMode\(true\)/);
  assert.match(inbox, /openNotificationCenter/);
  assert.match(inbox, /portal will not interrupt you one-by-one/);
});

test('remaining important updates stay in the inbox instead of reopening the blocking modal', () => {
  assert.match(inbox, /sessionStorage\.setItem\(SUPPRESSION_KEY/);
  assert.match(inbox, /hideRepeatedInterrupt/);
  assert.match(inbox, /box\.hidden = true/);
  assert.match(inbox, /notification-item\.notification-unread/);
});

test('inbox mark-all remains an explicit way to clear a large notification batch', () => {
  assert.match(inbox, /notifications\/read-all/);
  assert.match(inbox, /markAllFromInbox/);
  assert.match(inbox, /setInboxMode\(false\)/);
});

test('production student dashboard excludes the freeze-prone inbox observer', () => {
  assert.doesNotMatch(worker, /notification-inbox-experience\.js\?v=/);
  assert.match(worker, /student-dashboard-interaction-hotfix\.js\?v=20260904-unlock6/);
});
