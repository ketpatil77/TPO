const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wrangler = fs.readFileSync(path.join(__dirname, '../wrangler.jsonc'), 'utf8');
const budget = fs.readFileSync(path.join(__dirname, '../public/js/request-budget.js'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../worker/index.mjs'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '../public/student-push-sw.js'), 'utf8');
const recovery = fs.readFileSync(path.join(__dirname, '../public/js/notification-settings-recovery.js'), 'utf8');

test('static JS and CSS bypass Worker billing path', () => {
  assert.doesNotMatch(wrangler, /"\/js\/\*"/);
  assert.doesNotMatch(wrangler, /"\/css\/\*"/);
  assert.match(wrangler, /"\/api\/\*"/);
});

test('profile reminder cron does not wake Worker every five minutes', () => {
  assert.match(wrangler, /"PUSH_REMINDER_CRON": "0 4 \*\/3 \* \*"/);
  assert.doesNotMatch(wrangler, /"\*\/5 \* \* \* \*"/);
});

test('student notifications are push-driven instead of continuously polling Worker', () => {
  assert.match(budget, /source\.includes\('loadStudentNotifications'\)\) return 0/);
  assert.match(budget, /AIT_PUSH_RECEIVED/);
  assert.match(budget, /refreshStudentNotifications\(true\)/);
  assert.match(serviceWorker, /notifyOpenPortalClients/);
  assert.match(serviceWorker, /client\.postMessage\(\{/);
  assert.match(serviceWorker, /AIT_PUSH_RECEIVED/);
  assert.match(recovery, /source\.includes\('scheduleImportantSync'\)/);
  assert.match(recovery, /return 0/);
});

test('notification recovery implementation stays platform-aware but is excluded from the production student dashboard', () => {
  assert.doesNotMatch(worker, /notification-settings-recovery\.js\?v=/);
  assert.match(recovery, /#retryNotificationSetup, #enableMandatoryNotifications/);
  assert.match(recovery, /Notification\.permission === 'default'/);
  assert.match(recovery, /Notification\.permission === 'denied'/);
  assert.match(recovery, /Allow notifications/);
  assert.match(recovery, /I allowed it · Check now/);
  assert.match(recovery, /site controls icon beside the address/);
  assert.match(recovery, /Open iPhone share menu/);
  assert.match(recovery, /navigator\.share/);
  assert.match(recovery, /visibilitychange/);
  assert.match(recovery, /window\.addEventListener\('focus'/);
  assert.match(recovery, /window\.addEventListener\('pageshow'/);
  assert.doesNotMatch(recovery, /chrome:\/\/settings\/content\/siteDetails/);
  assert.doesNotMatch(recovery, /app-settings:/);
  assert.doesNotMatch(recovery, /Open site settings/);
});

test('dashboard request budget coalesces reads, suppresses subscription rewrites and stays off the production student dashboard', () => {
  assert.match(budget, /2 \* 60 \* 1000/);
  assert.match(budget, /inflight/);
  assert.match(budget, /pushSubscriptionCache/);
  assert.match(budget, /6 \* 60 \* 60 \* 1000/);
  assert.match(budget, /\/api\/student\/push\/config/);
  assert.match(worker, /request-budget\.js\?v=20260904-free-tier2/);
  const studentBlock = worker.match(/if \(assetPath === '\/dashboard\.html'\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.doesNotMatch(studentBlock, /request-budget\.js/);
});
