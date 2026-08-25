process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-profile-completion-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const app = require('../src/server');
const db = require('../src/config/database');
const { completionRow, CHECKS } = require('../src/routes/profileCompletion');

function source(overrides = {}) {
    return { prn: '990000000001', name: 'Complete Student', branch: 'CT', class: 'BE-A', year: 'Final Year', profile_active: true, avatar_path: 'avatars/x.jpg', email: 'complete@example.com', phone: '9876543210', ssc_marks: 81, hsc_marks: 79, cgpa_overall: 8.2, backlogs_semesterwise: { sem1: 0 }, resume_url: 'resumes/x.pdf', activities: 'NSS', has_skills: true, has_internship: true, has_certificate: true, has_project: true, has_research: true, is_employed: false, ...overrides };
}

test('completion model distinguishes complete, one missing, and multiple missing profiles', () => {
    assert.equal(CHECKS.length, 18);
    const complete = completionRow(source());
    assert.equal(complete.completion, 100); assert.deepEqual(complete.missing, []);
    const one = completionRow(source({ has_research: false }));
    assert.equal(one.missing.length, 1); assert.deepEqual(one.missing, ['Research paper']);
    const multiple = completionRow(source({ avatar_path: null, email: '', cgpa_overall: 0, backlogs_semesterwise: {}, resume_url: null }));
    assert.deepEqual(multiple.missing, ['Photo', 'Email', 'Overall CGPA', 'Backlog declaration', 'Resume']);
});

test('TPO Excel export applies branch/year filters and reports exact missing fields', async () => {
    const suffix = String(Date.now()).slice(-8);
    const rows = [
        source({ prn: `91${suffix}01`, name: 'Full Export Student' }),
        source({ prn: `91${suffix}02`, name: 'One Missing Student', has_research: false }),
        source({ prn: `91${suffix}03`, name: 'Other Branch Student', branch: 'AIML', avatar_path: null, resume_url: null })
    ];
    for (const [index, row] of rows.entries()) {
        const id = `completion-${suffix}-${index}`;
        await db.insert('roster', { id: `roster-${id}`, prn: row.prn, name: row.name, dob: '2004-01-01', branch: row.branch, class: row.class, year: row.year });
        await db.insert('students', { ...row, id });
        await db.insert('student_skills', { id: `skill-${id}`, student_id: id, skill: 'JavaScript' });
        await db.insert('internships', { id: `intern-${id}`, student_id: id, company: 'Example', role: 'Intern', start_date: '2026-01-01' });
        await db.insert('certificates', { id: `cert-${id}`, student_id: id, name: 'Cloud', issuer: 'AIT', date: '2026-01-01' });
        await db.insert('student_projects', { id: `project-${id}`, student_id: id, title: 'Portal', summary: 'Placement portal' });
        if (row.has_research) await db.insert('research_papers', { id: `paper-${id}`, student_id: id, title: 'Paper', authors: row.name, publication: 'Journal', abstract: 'Abstract', published_on: '2026-01-01' });
    }
    const token = jwt.sign({ role: 'super_admin', adminId: 'profile-report-admin', sessionVersion: 2 }, process.env.JWT_SECRET);
    const response = await request(app).get('/api/admin/profile-completion/excel?branch=CT&year=Final%20Year').set('Authorization', `Bearer ${token}`).buffer(true).parse((res, done) => { const chunks=[]; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); }).expect(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.body); const sheet = workbook.getWorksheet('Profile Completion');
    const values = []; sheet.eachRow((row, index) => { if (index > 1) values.push({ name: row.getCell(2).value, completion: row.getCell(5).value, missingCount: row.getCell(6).value, missing: row.getCell(7).value }); });
    const full = values.find(row => row.name === 'Full Export Student'); const one = values.find(row => row.name === 'One Missing Student');
    assert.ok(full, JSON.stringify(values)); assert.ok(one, JSON.stringify(values)); assert.equal(values.some(row => row.name === 'Other Branch Student'), false);
    assert.equal(full.completion, 100); assert.equal(full.missing, 'Complete');
    assert.equal(one.missingCount, 1); assert.equal(one.missing, 'Research paper');
});
