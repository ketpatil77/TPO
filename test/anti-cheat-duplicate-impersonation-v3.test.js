const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { duplicateIds, submissionFingerprints, researchRisk } = require('../src/services/submissionRisk');

test('research titles alone never create duplicate fingerprints', () => {
  const a = { id:'a', title:'AI in Agriculture', publication:'Journal X', doi_url:'https://journal.example.org/article/1', paper_url:'https://files.example.org/paper-a.pdf' };
  const b = { id:'b', title:'AI in Agriculture', publication:'Journal X', doi_url:'https://journal.example.org/article/2', paper_url:'https://files.example.org/paper-b.pdf' };
  assert.equal([...duplicateIds('research',[a,b])].length, 0);
  assert.equal(submissionFingerprints('research',a).some(v => v.startsWith('research-title:')), false);
});

test('research exact repeated evidence URL is a high-confidence duplicate', () => {
  const a = { id:'a', doi_url:'https://journal.example.org/article/1?utm=one' };
  const b = { id:'b', doi_url:'https://journal.example.org/article/1#section' };
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
});

test('project titles alone never make duplicate records', () => {
  const a = { id:'a', title:'College ERP', repository_url:'https://github.com/student/erp-v1' };
  const b = { id:'b', title:'College ERP', repository_url:'https://github.com/student/erp-v2' };
  assert.equal([...duplicateIds('project',[a,b])].length, 0);
});

test('TPO impersonation opens a tab synchronously and preserves admin session', () => {
  const ui = fs.readFileSync(path.join(__dirname,'../public/js/admin-submission-moderation.js'),'utf8');
  assert.match(ui,/window\.open\('about:blank', '_blank'\)/);
  assert.match(ui,/stopImmediatePropagation\(\)/);
  assert.match(ui,/tpo_admin_token/);
  assert.match(ui,/TPO remains signed in here/);
  assert.doesNotMatch(ui,/removeItem\('tpo_admin_token'\)/);
});
