const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = fs.readFileSync(path.join(__dirname, '../public/js/student-experience-suite-v1.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/css/student-experience-suite-v1.css'), 'utf8');
const guard = fs.readFileSync(path.join(__dirname, '../public/js/responsive-viewport-guard.js'), 'utf8');
const route = fs.readFileSync(path.join(__dirname, '../src/routes/studentExperience.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
const publicHtml = fs.readFileSync(path.join(__dirname, '../public/public-profile.html'), 'utf8');

test('student suite contains the complete roadmap surfaces', () => {
  for (const marker of ['studentCommandCenter','studentMobileDock','Career readiness','Next best action','Rank movement','Achievements','Profile strength','Recent activity','Opportunity for you','Ask Career Copilot','Share your AIT profile']) {
    assert.match(ui, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('mobile navigation and command center are intentionally responsive', () => {
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:699px\)/);
  assert.match(css, /\.exp-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.student-mobile-dock\{/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.doesNotMatch(css, /min-width:\s*[4-9]\d\dpx/);
});

test('rank history is bounded and stored without a polling loop', () => {
  assert.match(ui, /ait-rank-history:/);
  assert.match(ui, /slice\(-30\)/);
  assert.match(ui, /rankMovement\(\)/);
  assert.doesNotMatch(ui, /setInterval\(/);
});

test('notification grouping decorates the inbox instead of opening repeated modals', () => {
  assert.match(ui, /decorateNotifications/);
  assert.match(ui, /Today/);
  assert.match(ui, /Earlier this week/);
  assert.match(ui, /exp-notification-category/);
  assert.doesNotMatch(ui, /mandatoryImportantNotification/);
});

test('experience backend offers one consolidated home request plus copilot and sharing', () => {
  assert.match(route, /student\.get\('\/home'/);
  assert.match(route, /student\.post\('\/copilot'/);
  assert.match(route, /student\.post\('\/share'/);
  assert.match(route, /publicRouter\.get\('\/profile'/);
  assert.match(route, /publicRouter\.get\('\/resume'/);
  assert.match(route, /student-public-profile/);
  assert.match(server, /\/api\/student\/experience/);
  assert.match(server, /\/api\/public/);
});

test('public profile intentionally excludes private contact fields from returned student data', () => {
  const publicSection = route.slice(route.indexOf('async function publicProfile'), route.indexOf("publicRouter.get('/profile'"));
  const returnedStudent = publicSection.slice(publicSection.indexOf('student: safeBundle.student'));
  assert.doesNotMatch(returnedStudent, /profile\.email/);
  assert.doesNotMatch(returnedStudent, /profile\.phone/);
  assert.match(publicHtml, /public-profile-v1\.css/);
  assert.match(publicHtml, /public-profile-v1\.js/);
});

test('responsive guard loads the experience suite only for the student workspace', () => {
  assert.match(guard, /student-dashboard-page/);
  assert.match(guard, /student-experience-suite-v1\.css/);
  assert.match(guard, /student-experience-suite-v1\.js/);
});
