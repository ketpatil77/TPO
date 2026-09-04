const test = require('node:test');
const assert = require('node:assert/strict');
const { projectRisk, researchRisk, internshipRisk, certificateRisk, auditSample } = require('../src/services/submissionRisk');

test('credible project auto-approves while text-only project is flagged', () => {
  const good = projectRisk({ id:'p-good', title:'Campus placement analytics dashboard', summary:'A dashboard that aggregates placement records, filters branch performance, and visualizes verified placement outcomes for staff.', technologies:'Node.js, PostgreSQL', repository_url:'https://github.com/example/placement-dashboard' });
  assert.equal(good.auto_approved, true);
  const junk = projectRisk({ id:'p-junk', title:'test', summary:'abc', technologies:'test' });
  assert.equal(junk.needs_review, true);
  assert.equal(junk.level, 'high');
});

test('research requires substantive metadata plus a paper or DOI link', () => {
  const good = researchRisk({ id:'r-good', title:'Machine learning approach to crop disease classification', publication:'International Journal of Applied Computing', abstract:'This study evaluates a supervised classification pipeline for crop disease images using a curated dataset, controlled preprocessing, model comparison, error analysis, and reproducible evaluation metrics across multiple crop categories.', doi_url:'https://doi.org/10.1000/example.123' });
  assert.equal(good.auto_approved, true);
  const textOnly = researchRisk({ id:'r-bad', title:'Research project', publication:'Journal', abstract:'This is research.' });
  assert.equal(textOnly.needs_review, true);
});

test('internship and certificate need proof for automatic quality approval', () => {
  assert.equal(internshipRisk({ id:'i1', company:'Acme Technologies', role:'Software Developer Intern' }).needs_review, true);
  assert.equal(internshipRisk({ id:'i2', company:'Acme Technologies', role:'Software Developer Intern', evidence_path:'internships/s/i2.jpg' }).auto_approved, true);
  assert.equal(certificateRisk({ id:'c1', name:'Cloud Fundamentals', issuer:'AWS Academy' }).needs_review, true);
  assert.equal(certificateRisk({ id:'c2', name:'Cloud Fundamentals', issuer:'AWS Academy', evidence_path:'certificates/s/c2.jpg' }).auto_approved, true);
});

test('random audit sampling is deterministic for the same record', () => {
  const item = { id:'fixed-record-123' };
  assert.equal(auditSample(item), auditSample(item));
});
