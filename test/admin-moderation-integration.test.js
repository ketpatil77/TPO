const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = fs.readFileSync(path.join(__dirname,'../src/routes/adminModeration.js'),'utf8');
const server = fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
const portal = fs.readFileSync(path.join(__dirname,'../public/js/portal-sections.js'),'utf8');
const adminUi = fs.readFileSync(path.join(__dirname,'../public/js/admin-submission-moderation.js'),'utf8');
const ranking = fs.readFileSync(path.join(__dirname,'../src/services/profileRankingEngine.js'),'utf8');

test('moderation routes are authenticated and mounted before legacy admin student routes', () => {
  assert.match(route,/router\.use\(authenticateAdmin\)/);
  assert.match(server,/app\.use\('\/api\/admin\/students', adminModerationRoutes\);\s*app\.use\('\/api\/admin\/students', adminStudentsRoutes\);/);
});

test('admin impersonation creates a student token and marks support preview', () => {
  assert.match(route,/adminImpersonation:\s*true/);
  assert.match(route,/impersonatedBy:\s*req\.admin\.adminId/);
  assert.match(route,/sessionVersion:\s*SESSION_VERSION/);
  assert.match(route,/expiresIn:\s*'2h'/);
  assert.match(route,/logAudit\('impersonate_student'/);
});

test('student support preview bypasses only the mandatory push gate for explicit impersonation URL', () => {
  assert.match(portal,/adminImpersonationRequested/);
  assert.match(portal,/has\('impersonate_token'\)/);
  assert.match(portal,/setMandatoryNotificationGate\(false\)/);
  assert.match(portal,/startStudentWorkspace/);
});

test('staff delete is allowlisted, audited, cache-clearing and proof-cleaning', () => {
  for (const table of ['student_projects','research_papers','internships','certificates']) assert.match(route,new RegExp(table));
  assert.match(route,/delete_student_submission/);
  assert.match(route,/cleanupEvidence/);
  assert.match(route,/clearCaches/);
});

test('deletion requires a human reason, audits it and notifies the affected student', () => {
  assert.match(route,/deletionReason\(req\.body\?\.reason\)/);
  assert.match(route,/5 to 300 characters/);
  assert.match(route,/deletion_reason:reason/);
  assert.match(route,/createStudentNotification/);
  assert.match(route,/Reason: \$\{reason\}/);
  assert.match(adminUi,/Delete with reason/);
  assert.match(adminUi,/shown to the student and stored in the audit history/);
  assert.match(adminUi,/JSON\.stringify\(\{ reason \}\)/);
});

test('admin modal loads automatic integrity scan and deletion controls', () => {
  assert.match(adminUi,/Automatic integrity scan/);
  assert.match(adminUi,/Trust \$\{Number\(summary\.trust_score/);
  assert.match(adminUi,/data-moderation-delete/);
  assert.match(adminUi,/Random audit/);
});

test('certificate scoring schedule remains first ten at two then one point five', () => {
  assert.match(ranking,/return index < 10 \? 2 : 1\.5/);
});
