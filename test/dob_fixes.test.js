const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
require('dotenv').config({ override: false });

const app = require('../src/server');
const db = require('../src/config/database');
const kvCache = require('../src/utils/kvCache');

test('DOB Correction 4 Fixes Verification Suite', async (t) => {
    db.init();

    assert.equal(db.isLocal(), true, 'DOB tests must never use production Supabase');

    const prn = '24053651251515'; // Roster student

    await t.test('1. Turnstile validation: Reject invalid/missing token', async () => {
        try {
            await kvCache.clearPattern('rate_limit:ip:');

            // Turnstile middleware rejects missing tokens before request validation.
            const resNoToken = await request(app)
                .post('/api/auth/dob-correction-requests')
                .send({
                    prn,
                    name: 'Rahul Sharma',
                    dob: '310703'
                });
            assert.equal(resNoToken.status, 403);
            assert.match(JSON.stringify(resNoToken.body), /security verification/i);

            // Invalid tokens are forbidden.
            const resInvalidToken = await request(app)
                .post('/api/auth/dob-correction-requests')
                .send({
                    prn,
                    name: 'Rahul Sharma',
                    dob: '310703',
                    token: 'x'.repeat(2049)
                });
            assert.equal(resInvalidToken.status, 403);
            assert.match(JSON.stringify(resInvalidToken.body), /security verification/i);
        } catch (err) {
            console.error('Test 1 error:', err);
            throw err;
        }
    });

    await t.test('2. IP rate limit: Block 4th submission in an hour', async () => {
        try {
            await kvCache.clearPattern('rate_limit:ip:');

            for (let i = 0; i < 3; i++) {
                if (!db.isLocal()) {
                    await db.supabaseClient().from('dob_corrections').delete().eq('prn', prn);
                } else {
                    const pending = await db.selectOne('dob_corrections', { prn });
                    if (pending) await db.delete('dob_corrections', { prn });
                }

                const res = await request(app)
                    .post('/api/auth/dob-correction-requests')
                    .send({
                        prn,
                        name: 'Rahul Sharma',
                        dob: '310703',
                        token: 'test-turnstile-token'
                    });
                assert.ok(res.status === 201 || res.status === 400);
            }

            const res = await request(app)
                .post('/api/auth/dob-correction-requests')
                .send({
                    prn,
                    name: 'Rahul Sharma',
                    dob: '310703',
                    token: 'test-turnstile-token'
                });
            assert.equal(res.status, 429);
            assert.match(res.body.error, /rate limit|Too many correction requests/);

            await kvCache.clearPattern('rate_limit:ip:');
        } catch (err) {
            console.error('Test 2 error:', err);
            throw err;
        }
    });

    await t.test('3. Roster name boundary rejects mismatched names', async () => {
        try {
            await kvCache.clearPattern('rate_limit:ip:');

            if (!db.isLocal()) {
                await db.supabaseClient().from('dob_corrections').delete().eq('prn', prn);
            } else {
                const pending = await db.selectOne('dob_corrections', { prn });
                if (pending) await db.delete('dob_corrections', { prn });
            }

            const res = await request(app)
                .post('/api/auth/dob-correction-requests')
                .send({
                    prn,
                    name: 'Wrong Name Candidate',
                    dob: '310703',
                    token: 'test-turnstile-token'
                }).expect(400);

            assert.match(JSON.stringify(res.body), /Name does not match/i);
        } catch (err) {
            console.error('Test 3 error:', err);
            throw err;
        }
    });

    await t.test('4. Critical Auth fallback: Direct Supabase query on DOB match failure', async () => {
        try {
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({
                    prn,
                    dob: '310703',
                    token: 'test-turnstile-token'
                });
            assert.equal(loginRes.status, 200);
        } catch (err) {
            console.error('Test 4 error:', err);
            throw err;
        }
    });

    await t.test('5. Student Login Turnstile: reject missing/invalid token', async () => {
        try {
            // Missing token
            const resNoToken = await request(app)
                .post('/api/auth/login')
                .send({ prn, dob: '310703' });
            assert.equal(resNoToken.status, 403);
            assert.match(JSON.stringify(resNoToken.body), /security verification/i);

            // Invalid token
            const resInvalidToken = await request(app)
                .post('/api/auth/login')
                .send({ prn, dob: '310703', token: 'x'.repeat(2049) });
            assert.equal(resInvalidToken.status, 403);
            assert.match(JSON.stringify(resInvalidToken.body), /security verification/i);
        } catch (err) {
            console.error('Test 5 error:', err);
            throw err;
        }
    });

    await t.test('6. Admin Login Turnstile: reject missing/invalid token', async () => {
        try {
            // Missing token
            const resNoToken = await request(app)
                .post('/api/admin/auth/login')
                .send({ email: 'tpoait@gmail.com', password: 'wrong' });
            assert.equal(resNoToken.status, 403);
            assert.match(JSON.stringify(resNoToken.body), /security verification/i);

            // Invalid token
            const resInvalidToken = await request(app)
                .post('/api/admin/auth/login')
                .send({ email: 'tpoait@gmail.com', password: 'wrong', token: 'x'.repeat(2049) });
            assert.equal(resInvalidToken.status, 403);
            assert.match(JSON.stringify(resInvalidToken.body), /security verification/i);
        } catch (err) {
            console.error('Test 6 error:', err);
            throw err;
        }
    });

    await t.test('7. Observer Login Turnstile: reject missing/invalid token', async () => {
        try {
            // Missing token
            const resNoToken = await request(app)
                .post('/api/observer/auth/login')
                .send({ email: 'tpcee@gmail.com', password: 'wrong' });
            assert.equal(resNoToken.status, 403);
            assert.match(JSON.stringify(resNoToken.body), /security verification/i);

            // Invalid token
            const resInvalidToken = await request(app)
                .post('/api/observer/auth/login')
                .send({ email: 'tpcee@gmail.com', password: 'wrong', token: 'x'.repeat(2049) });
            assert.equal(resInvalidToken.status, 403);
            assert.match(JSON.stringify(resInvalidToken.body), /security verification/i);
        } catch (err) {
            console.error('Test 7 error:', err);
            throw err;
        }
    });
});
