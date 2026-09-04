const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const guard = fs.readFileSync(path.join(__dirname,'../src/routes/studentSubmissionGuard.js'),'utf8');
const server = fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');

test('submission guard applies only to supported student write records', () => {
  assert.match(guard,/\['POST','PUT'\]/);
  for (const pathName of ['projects','research-papers','internships','certificates']) assert.match(guard,new RegExp(pathName));
});

test('only high-risk obvious junk is blocked while medium risk can be saved for later review', () => {
  assert.match(guard,/risk\.level === 'high'/);
  assert.match(guard,/status\(422\)/);
  assert.match(guard,/req\.submissionRisk = risk/);
});

test('quality guard runs before all student record routers', () => {
  const guardIndex = server.indexOf("app.use('/api/student', studentSubmissionGuard)");
  const recordsIndex = server.indexOf("app.use('/api/student', proofManagedRecordsRoutes)");
  assert.ok(guardIndex > -1 && recordsIndex > -1 && guardIndex < recordsIndex);
});
