const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { duplicateIds, submissionFingerprints, researchRisk, projectRisk } = require('../src/services/submissionRisk');

test('same research title inside one student profile is a duplicate even when URLs differ', () => {
  const a = { id:'a', title:'AI in Agriculture', publication:'Journal X', doi_url:'https://journal.example.org/article/1', paper_url:'https://files.example.org/paper-a.pdf' };
  const b = { id:'b', title:'AI in Agriculture', publication:'Journal X', doi_url:'https://journal.example.org/article/2', paper_url:'https://files.example.org/paper-b.pdf' };
  assert.deepEqual([...duplicateIds('research',[a,b])], ['b']);
  assert.equal(submissionFingerprints('research',a).some(v => v.startsWith('research-title:')), true);
});

test('research exact repeated evidence URL is a high-confidence duplicate', () => {
  const a = { id:'a', title:'Paper A', doi_url:'https://journal.example.org/article/1?utm=one' };
  const b = { id:'b', title:'Paper B', doi_url:'https://journal.example.org/article/1#section' };
  assert.deepEqual([...duplicateIds('research',[a,b])], ['b']);
});

test('valid non-doi journal URL is acceptable evidence', () => {
  const risk = researchRisk({
    title:'A Detailed Study of Smart Irrigation Systems',
    publication:'International Journal of Agricultural Technology',
    abstract:'This research presents a detailed evaluation of smart irrigation methods using field observations, sensor measurements, comparative analysis, implementation results and practical agricultural constraints across multiple operating conditions.',
    doi_url:'https://journal.example.org/articles/volume-5-paper-22'
  });
  assert.equal(risk.reasons.some(reason => /doi\.org/i.test(reason)), false);
  assert.equal(risk.hard_reject, false);
});

test('same project title is duplicate while one GitHub profile may own different repositories', () => {
  const a = { id:'a', title:'College ERP', repository_url:'https://github.com/student/erp-v1' };
  const b = { id:'b', title:'College ERP', repository_url:'https://github.com/student/erp-v2' };
  assert.deepEqual([...duplicateIds('project',[a,b])], ['b']);
  const first = projectRisk({title:'ERP One',summary:'A complete college ERP with attendance, student profiles, reporting and role-based administrative workflows.',technologies:'Node.js, PostgreSQL',repository_url:'https://github.com/student/erp-v1'},{github_url:'https://github.com/student'});
  const second = projectRisk({title:'ERP Two',summary:'A separate placement ERP with recruiter workflows, candidate filtering, analytics and secure staff administration.',technologies:'Node.js, PostgreSQL',repository_url:'https://github.com/student/erp-v2'},{github_url:'https://github.com/student'});
  assert.equal(first.auto_approved, true);
  assert.equal(second.auto_approved, true);
});

test('project repository and live URL cannot be the same link', () => {
  const risk = projectRisk({title:'Secure Portal',summary:'A secure portal implementing role based access, student workflows, records and administrative reporting for campus operations.',technologies:'Node.js',repository_url:'https://github.com/student/portal',project_url:'https://github.com/student/portal'},{github_url:'https://github.com/student'});
  assert.equal(risk.hard_reject, true);
  assert.match(risk.reasons.join(' '),/cannot be the same link/i);
});

test('TPO impersonation opens synchronously and uses the HttpOnly admin session cookie', () => {
  const ui = fs.readFileSync(path.join(__dirname,'../public/js/admin-submission-moderation.js'),'utf8');
  assert.match(ui,/window\.open\('about:blank', '_blank'\)/);
  assert.match(ui,/stopImmediatePropagation\(\)/);
  assert.match(ui,/credentials:'same-origin'/);
  assert.match(ui,/headers:adminHeaders\(\)/);
  assert.match(ui,/TPO remains signed in here/);
  assert.doesNotMatch(ui,/if \(!adminToken\).*TPO session is missing/s);
  assert.doesNotMatch(ui,/removeItem\('tpo_admin_token'\)/);
});

test('TPO impersonation creates a two-hour HttpOnly student cookie and student auth prefers it over stale bearer state', () => {
  const route = fs.readFileSync(path.join(__dirname,'../src/routes/adminModeration.js'),'utf8');
  const auth = fs.readFileSync(path.join(__dirname,'../src/middleware/auth.js'),'utf8');
  assert.match(route,/res\.cookie\('token', token/);
  assert.match(route,/httpOnly:true/);
  assert.match(route,/sameSite:'strict'/);
  assert.match(route,/maxAge:2 \* 60 \* 60 \* 1000/);
  assert.match(route,/redirect:'\/dashboard\?admin_preview=1'/);
  assert.match(auth,/getExtractToken\(req, 'token', true\)/);
  assert.match(auth,/if \(preferCookie && cookieToken\) return cookieToken/);
});
