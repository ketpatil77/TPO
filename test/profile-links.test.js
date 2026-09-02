process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-profile-links-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const app = require('../src/server');
const db = require('../src/config/database');

function auth(studentId) {
    const token = jwt.sign({ role: 'student', studentId, prn: `LINK${studentId}`, sessionVersion: 2 }, process.env.JWT_SECRET);
    return { Authorization: `Bearer ${token}`, Cookie: 'csrfToken=profile-links', 'X-CSRF-Token': 'profile-links' };
}

test('student can save, read and clear GitHub and portfolio links', async () => {
    const student = await db.insert('students', { prn: `LINK${Date.now()}`, name: 'Professional Link Student', branch: 'CT', class: 'BE-A', year: 'Final Year' });
    const headers = auth(student.id);

    const saved = await request(app).put('/api/student/profile-links').set(headers).send({
        github_url: 'https://github.com/example-student',
        portfolio_url: 'https://portfolio.example.com'
    }).expect(200);
    assert.equal(saved.body.data.github_url, 'https://github.com/example-student');
    assert.equal(saved.body.data.portfolio_url, 'https://portfolio.example.com');

    const read = await request(app).get('/api/student/profile-links').set('Authorization', headers.Authorization).expect(200);
    assert.equal(read.body.data.github_url, 'https://github.com/example-student');
    assert.equal(read.body.data.portfolio_url, 'https://portfolio.example.com');

    const cleared = await request(app).put('/api/student/profile-links').set(headers).send({ github_url: '', portfolio_url: '' }).expect(200);
    assert.equal(cleared.body.data.github_url, '');
    assert.equal(cleared.body.data.portfolio_url, '');
});

test('professional links reject non-GitHub profile URLs and non-HTTPS portfolio URLs', async () => {
    const student = await db.insert('students', { prn: `BADLINK${Date.now()}`, name: 'Link Validation Student', branch: 'AIML', class: 'BE-A', year: 'Second Year' });
    const headers = auth(student.id);
    await request(app).put('/api/student/profile-links').set(headers).send({ github_url: 'https://example.com/not-github' }).expect(400);
    await request(app).put('/api/student/profile-links').set(headers).send({ portfolio_url: 'http://portfolio.example.com' }).expect(400);
});

test('professional links endpoint is student-only and UI is loaded globally on student dashboards', async () => {
    await request(app).get('/api/student/profile-links').expect(401);
    const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'portal-responsive.js'), 'utf8');
    const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'profile-links.js'), 'utf8');
    assert.match(loader, /profile-links\.js\?v=20260902-2/);
    assert.match(ui, /Professional links/);
    assert.match(ui, /editGithubUrl/);
    assert.match(ui, /editPortfolioUrl/);
    assert.match(ui, /overviewProfileLinks/);
    assert.match(ui, /function overviewNeedsSync/);
    assert.doesNotMatch(ui, /querySelectorAll\('\[data-professional-link\]'\)\.forEach\(node => node\.remove\(\)\)/);
});
