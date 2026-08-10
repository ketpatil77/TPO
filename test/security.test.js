process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-test-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/server');

test('health endpoint responds', async () => {
    const response = await request(app).get('/api/health').expect(200);
    assert.equal(response.body.data.status, 'ok');
});

test('legacy public roster endpoints are unavailable', async () => {
    await request(app).get('/api/roster').expect(404);
    await request(app).post('/api/roster/bulk').send({ records: [] }).expect(404);
});

test('student and admin endpoints reject missing credentials', async () => {
    await request(app).get('/api/student/profile').expect(401);
    await request(app).get('/api/admin/students').expect(401);
});

test('student login gives generic invalid credential response', async () => {
    const response = await request(app).post('/api/auth/login').send({ prn: '99999999999999', dob: '010100' }).expect(401);
    assert.equal(response.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(response.body.error.message, 'Invalid PRN or date of birth.');
});

test('authenticated mutation rejects missing CSRF header', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ prn: '24053651251515', dob: '310703' }).expect(200);
    const response = await agent.put('/api/student/skills').send({ skills: ['JavaScript'] }).expect(403);
    assert.equal(response.body.error.code, 'CSRF_INVALID');
});
