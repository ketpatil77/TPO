process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-test-avatar-export-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const app = require('../src/server');
const db = require('../src/config/database');

function binaryParser(res, callback) {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
}

test('successful login clears stale legacy bearer tokens, verifies cookie session, and replaces location', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'portal.js'), 'utf8');
    assert.match(source, /session:\s*'\/api\/auth\/me'/);
    assert.match(source, /session:\s*'\/api\/admin\/auth\/me'/);
    assert.match(source, /session:\s*'\/api\/observer\/auth\/me'/);
    assert.match(source, /localStorage\.removeItem\(key\)/);
    assert.match(source, /'tpo_token'/);
    assert.match(source, /'tpo_admin_token'/);
    assert.match(source, /credentials:\s*'same-origin'/);
    assert.match(source, /await verifyFreshSession\(config\)/);
    assert.match(source, /window\.location\.replace\(config\.redirect\)/);
});

test('TPO and TPC load student profile-photo enhancement with authenticated avatar endpoints', () => {
    const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'portal-responsive.js'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'student-directory-avatars.js'), 'utf8');
    assert.match(loader, /student-directory-avatars\.css/);
    assert.match(loader, /student-directory-avatars\.js/);
    assert.match(source, /student\.avatar_path/);
    assert.match(source, /\/api\/admin\/student-avatars\//);
    assert.match(source, /\/api\/observer\/student-avatars\//);
});

test('student avatar directories are protected for all portal roles', async () => {
    await request(app).get('/api/student/student-avatars/00000000-0000-0000-0000-000000000000').expect(401);
    await request(app).get('/api/admin/student-avatars/00000000-0000-0000-0000-000000000000').expect(401);
    await request(app).get('/api/observer/student-avatars/00000000-0000-0000-0000-000000000000').expect(401);
});

test('complete student Excel export preserves exact PRN and includes contact, address, links and profile data', async () => {
    const suffix = String(Date.now()).slice(-6);
    const prn = `2505365111${suffix}`.slice(0, 16).padEnd(16, '4');
    const studentId = `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

    await db.insert('roster', {
        prn,
        name: 'Export Regression Student',
        dob: '2004-01-15',
        branch: 'CT',
        class: 'BE-A',
        year: 'Final Year'
    });
    await db.insert('students', {
        id: studentId,
        prn,
        name: 'Export Regression Student',
        branch: 'CT',
        class: 'BE-A',
        year: 'Final Year',
        email: 'student@example.com',
        phone: '9876543210',
        avatar_path: `student/${studentId}/avatar.jpg`,
        github_url: 'https://github.com/example',
        portfolio_url: 'https://example.com',
        company_address: 'Pune, Maharashtra',
        hr_name: 'Test HR',
        hr_number: '9999999999',
        cgpa_overall: 8.25,
        cgpa_semesterwise: { sem1: 8.1, sem2: 8.4 },
        backlogs_semesterwise: {},
        activities: 'Placement club',
        resume_url: `${studentId}/resume.pdf`
    });

    const token = jwt.sign({ role: 'admin', adminId: 'excel-export-admin', sessionVersion: 2 }, process.env.JWT_SECRET);
    const response = await request(app)
        .get(`/api/admin/students/export/excel?search=${encodeURIComponent(prn)}`)
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const sheet = workbook.getWorksheet('Complete Student Data');
    assert.ok(sheet, 'complete export sheet must exist');

    const headers = sheet.getRow(1).values.map(value => String(value || ''));
    for (const required of ['PRN', 'Email', 'Mobile Number', 'Company Address', 'GitHub URL', 'Portfolio URL', 'HR Name', 'HR Number', 'Skills', 'Internships', 'Certificates', 'Projects', 'Research Papers', 'Competitions']) {
        assert.ok(headers.includes(required), `missing export column: ${required}`);
    }

    const row = sheet.getRow(2);
    assert.equal(String(row.getCell(1).value), prn);
    assert.equal(row.getCell(headers.indexOf('Email')).value, 'student@example.com');
    assert.equal(row.getCell(headers.indexOf('Mobile Number')).value, '9876543210');
    assert.equal(row.getCell(headers.indexOf('Company Address')).value, 'Pune, Maharashtra');
    assert.equal(row.getCell(headers.indexOf('Profile Photo Uploaded')).value, 'Yes');
    assert.equal(sheet.getColumn(1).numFmt, '@');
});
