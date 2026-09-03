process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-test-system-audit-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const db = require('../src/config/database');
const { normalizeYear } = require('../src/config/years');

const adminToken = jwt.sign({ role: 'admin', adminId: 'system-audit-admin', sessionVersion: 2 }, process.env.JWT_SECRET);
let csrfCounter = 0;
function adminHeaders() {
    const csrf = `system-audit-csrf-${++csrfCounter}`;
    return {
        Authorization: `Bearer ${adminToken}`,
        Cookie: `csrfToken=${csrf}`,
        'X-CSRF-Token': csrf
    };
}

function uniquePrn(suffix = '') {
    const tail = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return (`25${tail}${suffix}`).replace(/\D/g, '').slice(0, 16).padEnd(12, '0');
}

function csvRow({ prn, name = 'System Audit Student', dob = '01-01-2004', branch = 'CT', className = 'BE-A', year = 'Final Year' }) {
    return `prn,name,dob,branch,class,year\n${prn},${name},${dob},${branch},${className},${year}`;
}

test('academic years normalize to the canonical four values', () => {
    assert.equal(normalizeYear('THIRD YEAR'), 'Third Year');
    assert.equal(normalizeYear('  second   year '), 'Second Year');
    assert.equal(normalizeYear('Final Year'), 'Final Year');
    assert.equal(normalizeYear('TY'), null);
});

test('live activity UI has independent class and year filters and a duplicate-load guard', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/student-activity-feed.js'), 'utf8');
    assert.match(source, /window\.__studentActivityFeedLoaded/);
    assert.match(source, /id="activityClass"/);
    assert.match(source, /id="activityYear"/);
    assert.match(source, /p\.set\('class', className\)/);
    assert.match(source, /p\.set\('year', year\)/);
    assert.match(source, /data\.options\?\.classes/);
    assert.match(source, /data\.options\?\.years/);
});

test('roster preview rejects malformed PRNs, invalid years, and duplicate PRNs', async () => {
    const duplicatePrn = uniquePrn('11');
    const csv = [
        'prn,name,dob,branch,class,year',
        '12ABC,Invalid PRN,01-01-2004,CT,BE-A,Final Year',
        `${duplicatePrn},Bad Year,01-01-2004,CT,BE-A,TY`,
        `${duplicatePrn},Duplicate,01-01-2004,CT,BE-A,Final Year`
    ].join('\n');

    const res = await request(app).post('/api/admin/roster/preview')
        .set(adminHeaders())
        .field('csvContent', csv)
        .expect(200);

    assert.equal(res.body.data.summary.total, 3);
    assert.equal(res.body.data.summary.invalid, 3);
    assert.ok(res.body.data.rows[0].errors.some(error => /10–20 digits/.test(error)));
    assert.ok(res.body.data.rows[1].errors.some(error => /Invalid year/.test(error)));
    assert.ok(res.body.data.rows[2].errors.some(error => /Duplicate PRN/.test(error)));
});

test('roster upload canonicalizes year and synchronizes authoritative student assignment', async () => {
    const prn = uniquePrn('21');
    await db.insert('roster', { prn, name: 'Assignment Student', dob: '2004-01-01', branch: 'CT', class: 'BE-A', year: 'First Year' });
    await db.insert('students', { id: `student-${prn}`, prn, name: 'Assignment Student', branch: 'CT', class: 'BE-A', year: 'First Year' });

    const res = await request(app).post('/api/admin/roster/upload')
        .set(adminHeaders())
        .field('csvContent', csvRow({ prn, name: 'Assignment Student', year: 'THIRD YEAR' }))
        .expect(200);

    assert.equal(res.body.success, true);
    const roster = await db.selectOne('roster', { prn });
    const student = await db.selectOne('students', { prn });
    assert.equal(roster.year, 'Third Year');
    assert.equal(student.year, 'Third Year');

    await request(app).post(`/api/admin/roster/imports/${res.body.summary.batchId}/undo`)
        .set(adminHeaders())
        .expect(200);

    const restoredRoster = await db.selectOne('roster', { prn });
    const restoredStudent = await db.selectOne('students', { prn });
    assert.equal(restoredRoster.year, 'First Year');
    assert.equal(restoredStudent.year, 'First Year');
});

test('roster import rolls back roster and student assignment after a mid-write failure', async () => {
    const prn = uniquePrn('31');
    await db.insert('roster', { prn, name: 'Rollback Student', dob: '2004-01-01', branch: 'CT', class: 'BE-A', year: 'First Year' });
    await db.insert('students', { id: `student-${prn}`, prn, name: 'Rollback Student', branch: 'CT', class: 'BE-A', year: 'First Year' });

    const originalUpsertMany = db.upsertMany;
    let failedOnce = false;
    db.upsertMany = async function(table, rows, key) {
        if (table === 'students' && !failedOnce) {
            failedOnce = true;
            throw new Error('SIMULATED_STUDENT_ASSIGNMENT_WRITE_FAILURE');
        }
        return originalUpsertMany.call(db, table, rows, key);
    };

    try {
        const res = await request(app).post('/api/admin/roster/upload')
            .set(adminHeaders())
            .field('csvContent', csvRow({ prn, name: 'Rollback Student', year: 'Second Year' }))
            .expect(500);

        assert.equal(res.body.success, false);
        assert.match(res.body.error, /rolled back/i);
    } finally {
        db.upsertMany = originalUpsertMany;
    }

    const roster = await db.selectOne('roster', { prn });
    const student = await db.selectOne('students', { prn });
    assert.equal(roster.year, 'First Year');
    assert.equal(student.year, 'First Year');
});

test('undo refuses to cascade-delete a newly active student profile', async () => {
    const prn = uniquePrn('41');
    const upload = await request(app).post('/api/admin/roster/upload')
        .set(adminHeaders())
        .field('csvContent', csvRow({ prn, name: 'Active After Import' }))
        .expect(200);

    await db.insert('students', { id: `student-${prn}`, prn, name: 'Active After Import', branch: 'CT', class: 'BE-A', year: 'Final Year' });

    const undo = await request(app).post(`/api/admin/roster/imports/${upload.body.summary.batchId}/undo`)
        .set(adminHeaders())
        .expect(409);

    assert.match(undo.body.error, /newly added student profile/i);
    assert.ok(await db.selectOne('roster', { prn }));
    assert.ok(await db.selectOne('students', { prn }));
});
