process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-profile-declarations-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const db = require('../src/config/database');

function auth(studentId) {
  const token = jwt.sign({ role: 'student', studentId, prn: `PRN-${studentId}`, sessionVersion: 2 }, process.env.JWT_SECRET);
  const csrf = `csrf-${studentId}`;
  return { Authorization: `Bearer ${token}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf };
}

test('profile declarations are student-scoped, persistent, reversible, and partial updates preserve other choices', async () => {
  const a = `decl-a-${Date.now()}`;
  const b = `decl-b-${Date.now()}`;
  await db.insert('students', { id: a, prn: `A${Date.now()}`, name: 'Alpha Student Test', branch: 'CT', class: 'BE-A', year: 'Third Year' });
  await db.insert('students', { id: b, prn: `B${Date.now()}`, name: 'Beta Student Test', branch: 'CT', class: 'BE-A', year: 'Third Year' });

  const defaults = await request(app).get('/api/student/profile-declarations').set(auth(a)).expect(200);
  assert.equal(defaults.body.data.no_certificates, false);
  assert.equal(defaults.body.data.no_projects, false);
  assert.equal(defaults.body.data.no_research, false);
  assert.equal(defaults.body.data.no_internships, false);
  assert.equal(defaults.body.data.no_competitions, false);

  await request(app).put('/api/student/profile-declarations').set(auth(a)).send({ no_projects: true, no_research: true }).expect(200);
  const saved = await request(app).get('/api/student/profile-declarations').set(auth(a)).expect(200);
  assert.equal(saved.body.data.no_projects, true);
  assert.equal(saved.body.data.no_research, true);

  await request(app).put('/api/student/profile-declarations').set(auth(a)).send({ no_projects: false }).expect(200);
  const partial = await request(app).get('/api/student/profile-declarations').set(auth(a)).expect(200);
  assert.equal(partial.body.data.no_projects, false);
  assert.equal(partial.body.data.no_research, true);

  const isolated = await request(app).get('/api/student/profile-declarations').set(auth(b)).expect(200);
  assert.equal(isolated.body.data.no_research, false);
});

test('profile declarations reject empty, unknown, and unauthenticated writes', async () => {
  const id = `decl-validation-${Date.now()}`;
  await db.insert('students', { id, prn: `V${Date.now()}`, name: 'Validation Student Test', branch: 'AIML', class: 'BE-A', year: 'Second Year' });
  await request(app).put('/api/student/profile-declarations').set(auth(id)).send({}).expect(400);
  await request(app).put('/api/student/profile-declarations').set(auth(id)).send({ no_projects: true, surprise: true }).expect(400);
  await request(app).get('/api/student/profile-declarations').expect(401);
});

test('student completion UI treats declared-result sequence as complete while ignoring the next pending semester', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'profile-declarations-ui.js'), 'utf8');
  assert.match(source, /const highest = Math\.max\(\.\.\.entered\)/);
  assert.match(source, /for \(let i = start; i <= highest; i\+\+\)/);
  assert.doesNotMatch(source, /year === 'Third Year' \? 6/);
  assert.doesNotMatch(source, /year === 'Final Year' \? 8/);
});

test('100 percent completion hides readiness UI and optional none choices never award leaderboard points', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'profile-declarations-ui.js'), 'utf8');
  assert.match(source, /if \(model\.percent === 100\)[\s\S]*card\.hidden = true[\s\S]*strip\.hidden = true/);
  assert.match(source, /It gives zero leaderboard points/);
  assert.match(source, /records\.length > 0 \|\| Boolean\(declarations\[section\.key\]\)/);
  assert.match(source, /item\.records > 0 && declarations\[item\.section\.key\]/);
});

test('student loader wires the declarations CSS and JS globally on every student dashboard', () => {
  const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'portal-responsive.js'), 'utf8');
  assert.match(loader, /profile-declarations\.css/);
  assert.match(loader, /profile-declarations-ui\.js/);
});
