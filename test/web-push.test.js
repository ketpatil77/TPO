process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-web-push-${process.pid}.json`);
process.env.VAPID_PUBLIC_KEY = 'BFkWk7IB0kGMCb-QcL6QUL0g4uX4dq50tXnFQ3vfpu6NV6Hh4-29vJa4oop-UYEqj6mj4G7yun5f-RyS5aBB-Tg';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';
process.env.VAPID_SUBJECT = 'mailto:ket.patil77@gmail.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const db = require('../src/config/database');
const { runIncompleteProfilePushJob, buildReminderPayload, sendStudentProfilePush, runProfileCompletionBroadcast, createStudentNotification, vapidDetails, normalizeBase64Url } = require('../src/services/incompleteProfilePush');

const studentId = `push-student-${process.pid}`;
const token = jwt.sign({ role: 'student', studentId, sessionVersion: 2 }, process.env.JWT_SECRET);
const headers = { Authorization: `Bearer ${token}` };
const subscription = { endpoint: 'https://push.example.test/subscription/one', expirationTime: null, keys: { p256dh: 'public-key-material', auth: 'auth-material' } };

test.before(async () => {
  await db.insert('roster', { id: `push-roster-${process.pid}`, prn: `98${process.pid}`, name: 'Push Student', dob: '2004-01-01', branch: 'CT', class: 'BE-A', year: 'Final Year' });
  await db.insert('students', { id: studentId, prn: `98${process.pid}`, name: 'Push Student', branch: 'CT', class: 'BE-A', year: 'Final Year', email: '', phone: '', profile_active: true });
});

test('push config exposes only public configuration and reports opt-out state', async () => {
  const response = await request(app).get('/api/student/push/config').set(headers).expect(200);
  assert.equal(response.body.data.publicKey, process.env.VAPID_PUBLIC_KEY);
  assert.equal(response.body.data.threshold, 80);
  assert.equal(response.body.data.subscribed, false);
  assert.equal(JSON.stringify(response.body).includes('test-private-key'), false);
});

test('student can subscribe while unsubscribe and test endpoints stay unavailable', async () => {
  await request(app).post('/api/student/push/subscriptions').set(headers).send(subscription).expect(201);
  const saved = await db.selectOne('student_push_subscriptions', { endpoint: subscription.endpoint });
  assert.equal(saved.student_id, studentId);
  assert.deepEqual(saved.subscription, subscription);
  const status = await request(app).get('/api/student/push/config').set(headers).expect(200);
  assert.equal(status.body.data.subscribed, true);
  await request(app).delete('/api/student/push/subscriptions').set(headers).send({ endpoint: subscription.endpoint }).expect(404);
  await request(app).post('/api/student/push/test').set(headers).expect(404);
  await db.delete('student_push_subscriptions', { id: saved.id });
});

test('subscription endpoint rejects malformed and cross-site payloads', async () => {
  await request(app).post('/api/student/push/subscriptions').set(headers).send({ endpoint: 'javascript:alert(1)', keys: {} }).expect(400);
});

test('reminder payload uses shared completion result and top three missing items', () => {
  const payload = buildReminderPayload({ completion: 61, missing: ['Photo', 'Email', 'Resume', 'Skills'] });
  assert.match(payload.body, /61%/);
  assert.match(payload.body, /Photo, Email, Resume/);
  assert.doesNotMatch(payload.body, /Skills/);
});

test('complete profile reminder confirms completion without empty missing list', () => {
  const payload = buildReminderPayload({ completion: 100, missing: [] });
  assert.match(payload.body, /100% complete/);
  assert.doesNotMatch(payload.body, /Add:/);
});

test('VAPID settings trim secret-store whitespace without exposing or changing keys', () => {
  assert.deepEqual(vapidDetails({ VAPID_SUBJECT: ' mailto:test@example.com\n', VAPID_PUBLIC_KEY: ' public ', VAPID_PRIVATE_KEY: ' private\r\n' }), { subject: 'mailto:test@example.com', publicKey: 'public', privateKey: 'private' });
});

test('standard padded Base64 VAPID secrets normalize to equivalent Base64URL', () => {
  assert.equal(normalizeBase64Url(' "ab+c/de="\r\n'), 'ab-c_de');
  assert.equal(normalizeBase64Url(`VAPID_PRIVATE_KEY=${'a'.repeat(43)}`), 'a'.repeat(43));
});

test('push job sends incomplete profiles and deletes expired subscriptions without retry', async () => {
  const good = { ...subscription, endpoint: 'https://push.example.test/good' };
  const expired = { ...subscription, endpoint: 'https://push.example.test/expired' };
  await db.insert('student_push_subscriptions', { student_id: studentId, endpoint: good.endpoint, subscription: good, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  await db.insert('student_push_subscriptions', { student_id: studentId, endpoint: expired.endpoint, subscription: expired, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const calls = [];
  const sender = async (sub, payload, options) => {
    calls.push({ sub, payload: JSON.parse(payload), options });
    if (sub.endpoint.endsWith('/expired')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    return { statusCode: 201 };
  };
  const result = await runIncompleteProfilePushJob({ sendNotification: sender, env: process.env, now: new Date('2026-08-27T06:00:00Z') });
  assert.equal(result.sent, 1);
  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.vapidDetails.privateKey, 'test-private-key');
  assert.equal(await db.selectOne('student_push_subscriptions', { endpoint: expired.endpoint }), null);
  assert.ok(await db.selectOne('student_push_subscriptions', { endpoint: good.endpoint }));
});

test('student test push sends only that student with accurate shared completion data', async () => {
  for (const record of await db.select('student_push_subscriptions', { student_id: studentId })) await db.delete('student_push_subscriptions', { id: record.id });
  const endpoint = 'https://push.example.test/student-test';
  const sub = { ...subscription, endpoint };
  await db.insert('student_push_subscriptions', { student_id: studentId, endpoint, subscription: sub, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  let delivered;
  const result = await sendStudentProfilePush(studentId, { env: process.env, sendNotification: async (_subscription, payload) => { delivered = JSON.parse(payload); return { statusCode: 201 }; } });
  assert.equal(result.sent, 1);
  assert.match(delivered.body, new RegExp(`${result.completion}%`));
  assert.deepEqual(delivered.data.missing, result.missing.slice(0, 3));
});

test('portal notifications push events and placements only to targeted students', async () => {
  const eeId = `push-ee-${process.pid}`;
  for (const record of await db.select('student_push_subscriptions', { student_id: studentId })) await db.delete('student_push_subscriptions', { id: record.id });
  await db.insert('students', { id: eeId, prn: `97${process.pid}`, name: 'EE Student', branch: 'EE', class: 'BE-A', year: 'Final Year', profile_active: true });
  const ctSub = { ...subscription, endpoint: 'https://push.example.test/ct-alert' };
  const eeSub = { ...subscription, endpoint: 'https://push.example.test/ee-alert' };
  await db.insert('student_push_subscriptions', { student_id: studentId, endpoint: ctSub.endpoint, subscription: ctSub, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  await db.insert('student_push_subscriptions', { student_id: eeId, endpoint: eeSub.endpoint, subscription: eeSub, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const delivered = [];
  const { notification, delivery } = await createStudentNotification({ audience: 'branches', student_id: null, branches: ['CT'], title: 'Placement event', message: 'Drive starts tomorrow.', action_url: '/dashboard?tab=opportunities' }, { env: process.env, sendNotification: async (sub, payload) => { delivered.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } });
  assert.equal(delivery.sent, 1);
  assert.equal(delivered[0].endpoint, ctSub.endpoint);
  assert.equal(delivered[0].payload.title, 'Placement event');
  assert.equal(delivered[0].payload.data.notificationId, notification.id);
  assert.match(delivered[0].payload.tag, /portal-notification-/);
});

test('profile completion broadcast reaches every subscribed student device', async () => {
  const delivered = [];
  const result = await runProfileCompletionBroadcast({ env: process.env, sendNotification: async (sub, payload) => { delivered.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } });
  assert.equal(result.sent, result.subscriptions);
  assert.equal(result.failed, 0);
  assert.equal(delivered.length, result.subscriptions);
  assert.ok(delivered.every(item => /profile/i.test(item.payload.body)));
});
