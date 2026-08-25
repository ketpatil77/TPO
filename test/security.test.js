process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.ADMIN_DEV_PASSWORD = 'TestAdminPassword123!';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-test-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const db = require('../src/config/database');
const { normalizeStudentDob, dobPasswordFromStoredDate } = require('../src/utils/dateHelper');

test('test environment cannot connect to production Supabase', () => {
    assert.equal(db.isLocal(), true);
});

test('roster DOB formats normalize to ISO and derive exactly DDMMYY', () => {
    const inputs = ['31-07-2003', '31/07/2003', '31.07.2003', '31 07 2003', '310703', '31072003', '2003-07-31'];
    for (const input of inputs) {
        assert.equal(normalizeStudentDob(input), '2003-07-31');
        assert.equal(dobPasswordFromStoredDate(normalizeStudentDob(input)), '310703');
    }
    assert.equal(normalizeStudentDob('31-02-2003'), '');
});

test('US-style roster DOB auto-corrects to DDMMYY login without accepting impossible dates', () => {
    assert.equal(normalizeStudentDob('07-31-03'), '2003-07-31');
    assert.equal(dobPasswordFromStoredDate('07-31-03'), '310703');
    assert.equal(normalizeStudentDob('31-07-03'), '2003-07-31');
    assert.equal(normalizeStudentDob('02-31-03'), '');
});

test('student profile client authenticates every chained protected write', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
    const dashboard = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const handler = source.slice(source.indexOf('async function handleProfileSubmit'), source.indexOf('function recalculateOverallCgpa'));
    assert.match(handler, /fetch\('\/api\/student\/profile'[\s\S]*?'Authorization': `Bearer \$\{token\}`/);
    assert.match(handler, /fetch\('\/api\/student\/skills'[\s\S]*?'Authorization': `Bearer \$\{token\}`/);
    assert.match(handler, /fetch\('\/api\/student\/resume'[\s\S]*?'Authorization': `Bearer \$\{token\}`/);
    assert.match(handler, /skills\.length > 50/);
    assert.match(handler, /showToast\(err\?\.message/);
    assert.doesNotMatch(handler, /class:\s*document\.getElementById\('editClass'\)/);
    assert.match(dashboard, /id="editClass"[^>]*readonly[^>]*aria-readonly="true"/);
    assert.doesNotMatch(source, /\(window\.requestIdleCallback \|\| window\.setTimeout\)\(loadStudentAvatar, 1\)/);
    assert.match(source, /requestIdleCallback\(\(\) => loadStudentAvatar\(\), \{ timeout: 1000 \}\)/);
    assert.match(dashboard, /id="resumeUploadStatus"[^>]*aria-live="polite"/);
});

test('skill replacement uses atomic database operation', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'routes', 'student.js'), 'utf8');
    const handler = source.slice(source.indexOf("router.put('/skills'"), source.indexOf("router.post('/resume'"));
    assert.match(handler, /db\.replaceStudentSkills\(studentId, normalized\)/);
    assert.doesNotMatch(handler, /for \(const (row|skill) of/);
});

test('students cannot change assigned class through profile API', async () => {
    const id = `class-lock-${Date.now()}`;
    await db.insert('students', { id, prn: `CLASS${Date.now()}`, name: 'Class Lock Student', branch: 'CT', class: 'BE-A', year: 'Final Year' });
    const token = jwt.sign({ role: 'student', studentId: id, prn: 'class-lock', sessionVersion: 2 }, process.env.JWT_SECRET);
    const csrf = 'class-lock';
    const response = await request(app).put('/api/student/profile').set({ Authorization: `Bearer ${token}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf }).send({ class: 'BE-B' }).expect(400);
    assert.equal((await db.selectOne('students', { id })).class, 'BE-A');
    assert.equal(response.body.success, false);
});

test('health endpoint responds', async () => {
    const response = await request(app).get('/api/health').expect(200);
    assert.equal(response.body.data.status, 'ok');
});

test('production security headers, CORS denial, and malformed JSON are handled safely', async () => {
    const page = await request(app).get('/').expect(200);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    const cors = await request(app).get('/api/health').set('Origin', 'https://evil.example').expect(403);
    assert.equal(cors.body.error.code, 'ORIGIN_DENIED');
    const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json').expect(400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');
});

test('route handlers do not return raw backend error messages', () => {
    const fs = require('fs');
    const path = require('path');
    const protectedRoutes = ['auth.js', 'student.js', 'adminStudents.js', 'adminAudit.js'];
    for (const file of protectedRoutes) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', file), 'utf8');
        assert.doesNotMatch(source, /error:\s*err\.message/);
    }
});

test('root serves unified login choices for student, TPO, and TPC', async () => {
    const response = await request(app).get('/').expect(200);
    assert.match(response.text, /Student/);
    assert.match(response.text, /TPO/);
    assert.match(response.text, /TPC/);
    assert.match(response.text, /https:\/\/mail\.google\.com\/mail\/\?view=cm/);
    assert.match(response.text, /to=ket\.patil77%40gmail\.com/);
    assert.match(response.text, /AIT%20Placement%20Portal%20login%20help/);
    assert.match(response.text, />Contact Him<\/a>/);
    assert.match(response.text, /https:\/\/www\.codeminelabs\.in\//);
    assert.match(response.text, />CodeMineLabs<\/a>/);
    assert.match(response.text, /name="username"[^>]*autocomplete="username"/);
    assert.match(response.text, /name="password"[^>]*autocomplete="current-password"/);
    assert.doesNotMatch(response.text, /data-1p-ignore|data-lpignore/);
});

test('complete profile requires photo, email, phone and locks lateral-entry semesters', async () => {
    const suffix = Date.now();
    const student = await db.insert('students', { prn: `LATERAL${suffix}`, name: 'Lateral Student', branch: 'CT', class: 'BE-A', year: 'Final Year', avatar_path: null });
    const token = jwt.sign({ role: 'student', studentId: student.id, prn: student.prn, sessionVersion: 2 }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${token}`, Cookie: 'csrfToken=lateral-profile', 'X-CSRF-Token': 'lateral-profile' };
    const missing = await request(app).put('/api/student/profile').set(headers).send({ email: 'lateral@example.com', phone: '9876543210', complete_profile: true }).expect(422);
    assert.equal(missing.body.error.code, 'PROFILE_INCOMPLETE');
    await db.update('students', { id: student.id }, { avatar_path: `student/${student.id}/avatar.jpg` });
    const saved = await request(app).put('/api/student/profile').set(headers).send({ email: 'lateral@example.com', phone: '9876543210', ssc_marks: 80, hsc_marks: 85, lateral_entry: true, complete_profile: true, cgpa_semesterwise: { sem1: 8, sem2: 9, sem3: 7, sem4: 8 } }).expect(200);
    assert.equal(saved.body.student.lateral_entry, true);
    assert.equal(saved.body.student.cgpa_semesterwise.sem1, 0);
    assert.equal(saved.body.student.cgpa_semesterwise.sem2, 0);
    assert.equal(Number(saved.body.student.cgpa_overall), 7.5);
    await request(app).delete('/api/student/avatar').set(headers).expect(409);
});

test('launch operations expose checklist, import history, audit export, and super-admin backups', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const superToken = jwt.sign({ role: 'super_admin', adminId: 'super-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const checklist = await request(app).get('/api/admin/launch/checklist').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(checklist.body.data.total, 5);
    await request(app).get('/api/admin/roster/imports').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app).get('/api/admin/launch/audit.csv').set('Authorization', `Bearer ${adminToken}`).expect(200).expect('Content-Type', /csv/);
    await request(app).get('/api/admin/launch/backups').set('Authorization', `Bearer ${adminToken}`).expect(403);
    await request(app).post('/api/admin/launch/backups').set('Authorization', `Bearer ${superToken}`).send({ label: 'Test backup' }).expect(201);
});

test('legacy public roster endpoints are unavailable', async () => {
    await request(app).get('/api/roster').expect(404);
    await request(app).post('/api/roster/bulk').send({ records: [] }).expect(404);
});

test('student and admin endpoints reject missing credentials', async () => {
    await request(app).get('/api/student/profile').expect(401);
    await request(app).get('/api/admin/students').expect(401);
    await request(app).get('/api/observer/overview').expect(401);
});

test('observer sees all-branch read model but cannot use admin or student mutations', async () => {
    const token = jwt.sign({ role: 'observer', observerId: 'observer-test', department: 'AIML', sessionVersion: 2 }, process.env.JWT_SECRET);
    const overview = await request(app).get('/api/observer/overview').set('Authorization', `Bearer ${token}`).expect(200);
    assert.deepEqual(overview.body.data.branches.map(branch => branch.code), ['AIML', 'CT', 'EE', 'ME', 'CE', 'E&C']);
    await request(app).post('/api/admin/roster/upload').set('Authorization', `Bearer ${token}`).send({ csvContent: 'prn,name,dob,branch,class,year' }).expect(403);
    await request(app).put('/api/student/profile').set('Authorization', `Bearer ${token}`).send({ name: 'Blocked' }).expect(403);
});

test('TPC observer can request checked profile corrections without editing student data', async () => {
    const suffix = Date.now();
    const student = await db.insert('students', { prn: `TPCFIX${suffix}`, name: 'Correction Student', branch: 'CT', class: 'BE-A', year: 'Final Year', cgpa_overall: 7 });
    const token = jwt.sign({ role: 'observer', observerId: 'observer-test', department: 'CT', sessionVersion: 2 }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${token}`, Cookie: 'csrfToken=tpc-correction', 'X-CSRF-Token': 'tpc-correction' };
    const response = await request(app).post(`/api/observer/students/${student.id}/corrections`).set(headers).send({ fields: ['Contact details', 'Academic / CGPA'], message: 'Update missing phone and verify semester marks.' }).expect(201);
    assert.equal(response.body.created, 2);
    assert.equal((await db.select('correction_requests', { student_id: student.id, status: 'open' })).length, 2);
    const notices = await db.select('notifications', { student_id: student.id });
    assert.ok(notices.some(item => item.title === 'Profile correction requested' && item.priority === 'important'));
    const duplicate = await request(app).post(`/api/observer/students/${student.id}/corrections`).set(headers).send({ fields: ['Contact details'], message: 'Phone still missing.' }).expect(200);
    assert.equal(duplicate.body.created, 0);
    assert.equal(duplicate.body.skipped, 1);
});

test('workflow productivity endpoints enforce role boundaries', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const studentToken = jwt.sign({ role: 'student', studentId: 'student-test', prn: 'test', sessionVersion: 2 }, process.env.JWT_SECRET);
    await request(app).get('/api/admin/workflow/readiness').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app).get('/api/admin/workflow/readiness').set('Authorization', `Bearer ${studentToken}`).expect(403);
    await request(app).get('/api/student/workflow/notifications').set('Authorization', `Bearer ${studentToken}`).expect(200);
    await request(app).get('/api/student/workflow/notifications').set('Authorization', `Bearer ${adminToken}`).expect(403);
});

test('admin can create criteria with valid branches and delete drive with dependent records', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${adminToken}`, Cookie: 'csrfToken=drive-test', 'X-CSRF-Token': 'drive-test' };
    const created = await request(app).post('/api/admin/drives').set(headers).send({ company: 'Delete Test', role: 'Engineer', jd_text: 'Test placement drive description.', application_deadline: null, status: 'draft' }).expect(201);
    const driveId = created.body.data.id;
    const criteria = await request(app).post(`/api/admin/drives/${driveId}/criteria`).set(headers).send({ branches: ['AIML', 'E&C'], min_cgpa: 7, graduation_year: null, required_skills: [], preferred_skills: [], keywords: [] }).expect(200);
    assert.deepEqual(criteria.body.data.branches, ['AIML', 'E&C']);
    await request(app).post(`/api/admin/drives/${driveId}/criteria`).set(headers).send({ branches: ['Invalid'], min_cgpa: 0, graduation_year: null, required_skills: [], preferred_skills: [], keywords: [] }).expect(400);
    await request(app).delete(`/api/admin/drives/${driveId}`).set(headers).expect(200);
    await request(app).delete(`/api/admin/drives/${driveId}`).set(headers).expect(404);
    assert.equal(await db.selectOne('drive_criteria', { drive_id: driveId }), null);
});

test('in-app notifications support audience, expiry, unread count, and per-student read state', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const studentToken = jwt.sign({ role: 'student', studentId: 'student-test', prn: 'test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, Cookie: 'csrfToken=notice-test', 'X-CSRF-Token': 'notice-test' };
    const studentHeaders = { Authorization: `Bearer ${studentToken}`, Cookie: 'csrfToken=notice-read', 'X-CSRF-Token': 'notice-read' };
    const notice = await request(app).post('/api/admin/workflow/notifications').set(adminHeaders).send({ title: 'Drive alert', message: 'New drive is available.', priority: 'important', expires_at: null, action_url: '/dashboard' }).expect(201);
    await db.insert('notifications', { title: 'Expired alert', message: 'Should stay hidden.', priority: 'normal', expires_at: '2020-01-01T00:00:00.000Z', action_url: null, student_id: null, audience: 'all', created_at: new Date().toISOString() });
    const before = await request(app).get('/api/student/workflow/notifications').set('Authorization', `Bearer ${studentToken}`).expect(200);
    assert.equal(before.body.data.some(item => item.title === 'Expired alert'), false);
    assert.equal(before.body.data.find(item => item.id === notice.body.data.id).read, false);
    await request(app).put(`/api/student/workflow/notifications/${notice.body.data.id}/read`).set(studentHeaders).expect(200);
    const after = await request(app).get('/api/student/workflow/notifications').set('Authorization', `Bearer ${studentToken}`).expect(200);
    assert.equal(after.body.data.find(item => item.id === notice.body.data.id).read, true);
    assert.equal(after.body.unread, before.body.unread - 1);
});

test('notification validation handles local-time expiry and explains invalid fields', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${adminToken}`, Cookie: 'csrfToken=notice-time', 'X-CSRF-Token': 'notice-time' };
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await request(app).post('/api/admin/workflow/notifications').set(headers).send({ title: 'Evening alert', message: 'Future expiry works.', priority: 'normal', expires_at: future, action_url: 'http://example.com' }).expect(201);
    const past = await request(app).post('/api/admin/workflow/notifications').set(headers).send({ title: 'Old alert', message: 'Past expiry.', priority: 'normal', expires_at: '2020-01-01T12:00:00.000Z', action_url: null }).expect(400);
    assert.equal(past.body.error.field, 'expires_at');
    assert.match(past.body.error.message, /5 minutes/i);
    const badUrl = await request(app).post('/api/admin/workflow/notifications').set(headers).send({ title: 'Link alert', message: 'Bad URL.', priority: 'normal', expires_at: null, action_url: 'www.example.com' }).expect(400);
    assert.equal(badUrl.body.error.field, 'action_url');
    const tooSoon = await request(app).post('/api/admin/workflow/notifications').set(headers).send({ title: 'Short alert', message: 'Too short.', priority: 'normal', expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(), action_url: null }).expect(400);
    assert.match(tooSoon.body.error.message, /5 minutes/i);
});

test('notification center supports admin history, read-all, metrics, and deletion', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const studentToken = jwt.sign({ role: 'student', studentId: 'student-test', prn: 'test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, Cookie: 'csrfToken=history-test', 'X-CSRF-Token': 'history-test' };
    const studentHeaders = { Authorization: `Bearer ${studentToken}`, Cookie: 'csrfToken=read-all-test', 'X-CSRF-Token': 'read-all-test' };
    const created = await request(app).post('/api/admin/workflow/notifications').set(adminHeaders).send({ title: 'History alert', message: 'Visible in history.', priority: 'important', expires_at: null, action_url: '/dashboard?tab=opportunities' }).expect(201);
    const historyBefore = await request(app).get('/api/admin/workflow/notifications').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const beforeItem = historyBefore.body.data.find(item => item.id === created.body.data.id);
    assert.equal(beforeItem.read_count, 0);
    assert.equal(typeof beforeItem.recipient_count, 'number');
    await request(app).put('/api/student/workflow/notifications/read-all').set(studentHeaders).expect(200);
    const historyAfter = await request(app).get('/api/admin/workflow/notifications').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(historyAfter.body.data.find(item => item.id === created.body.data.id).read_count, 1);
    await request(app).delete(`/api/admin/workflow/notifications/${created.body.data.id}`).set(adminHeaders).expect(200);
    assert.equal(await db.selectOne('notifications', { id: created.body.data.id }), null);
    assert.equal((await db.select('notification_reads', { notification_id: created.body.data.id })).length, 0);
});

test('bulk roster preview validates without writing data', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const response = await request(app).post('/api/admin/roster/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('csvContent', 'prn,name,dob,branch,class,year\n123,Test Student,2004-01-15,E&C,BE-A,Final Year')
        .expect(200);
    assert.equal(response.body.data.summary.valid, 1);
    assert.equal(response.body.data.rows[0].branch, 'E&C');
});

test('formatted Excel roster template preserves full PRN and readable DOB during import', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const template = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'templates', 'AIT-roster-template.xlsx'));
    const preview = await request(app).post('/api/admin/roster/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', template, { filename: 'AIT-roster-template.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        .expect(200);
    assert.equal(preview.body.data.rows[0].prn, '24000000000001');
    assert.equal(preview.body.data.rows[0].dob, '2004-01-15');
    assert.equal(preview.body.data.rows[0].branch, 'E&C');
});

test('bulk roster upload processes 500 students with batched database writes', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${adminToken}`, Cookie: 'csrfToken=bulk-500', 'X-CSRF-Token': 'bulk-500' };
    const existing = await db.select('roster');
    const toDelete = existing.filter(row => String(row.prn).startsWith('25')).map(row => row.prn);
    if (toDelete.length > 0) {
        await db.deleteMany('roster', 'prn', toDelete);
    }
    const lines = ['prn,name,dob,branch,class,year'];
    for (let index = 0; index < 500; index++) {
        lines.push(`${String(25000000000000 + index)},Bulk Student ${index + 1},15-01-2004,CT,BE-A,Final Year`);
    }
    const response = await request(app).post('/api/admin/roster/upload').set(headers).field('csvContent', lines.join('\n')).expect(200);
    assert.equal(response.body.summary.addedCount, 500);
    assert.equal(response.body.summary.failedCount, 0);
    assert.equal((await db.select('roster')).filter(row => String(row.prn).startsWith('25')).length, 500);
    const fetched = await request(app).get('/api/admin/students?branch=CT&search=Bulk%20Student%201&pageSize=100').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(fetched.body.students.some(student => student.name === 'Bulk Student 1' && student.profile_active === false));
    const allBranches = await request(app).get('/api/admin/students?pageSize=100').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const ctOnly = await request(app).get('/api/admin/students?branch=CT&pageSize=100').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const aimlOnly = await request(app).get('/api/admin/students?branch=AIML&pageSize=100').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(allBranches.body.count > ctOnly.body.count);
    assert.ok(ctOnly.body.students.every(student => student.branch === 'CT'));
    assert.ok(aimlOnly.body.students.length > 0 && aimlOnly.body.students.every(student => student.branch === 'AIML'));
    await db.insert('roster', { prn: `FILTER3${Date.now()}`, name: 'Third Year Filter Student', dob: '2005-01-15', branch: 'CT', class: 'TE-A', year: 'Third Year' });
    const ctThird = await request(app).get('/api/admin/students?branch=CT&year=Third%20Year&pageSize=100&_bust=1').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(ctThird.body.students.some(student => student.name === 'Third Year Filter Student'));
    assert.ok(ctThird.body.students.every(student => student.branch === 'CT' && student.year === 'Third Year'));
});

test('roster import undo removes a large batch without per-row database requests', async () => {
    const token = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const csrf = 'undo-large-batch';
    const headers = { Authorization: `Bearer ${token}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf };
    const prns = Array.from({ length: 64 }, (_, index) => `UNDO${String(index).padStart(4, '0')}`);
    await db.upsertMany('roster', prns.map(prn => ({ prn, name: prn, dob: '2004-01-15', branch: 'CT', class: 'BE-A', year: 'Final Year' })), 'prn');
    const batch = await db.insert('import_batches', { status: 'completed', total_count: 64, added_count: 64, updated_count: 0, failed_count: 0, inserted_prns: prns, previous_rows: [], errors: [], created_at: new Date().toISOString() });
    const response = await request(app).post(`/api/admin/roster/imports/${batch.id}/undo`).set(headers).expect(200);
    assert.equal(response.body.removed, 64);
    assert.equal((await db.select('roster')).filter(row => prns.includes(row.prn)).length, 0);
});

test('advanced suite is protected and returns bounded analytics', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const observerToken = jwt.sign({ role: 'observer', observerId: 'observer-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const analytics = await request(app).get('/api/admin/advanced/analytics').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(typeof analytics.body.data.profileCompletion, 'number');
    await request(app).get('/api/admin/advanced/search?q=test').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app).get('/api/admin/advanced/analytics').set('Authorization', `Bearer ${observerToken}`).expect(403);
});

test('super admin middleware accepts super admin and rejects regular admin', async () => {
    const regular = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const elevated = jwt.sign({ role: 'super_admin', adminId: 'super-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    await request(app).get('/api/admin/auth/accounts').set('Authorization', `Bearer ${regular}`).expect(403);
    if (db.isLocal()) await request(app).get('/api/admin/auth/accounts').set('Authorization', `Bearer ${elevated}`).expect(503);
});

test('resume upload rejects PDFs larger than 2 MB', async () => {
    const token = jwt.sign({ role: 'student', studentId: 'student-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const oversized = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(2 * 1024 * 1024)]);
    const response = await request(app).post('/api/student/resume').set('Authorization', `Bearer ${token}`).attach('resume', oversized, { filename: 'large.pdf', contentType: 'application/pdf' }).expect(413);
    assert.equal(response.body.error.code, 'PDF_TOO_LARGE');
});

test('profile picture rejects files of 1 MB or larger', async () => {
    const token = jwt.sign({ role: 'student', studentId: 'student-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const image = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1024 * 1024 - 3)]);
    const response = await request(app).post('/api/student/avatar').set('Authorization', `Bearer ${token}`).attach('avatar', image, { filename: 'large.jpg', contentType: 'image/jpeg' }).expect(413);
    assert.equal(response.body.error.code, 'IMAGE_TOO_LARGE');
});

test('student login gives generic invalid credential response', async () => {
    const response = await request(app).post('/api/auth/login').send({ prn: '99999999999999', dob: '010100', token: 'test-turnstile-token' }).expect(401);
    assert.equal(response.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(response.body.error.message, 'Invalid PRN or date of birth.');
});

test('authenticated mutation rejects missing CSRF header', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ prn: '24053651251515', dob: '310703', token: 'test-turnstile-token' }).expect(200);
    const response = await agent.put('/api/student/skills').send({ skills: ['JavaScript'] }).expect(403);
    assert.equal(response.body.error.code, 'CSRF_INVALID');
});

test('legacy sessions are rejected and require fresh login', async () => {
    const legacy = jwt.sign({ role: 'admin', adminId: 'admin-test' }, process.env.JWT_SECRET);
    await request(app).get('/api/admin/students').set('Authorization', `Bearer ${legacy}`).expect(401);
});

test('security intelligence requires staff access and returns bounded fraud scan', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    await request(app).get('/api/admin/intelligence/fraud-check').expect(401);
    const response=await request(app).get('/api/admin/intelligence/fraud-check').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(response.body.success,true);
    assert.ok(Array.isArray(response.body.data));
    assert.ok(response.body.data.length<=500);
});

test('system health is limited to super admin', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const superToken = jwt.sign({ role: 'super_admin', adminId: 'super-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    await request(app).get('/api/admin/intelligence/health').set('Authorization', `Bearer ${adminToken}`).expect(403);
    const response=await request(app).get('/api/admin/intelligence/health').set('Authorization', `Bearer ${superToken}`).expect(200);
    assert.equal(response.body.data.api,'ok');
});

test('JD parser uses whole branch codes and does not read EE from engineer', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const response=await request(app).post('/api/admin/intelligence/jd-parser').set('Authorization',`Bearer ${adminToken}`).set('Cookie','csrfToken=parser-test').set('X-CSRF-Token','parser-test').send({jd_text:'Software Engineer role. Eligible branches AIML, CT and E&C. Minimum CGPA 7.5. Skills Python and SQL.'}).expect(200);
    assert.deepEqual(response.body.data.branches,['AIML','CT','E&C']);
});

test('one-click management Excel report is generated for admins', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const response=await request(app).get('/api/admin/intelligence/reports/management.xlsx').set('Authorization',`Bearer ${adminToken}`).buffer(true).parse((res,done)=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>done(null,Buffer.concat(chunks)));}).expect(200);
    assert.match(response.headers['content-type'],/spreadsheetml/);
    assert.equal(response.body.subarray(0,2).toString(),'PK');
});

test('login and feature access report is restricted to super admin and generates Excel', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const superToken = jwt.sign({ role: 'super_admin', adminId: 'super-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    await request(app).get('/api/admin/intelligence/reports/access-logins.xlsx').set('Authorization', `Bearer ${adminToken}`).expect(403);
    const response = await request(app).get('/api/admin/intelligence/reports/access-logins.xlsx').set('Authorization', `Bearer ${superToken}`).buffer(true).parse((res,done)=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>done(null,Buffer.concat(chunks)));}).expect(200);
    assert.match(response.headers['content-type'],/spreadsheetml/);
    assert.equal(response.body.subarray(0,2).toString(),'PK');
});

test('students save semester backlogs and admins filter recruiter exports by year, SGPA, and backlog', async () => {
    const id = `academic-${Date.now()}`;
    await db.insert('students', { id, prn: `PRN${Date.now()}`, name: 'Academic Test', branch: 'CT', class: 'BE-A', year: 'Final Year', cgpa_overall: 8.4, cgpa_semesterwise: { sem6: 8.1 }, backlogs_semesterwise: {} });
    const studentToken = jwt.sign({ role: 'student', studentId: id, prn: 'academic', sessionVersion: 2 }, process.env.JWT_SECRET);
    const csrf = 'academic-backlog';
    const profileUpdate = await request(app).put('/api/student/profile').set({ Authorization: `Bearer ${studentToken}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf }).send({ email: 'academic.student@example.com', phone: '+919876543210', backlogs_semesterwise: { sem1: 0, sem2: 0, sem3: 0, sem4: 0, sem5: 0, sem6: 2, sem7: 0, sem8: 0 } }).expect(200);
    assert.equal(profileUpdate.body.student.email, 'academic.student@example.com');
    assert.equal(profileUpdate.body.student.phone, '+919876543210');
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const filtered = await request(app).get('/api/admin/students?branch=CT&year=Final%20Year&sgpaSemester=6&minSgpa=8&backlogFilter=has&pageSize=100&_bust=1').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const row = filtered.body.students.find(student => student.id === id);
    assert.equal(row.active_backlogs, 2);
    const exactTwo = await request(app).get('/api/admin/students?backlogFilter=exact2&pageSize=100&_bust=1').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(exactTwo.body.students.some(student => student.id === id));
    const noBacklog = await request(app).get('/api/admin/students?backlogFilter=zero&pageSize=100&_bust=1').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(noBacklog.body.students.some(student => student.id === id), false);
    const outsideCgpaRange = await request(app).get('/api/admin/students?minCgpa=5&maxCgpa=7&pageSize=100').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(outsideCgpaRange.body.students.some(student => student.id === id), false);
    const pdf = await request(app).get('/api/admin/students/export/pdf?year=Final%20Year&backlogFilter=has').set('Authorization', `Bearer ${adminToken}`).buffer(true).parse((res, done) => { const chunks=[]; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); }).expect(200);
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    const excel = await request(app).get('/api/admin/students/export/excel?year=Final%20Year&backlogFilter=has').set('Authorization', `Bearer ${adminToken}`).buffer(true).parse((res, done) => { const chunks=[]; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); }).expect(200);
    assert.equal(excel.body.subarray(0, 2).toString(), 'PK');
    const derived = await request(app).put('/api/student/profile').set({ Authorization: `Bearer ${studentToken}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf }).send({ cgpa_overall: 1, cgpa_semesterwise: { sem1: 8, sem2: 6 } }).expect(200);
    assert.equal(Number(derived.body.student.cgpa_overall), 7);
});

test('branch-targeted notices reach selected branches only and report correct recipients', async () => {
    const suffix = Date.now();
    const ctId = `notice-ct-${suffix}`;
    const eeId = `notice-ee-${suffix}`;
    await db.insert('students', { id: ctId, prn: `NCT${suffix}`, name: 'CT Notice Student', branch: 'CT', class: 'BE-A', year: 'Final Year' });
    await db.insert('students', { id: eeId, prn: `NEE${suffix}`, name: 'EE Notice Student', branch: 'EE', class: 'BE-A', year: 'Final Year' });
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-test', sessionVersion: 2 }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${adminToken}`, Cookie: 'csrfToken=branch-notice', 'X-CSRF-Token': 'branch-notice' };
    const created = await request(app).post('/api/admin/workflow/notifications').set(headers).send({ title: 'CT and AIML only', message: 'Selected department notice.', priority: 'normal', expires_at: null, action_url: '/dashboard?tab=opportunities', branches: ['CT', 'AIML'] }).expect(201);
    assert.equal(created.body.data.audience, 'branches');
    const ctToken = jwt.sign({ role: 'student', studentId: ctId, prn: `NCT${suffix}`, sessionVersion: 2 }, process.env.JWT_SECRET);
    const eeToken = jwt.sign({ role: 'student', studentId: eeId, prn: `NEE${suffix}`, sessionVersion: 2 }, process.env.JWT_SECRET);
    const ctInbox = await request(app).get('/api/student/workflow/notifications').set('Authorization', `Bearer ${ctToken}`).expect(200);
    const eeInbox = await request(app).get('/api/student/workflow/notifications').set('Authorization', `Bearer ${eeToken}`).expect(200);
    assert.ok(ctInbox.body.data.some(item => item.id === created.body.data.id));
    assert.equal(eeInbox.body.data.some(item => item.id === created.body.data.id), false);
    const history = await request(app).get('/api/admin/workflow/notifications').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const item = history.body.data.find(row => row.id === created.body.data.id);
    assert.ok(item.recipient_count >= 1);
    assert.deepEqual(item.branches, ['CT', 'AIML']);
});

test('student projects are validated, owned, and exposed in the profile', async () => {
    const suffix = Date.now();
    const id = `project-student-${suffix}`;
    await db.insert('students', { id, prn: `PROJECT${suffix}`, name: 'Project Student', branch: 'AIML', class: 'BE-A', year: 'Final Year' });
    const token = jwt.sign({ role: 'student', studentId: id, prn: `PROJECT${suffix}`, sessionVersion: 2 }, process.env.JWT_SECRET);
    const csrf = 'project-crud';
    const headers = { Authorization: `Bearer ${token}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf };
    const created = await request(app).post('/api/student/projects').set(headers).send({ title: 'Placement Portal', summary: 'A secure student placement workflow.', technologies: 'Node.js, Supabase', project_url: 'https://example.com', repository_url: '', completed_on: '2026-08-14' }).expect(201);
    const projectId = created.body.project.id;
    const profile = await request(app).get('/api/student/profile').set('Authorization', `Bearer ${token}`).expect(200);
    assert.ok(profile.body.data.projects.some(project => project.id === projectId));
    await request(app).put(`/api/student/projects/${projectId}`).set(headers).send({ title: 'AIT Placement Portal', summary: 'Improved project details.', technologies: 'Node.js, Supabase', project_url: '', repository_url: 'https://github.com/example/project', completed_on: null }).expect(200);
    await request(app).post('/api/student/projects').set(headers).send({ title: '', summary: '' }).expect(400);
    await request(app).delete(`/api/student/projects/${projectId}`).set(headers).expect(200);
    assert.equal(await db.selectOne('student_projects', { id: projectId }), null);
});

test('research papers are validated, owned, and exposed across student profile', async () => {
    const suffix = Date.now();
    const id = `research-student-${suffix}`;
    await db.insert('students', { id, prn: `RESEARCH${suffix}`, name: 'Research Student', branch: 'CT', class: 'BE-A', year: 'Final Year' });
    const token = jwt.sign({ role: 'student', studentId: id, prn: `RESEARCH${suffix}`, sessionVersion: 2 }, process.env.JWT_SECRET);
    const csrf = 'research-crud';
    const headers = { Authorization: `Bearer ${token}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf };
    const paper = { title: 'Industrial Inspection Fusion', authors: 'Research Student, Co-author', publication: 'IJVRA', abstract: 'Multi-angle inspection research with measurable accuracy.', doi_url: 'https://doi.org/10.1000/test', paper_url: '', published_on: '2026-08-14' };
    const created = await request(app).post('/api/student/research-papers').set(headers).send(paper).expect(201);
    const paperId = created.body.research_paper.id;
    const profile = await request(app).get('/api/student/profile').set('Authorization', `Bearer ${token}`).expect(200);
    assert.ok(profile.body.data.research_papers.some(item => item.id === paperId));
    await request(app).put(`/api/student/research-papers/${paperId}`).set(headers).send({ ...paper, title: 'Updated Inspection Fusion', doi_url: '', paper_url: 'https://example.com/paper' }).expect(200);
    await request(app).post('/api/student/research-papers').set(headers).send({ ...paper, title: '', published_on: '2030-01-01' }).expect(400);
    await request(app).delete(`/api/student/research-papers/${paperId}`).set(headers).expect(200);
    assert.equal(await db.selectOne('research_papers', { id: paperId }), null);
});

test('change student password via authenticated admin route updates roster and allows student login', async () => {
    const suffix = Date.now();
    const adminEmail = `admin-${suffix}@example.com`;
    await db.insert('profiles', {
        user_id: `admin-user-${suffix}`,
        email: adminEmail,
        role: 'admin',
        status: 'active',
        display_name: 'Test Admin',
        created_at: new Date().toISOString()
    });

    const studentPrn = `999${suffix}`;
    await db.insert('roster', {
        prn: studentPrn,
        name: 'Password Student',
        dob: '2004-01-15',
        branch: 'CT',
        class: 'BE-A',
        year: 'Final Year'
    });

    await request(app).post('/api/auth/login').send({ prn: studentPrn, dob: '150104', token: 'test-turnstile-token' }).expect(200);

    const loginRes = await request(app).post('/api/admin/auth/login').send({
        email: adminEmail,
        password: 'TestAdminPassword123!',
        token: 'test-turnstile-token'
    }).expect(200);

    const cookie = loginRes.headers['set-cookie'];
    let csrfToken = '';
    if (cookie) {
        for (const c of cookie) {
            if (c.includes('csrfToken=')) {
                csrfToken = c.split('csrfToken=')[1].split(';')[0];
            }
        }
    }

    await request(app).post('/api/admin/auth/change-student-password')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
            studentPrn,
            newDob: '180205'
        }).expect(200);

    const updatedRoster = await db.selectOne('roster', { prn: studentPrn });
    assert.equal(updatedRoster.dob, '2005-02-18');

    await request(app).post('/api/auth/login').send({ prn: studentPrn, dob: '150104', token: 'test-turnstile-token' }).expect(401);
    await request(app).post('/api/auth/login').send({ prn: studentPrn, dob: '180205', token: 'test-turnstile-token' }).expect(200);
});

test('public dob-correction request can be submitted, scoped to TPC department, and approved', async () => {
    const prn = String(26000000000000 + Math.floor(Math.random() * 1000000));
    await db.insert('roster', {
        prn,
        name: 'Correction Student',
        dob: '2004-01-15',
        branch: 'CT',
        class: 'BE-B',
        year: 'Final Year'
    });

    // 1. Login fails with wrong DOB
    await request(app).post('/api/auth/login').send({ prn, dob: '201206', token: 'test-turnstile-token' }).expect(401);

    // 2. Submit DOB correction request (unauthenticated)
    const submitRes = await request(app).post('/api/auth/dob-correction-requests')
        .send({
            prn,
            name: 'Correction Student',
            dob: '201206', // Correct DOB candidate
            token: 'test-turnstile-token'
        }).expect(201);

    const correctionId = submitRes.body.data.id;

    // 2b. Attempt to submit a second request while first is pending - must fail with 400
    await request(app).post('/api/auth/dob-correction-requests')
        .send({
            prn,
            name: 'Correction Student',
            dob: '201206',
            token: 'test-turnstile-token'
        }).expect(400);

    // 3. Observer from different department (EE) cannot see or approve it
    const observerWrongToken = jwt.sign({ role: 'observer', observerId: 'observer-ee', department: 'EE', sessionVersion: 2 }, process.env.JWT_SECRET);
    await request(app).get('/api/observer/dob-corrections')
        .set('Authorization', `Bearer ${observerWrongToken}`)
        .expect(200)
        .then(res => {
            const hasIt = res.body.data.some(c => c.id === correctionId);
            assert.ok(!hasIt);
        });

    await request(app).post(`/api/observer/dob-corrections/${correctionId}/approve`)
        .set('Authorization', `Bearer ${observerWrongToken}`)
        .expect(404);

    // 4. Observer from same department (CT) can see and approve it
    const observerRightToken = jwt.sign({ role: 'observer', observerId: 'observer-ct', department: 'CT', sessionVersion: 2 }, process.env.JWT_SECRET);
    await request(app).get('/api/observer/dob-corrections')
        .set('Authorization', `Bearer ${observerRightToken}`)
        .expect(200)
        .then(res => {
            const hasIt = res.body.data.some(c => c.id === correctionId);
            assert.ok(hasIt);
        });

    await request(app).post(`/api/observer/dob-corrections/${correctionId}/approve`)
        .set('Authorization', `Bearer ${observerRightToken}`)
        .expect(200);

    // 5. Student login now succeeds with the corrected DOB!
    await request(app).post('/api/auth/login').send({ prn, dob: '201206', token: 'test-turnstile-token' }).expect(200);
});

test('DOB correction suggests and stores canonical roster name for entered PRN', async () => {
    const prn = String(27000000000000 + Math.floor(Math.random() * 1000000));
    await db.insert('roster', { prn, name: 'PATIL KETAN VILAS', dob: '2003-07-31', branch: 'CT', class: 'BE-A', year: 'Final Year' });

    const suggestion = await request(app)
        .get('/api/auth/dob-correction-name-suggestion')
        .query({ prn, q: 'ket' })
        .expect(200);
    assert.deepEqual(suggestion.body.data, [{ name: 'PATIL KETAN VILAS' }]);

    const submitted = await request(app).post('/api/auth/dob-correction-requests').send({
        prn,
        name: 'ket',
        dob: '010104',
        token: 'test-turnstile-token'
    }).expect(201);
    assert.equal(submitted.body.data.submitted_name, 'PATIL KETAN VILAS');
    assert.equal(submitted.body.data.name_mismatch, false);
});
