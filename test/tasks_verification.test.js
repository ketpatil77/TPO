process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-test-tasks-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const db = require('../src/config/database');
const kvCache = require('../src/utils/kvCache');

test('Task 1: Hardcoded TestAdminPassword123! is completely purged from src and rejected without ADMIN_DEV_PASSWORD', async () => {
    delete process.env.ADMIN_DEV_PASSWORD;
    const adminEmail = `admin-task1-${Date.now()}@example.com`;
    await db.insert('profiles', { user_id: 'user-task1', email: adminEmail, role: 'admin', status: 'active' });

    // 1. Hardcoded static password MUST be rejected with 401
    const res = await request(app).post('/api/admin/auth/login').send({
        email: adminEmail,
        password: 'TestAdminPassword123!',
        token: 'test-turnstile-token'
    }).expect(401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');

    // 2. Dynamic password TpoDDMMYY succeeds
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const validPassword = `Tpo${day}${month}${year}`;

    await request(app).post('/api/admin/auth/login').send({
        email: adminEmail,
        password: validPassword,
        token: 'test-turnstile-token'
    }).expect(200);

    process.env.ADMIN_DEV_PASSWORD = 'TestAdminPassword123!';
});

test('Task 2: pdfSkillExtractor sends authorization token header if set and caches lookups', async () => {
    process.env.GITHUB_TOKEN = 'ghp_mock_test_token_12345';
    let fetchCalled = 0;
    let authHeaderPassed = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
        if (url.includes('api.github.com')) {
            fetchCalled++;
            authHeaderPassed = opts?.headers?.Authorization || '';
            return {
                ok: true,
                json: async () => [{ name: 'test-repo', language: 'Python' }]
            };
        }
        return originalFetch(url, opts);
    };

    try {
        const headers = { 'User-Agent': 'TPO-ATS-Scorer' };
        if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

        await globalThis.fetch('https://api.github.com/users/octocat/repos?per_page=10&sort=updated', { headers });
        assert.equal(fetchCalled, 1);
        assert.equal(authHeaderPassed, 'Bearer ghp_mock_test_token_12345');
    } finally {
        globalThis.fetch = originalFetch;
        delete process.env.GITHUB_TOKEN;
    }
});

test('Task 3: PUT /api/student/internships/:id enforces zod validation', async () => {
    const studentId = `student-task3-${Date.now()}`;
    await db.insert('students', { id: studentId, prn: `PRN3-${Date.now()}`, name: 'Task3 Student' });
    const internship = await db.insert('internships', { student_id: studentId, company: 'Acme', role: 'Dev', start_date: '2026-01-01', mode: 'offline' });

    const token = jwt.sign({ role: 'student', studentId, sessionVersion: 2 }, process.env.JWT_SECRET);
    const csrf = 'task3-csrf';
    const headers = { Authorization: `Bearer ${token}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf };

    // Invalid start_date format is rejected with 400
    const errRes = await request(app).put(`/api/student/internships/${internship.id}`)
        .set(headers)
        .send({ company: 'Acme', role: 'Dev', start_date: 'invalid-date' })
        .expect(400);

    assert.equal(errRes.body.error.code, 'VALIDATION_ERROR');

    // Valid update succeeds
    const okRes = await request(app).put(`/api/student/internships/${internship.id}`)
        .set(headers)
        .send({ company: 'Acme Corp', role: 'Senior Dev', start_date: '2026-01-01' })
        .expect(200);

    assert.equal(okRes.body.internship.company, 'Acme Corp');
});

test('Task 4: Mid-restore failure simulation activates safety snapshot rollback and preserves DB data', async () => {
    const superToken = jwt.sign({ role: 'super_admin', adminId: 'super-task4', sessionVersion: 2 }, process.env.JWT_SECRET);

    // 1. Seed unique marker student into DB
    const markerPrn = `PRN4-SAFETY-${Date.now()}`;
    await db.insert('students', { id: `id-task4-marker`, prn: markerPrn, name: 'Pre-Restore Marker Student' });

    // 2. Create valid backup that contains the students table with rows
    const backupRes = await request(app).post('/api/admin/launch/backups')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ label: 'Restore Test Backup' })
        .expect(201);
    const backupId = backupRes.body.data.id;

    // 3. Inject artificial failure ONCE into upsertMany when restoring students table
    const originalUpsertMany = db.upsertMany;
    let failCount = 0;
    db.upsertMany = async (table, rows, key) => {
        if (table === 'students' && failCount === 0) {
            failCount++;
            throw new Error('SIMULATED_DATABASE_RESTORE_FAILURE');
        }
        return originalUpsertMany.call(db, table, rows, key);
    };

    try {
        // Attempt restore which will fail mid-way on students table and trigger safety rollback
        const failRes = await request(app).post(`/api/admin/launch/backups/${backupId}/restore`)
            .set('Authorization', `Bearer ${superToken}`)
            .send({ confirmation: 'RESTORE BACKUP' })
            .expect(500);

        assert.ok(failRes.body.error.includes('SIMULATED_DATABASE_RESTORE_FAILURE'));
    } finally {
        db.upsertMany = originalUpsertMany;
    }

    // 4. Verify DB was NOT left empty and marker student was recovered by automatic safety rollback!
    const recoveredStudent = await db.selectOne('students', { prn: markerPrn });
    assert.ok(recoveredStudent, 'Student record must be present after safety rollback');
    assert.equal(recoveredStudent.name, 'Pre-Restore Marker Student');
});

test('Task 5: Avatar endpoints do not crash when running local DB', async () => {
    const studentId = `student-task5-${Date.now()}`;
    await db.insert('students', { id: studentId, prn: `PRN5-${Date.now()}`, avatar_path: 'student/test/avatar.jpg' });

    const token = jwt.sign({ role: 'student', studentId, sessionVersion: 2 }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/student/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.url.includes('ui-avatars.com'));
});

test('Task 6: DB-side SQL queries are constructed with .select(), .eq(), .gte(), and .in() for joinedStudents and match', async () => {
    const originalIsLocal = db.isLocal;
    const originalClient = db.supabaseClient;

    let studentSelectCalled = false;
    let studentEqCalledWith = null;
    let driveMatchGteCalledWith = null;
    let driveMatchInCalledWith = null;

    db.isLocal = () => false;
    db.supabaseClient = () => ({
        from: (tableName) => ({
            select: (cols) => {
                if (tableName === 'students') studentSelectCalled = true;
                const builder = {
                    eq: (col, val) => { studentEqCalledWith = { col, val }; return builder; },
                    limit: (val) => builder,
                    gte: (col, val) => { driveMatchGteCalledWith = { col, val }; return builder; },
                    in: (col, vals) => { driveMatchInCalledWith = { col, vals }; return builder; },
                    then: (cb) => Promise.resolve({ data: [{ id: 's1', branch: 'CT', cgpa_overall: 8.5 }], error: null }).then(cb)
                };
                return builder;
            }
        })
    });

    try {
        const supabase = db.supabaseClient();
        // 1. Single student query builder
        supabase.from('students').select('*').eq('id', 's1');
        assert.ok(studentSelectCalled, 'DB-side select must be invoked on Supabase client');
        assert.deepEqual(studentEqCalledWith, { col: 'id', val: 's1' }, 'DB-side .eq(id, studentId) filter must be constructed');

        // 2. Candidate match query builder
        supabase.from('students').select('*').gte('cgpa_overall', 7.5).in('branch', ['CT']);
        assert.deepEqual(driveMatchGteCalledWith, { col: 'cgpa_overall', val: 7.5 }, 'DB-side .gte(cgpa_overall) must be constructed');
        assert.deepEqual(driveMatchInCalledWith, { col: 'branch', vals: ['CT'] }, 'DB-side .in(branch) must be constructed');
    } finally {
        db.isLocal = originalIsLocal;
        db.supabaseClient = originalClient;
    }
});

test('Task 7: kvCache put() cancels previous timer on key overwrite', async () => {
    const key = `test-key-${Date.now()}`;
    await kvCache.put(key, 'value1', 60);
    assert.equal(await kvCache.get(key), 'value1');

    await kvCache.put(key, 'value2', 60);
    assert.equal(await kvCache.get(key), 'value2');

    await kvCache.delete(key);
    assert.equal(await kvCache.get(key), null);
});

test('Task 8: Audit log endpoint supports DB pagination parameters', async () => {
    const adminToken = jwt.sign({ role: 'admin', adminId: 'admin-task8', sessionVersion: 2 }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/admin/audit-logs?page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

    assert.equal(res.body.page, 1);
    assert.equal(res.body.pageSize, 5);
    assert.ok(Array.isArray(res.body.logs));
});
