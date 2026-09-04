const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const risk = require('../src/services/submissionRisk');

const guard = fs.readFileSync(path.join(__dirname,'../src/routes/studentSubmissionGuard.js'),'utf8');
const admin = fs.readFileSync(path.join(__dirname,'../src/routes/adminModeration.js'),'utf8');
const adminUi = fs.readFileSync(path.join(__dirname,'../public/js/admin-submission-moderation.js'),'utf8');

test('project requires a link and flags GitHub owner mismatch', () => {
  const missing = risk.projectRisk({id:'p1',title:'Real project',summary:'This project provides a real workflow with enough description to establish substantive implementation work.',technologies:'Node.js'});
  assert.equal(missing.needs_review, true);
  const mismatch = risk.projectRisk({id:'p2',title:'Placement portal',summary:'A complete placement portal with authentication, reporting, ranking and verified evidence workflows for students.',repository_url:'https://github.com/other-user/repo'}, {enforceOwnership:true, profileGithubUsername:'ketan'});
  assert.equal(mismatch.needs_review, true);
  assert.match(mismatch.reasons.join(' '), /does not match/i);
});

test('same project link and duplicate certificate metadata are declined', () => {
  const rows = [{id:'old',title:'A',project_url:'https://example.com/app',repository_url:'https://github.com/me/a'}];
  assert.ok(risk.duplicateConflict('project',{title:'B',project_url:'https://example.com/app',repository_url:'https://github.com/me/b'},rows));
  const certs = [{id:'c1',name:'AWS Cloud',issuer:'AWS Academy',date:'2026-01-01'}];
  assert.ok(risk.duplicateConflict('certificate',{name:'AWS Cloud',issuer:'AWS Academy',date:'2026-01-01'},certs));
  assert.match(guard,/Duplicate entry declined\. No cheating/);
});

test('research accepts a working publication link without forcing doi.org', () => {
  const item = {id:'r1',title:'A meaningful research title',publication:'Journal of Useful Systems',abstract:'This paper presents a reproducible system evaluation with clear methodology, implementation details, comparative measurements, limitations, and conclusions suitable for academic publication.',paper_url:'https://journal.example/article/1'};
  const result = risk.researchRisk(item,{enforceReachability:true,linkStatus:{'https://journal.example/article/1':true}});
  assert.equal(result.auto_approved,true);
});

test('unverified certificate stays zero-point eligible until unique proof auto-verifies it', () => {
  const pending = risk.certificateRisk({id:'c2',name:'Cloud Fundamentals',issuer:'AWS Academy'});
  assert.equal(pending.auto_approved,false);
  assert.match(pending.reasons.join(' '), /0 points/i);
  const proof = risk.certificateRisk({id:'c3',name:'Cloud Fundamentals',issuer:'AWS Academy',evidence_path:'certificates/s/c3.jpg'});
  assert.equal(proof.auto_approved,true);
  assert.match(guard,/Evidence auto-verification persistence failed/);
  assert.match(guard,/verification_status:status/);
});

test('TPO moderation UI does not call pending content auto-verified and supports manual verify/reject', () => {
  assert.match(adminUi,/Pending review · 0 pts/);
  assert.match(adminUi,/Auto-verified/);
  assert.match(adminUi,/data-moderation-review="approved"/);
  assert.match(adminUi,/data-moderation-review="rejected"/);
  assert.match(admin,/review_student_submission/);
  assert.match(admin,/verification_status:stored/);
});
