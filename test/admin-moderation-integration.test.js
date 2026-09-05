const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = fs.readFileSync(path.join(__dirname,'../src/routes/adminModeration.js'),'utf8');
const server = fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
const portal = fs.readFileSync(path.join(__dirname,'../public/js/portal-sections.js'),'utf8');
const adminUi = fs.readFileSync(path.join(__dirname,'../public/js/admin-submission-moderation.js'),'utf8');
const ranking = fs.readFileSync(path.join(__dirname,'../src/services/profileRankingEngine.js'),'utf8');
const risk = fs.readFileSync(path.join(__dirname,'../src/services/submissionRisk.js'),'utf8');
const guard = fs.readFileSync(path.join(__dirname,'../src/routes/studentSubmissionGuard.js'),'utf8');

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

test('moderation UI exposes only approve and reject review actions', () => {
  assert.match(adminUi,/data-moderation-review="approve"/);
  assert.match(adminUi,/data-moderation-review="reject"/);
  assert.doesNotMatch(adminUi,/Delete with reason/);
  assert.match(route,/Decision must be approve or reject/);
  assert.match(route,/Rejection reason is required/);
  assert.match(route,/student_submission_review/);
  assert.match(route,/createStudentNotification/);
});

test('moderation labels show profile points instead of exposing risk score as points', () => {
  assert.match(adminUi,/Auto-approved · \$\{Number\(item\.profile_points/);
  assert.match(adminUi,/Needs review · 0 pts/);
  assert.match(adminUi,/Pending verification · 0 pts/);
  assert.doesNotMatch(adminUi,/Number\(m\.score/);
});

test('research accepts valid journal links without requiring doi.org', () => {
  assert.match(risk,/validHttps\(doiRaw\)/);
  assert.doesNotMatch(risk,/DOI URL is not a valid doi\.org path/);
  assert.match(risk,/journal, publication, DOI, or paper URL/);
});

test('projects compare repository owner with student GitHub profile and require project-specific evidence', () => {
  assert.match(risk,/githubProfileOwner/);
  assert.match(risk,/githubRepoOwner/);
  assert.match(risk,/does not match the student GitHub profile/);
  assert.match(risk,/project-specific live URL or GitHub repository URL/);
  assert.match(risk,/cannot be the same link/);
  assert.match(guard,/github_url:student\?\.github_url/);
});

test('duplicate fingerprints cover titles, repeated links and proof hashes', () => {
  assert.match(risk,/submissionFingerprints/);
  assert.match(risk,/project-title:/);
  assert.match(risk,/research-title:/);
  assert.match(risk,/project-url:/);
  assert.match(risk,/research-url:/);
  assert.match(risk,/cert-proof:/);
  assert.match(guard,/DUPLICATE_SUBMISSION/);
  assert.match(guard,/No cheating/);
});

test('ranking removes duplicate rejected and flagged points but honors staff approval', () => {
  assert.match(ranking,/duplicateIds\('project'/);
  assert.match(ranking,/markDuplicate\(risk\)/);
  assert.match(ranking,/risk\.staff_rejected/);
  assert.match(ranking,/risk\.staff_approved/);
  assert.match(ranking,/github_url:profile\.github_url/);
});

test('certificate scoring schedule remains first ten at two then one point five and only verified certs earn', () => {
  assert.match(ranking,/return index<10\?2:1\.5/);
  assert.match(ranking,/statusOf\(item\)==='verified'/);
  assert.match(ranking,/Pending\/rejected\/duplicate = 0 earned points/);
});
