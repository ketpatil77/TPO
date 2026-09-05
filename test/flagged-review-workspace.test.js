const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = fs.readFileSync(path.join(__dirname,'../src/routes/moderationQueue.js'),'utf8');
const server = fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
const queueUi = fs.readFileSync(path.join(__dirname,'../public/js/flagged-review-queue.js'),'utf8');
const adminModeration = fs.readFileSync(path.join(__dirname,'../public/js/admin-submission-moderation.js'),'utf8');
const observerHtml = fs.readFileSync(path.join(__dirname,'../public/observer-dashboard.html'),'utf8');

test('flagged queue is mounted for both TPO and TPC', () => {
  assert.match(server,/\/api\/admin\/moderation-queue', moderationQueueRoutes\.admin/);
  assert.match(server,/\/api\/observer\/moderation-queue', moderationQueueRoutes\.observer/);
  assert.match(route,/authenticateAdmin/);
  assert.match(route,/authenticateObserver/);
});

test('queue supports branch type risk name search and pagination', () => {
  assert.match(queueUi,/id="flaggedBranch"/);
  assert.match(queueUi,/id="flaggedType"/);
  assert.match(queueUi,/id="flaggedRisk"/);
  assert.match(queueUi,/id="flaggedSearch"/);
  assert.match(queueUi,/Student name, PRN, project, research, company, issuer/);
  assert.match(route,/pageSize/);
  assert.match(route,/branch_counts/);
  assert.match(route,/matchesSearch/);
});

test('TPC sees college queue but can review only own department', () => {
  assert.match(route,/can_review:!isObserver \|\| text\(row\.branch\)\.toUpperCase\(\) === observerDepartment/);
  assert.match(route,/TPC can review only submissions from their own department/);
  assert.match(queueUi,/College-wide flagged view/);
  assert.match(queueUi,/Read only/);
});

test('review UI exposes approve and reject without delete', () => {
  assert.match(queueUi,/data-flagged-decision="approve"/);
  assert.match(queueUi,/data-flagged-decision="reject"/);
  assert.doesNotMatch(queueUi,/Delete with reason/);
  assert.match(queueUi,/Reason must be 5 to 300 characters/);
});

test('review decisions persist, audit, notify, and clear ranking caches', () => {
  assert.match(route,/verification_status/);
  assert.match(route,/flagged_submission_review/);
  assert.match(route,/createStudentNotification/);
  assert.match(route,/kvCache\.clearPattern\('profile_ranking'\)/);
  assert.match(route,/kvCache\.clearPattern\('leaderboard'\)/);
});

test('queue is loaded in TPO and TPC workspaces with cache-busted asset', () => {
  assert.match(adminModeration,/flagged-review-queue\.js\?v=20260905-1/);
  assert.match(observerHtml,/flagged-review-queue\.js\?v=20260905-1/);
  assert.match(queueUi,/Flagged submissions/);
});
