process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-login-throttle-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/server');

test('one shared IP does not rate-limit unrelated student PRNs', async () => {
    const statuses = [];
    for (let index = 0; index < 11; index += 1) {
        const response = await request(app)
            .post('/api/auth/login')
            .set('X-Forwarded-For', '203.0.113.10')
            .send({
                prn: `990000000000${String(index).padStart(2, '0')}`,
                dob: '010100',
                token: 'test-turnstile-token'
            });
        statuses.push(response.status);
    }

    assert.deepEqual(statuses, Array(11).fill(401));
});
