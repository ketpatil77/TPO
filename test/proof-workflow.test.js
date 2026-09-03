process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `tpo-proof-workflow-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const db = require('../src/config/database');
const { runProofExpiryCleanup } = require('../src/services/proofExpiry');

function token(role, extra = {}) {
    return jwt.sign({ role, sessionVersion: 2, ...extra }, process.env.JWT_SECRET);
}
function writeHeaders(bearer, csrf = `csrf-${Math.random()}`) {
    return { Authorization: `Bearer ${bearer}`, Cookie: `csrfToken=${csrf}`, 'X-CSRF-Token': csrf };
}
function oldIso(hours = 49) {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

test('proof upload accepted: internship accepts the same 400KB JPG/PNG proof mechanism', async () => {
    const studentId = `proof-upload-student-${Date.now()}`;
    const internshipId = `proof-upload-internship-${Date.now()}`;
    const internship = { id: internshipId, student_id: studentId, company: 'Acme', role: 'Developer', start_date: '2026-01-01', mode: 'offline', verification_status: 'pending' };
    const original = {
        isLocal: db.isLocal,
        supabaseClient: db.supabaseClient,
        selectOne: db.selectOne,
        select: db.select,
        update: db.update
    };
    let uploadedPath = null;
    let updatedPayload = null;
    db.isLocal = () => false;
    db.selectOne = async (table, filter) => table === 'internships' && filter.id === internshipId ? internship : null;
    db.select = async table => table === 'internships' ? [internship] : [];
    db.update = async (_table, _filter, changes) => { updatedPayload = changes; return { ...internship, ...changes }; };
    db.supabaseClient = () => ({ storage: { from: () => ({
        upload: async (path) => { uploadedPath = path; return { error: null }; },
        remove: async () => ({ error: null }),
        download: async () => ({ data: null, error: null })
    }) } });
    try {
        const png = Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(32)]);
        const response = await request(app)
            .post(`/api/student/internship-evidence/${internshipId}`)
            .set(writeHeaders(token('student', { studentId })))
            .attach('evidence', png, { filename: 'proof.png', contentType: 'image/png' })
            .expect(200);
        assert.equal(response.body.success, true);
        assert.match(uploadedPath, new RegExp(`^internships/${studentId}/${internshipId}\\.png$`));
        assert.equal(updatedPayload.evidence_mime, 'image/png');
        assert.equal(updatedPayload.verification_status, 'pending');
        assert.equal(updatedPayload.proof_deadline, null);
    } finally {
        Object.assign(db, original);
    }
});

test('missing-proof notice triggered with entry name and exact deadline timestamp', async () => {
    const studentId = `proof-notice-student-${Date.now()}`;
    await db.insert('students', { id: studentId, prn: `PN-${Date.now()}`, name: 'Proof Notice Student', branch: 'CT' });
    const response = await request(app).post('/api/student/internships')
        .set(writeHeaders(token('student', { studentId })))
        .send({ company: 'Deadline Labs', role: 'Intern', start_date: '2026-01-01', mode: 'offline' })
        .expect(200);
    const notifications = await db.select('notifications', { student_id: studentId });
    const notice = notifications.find(item => /Internship proof required/i.test(item.title || ''));
    assert.ok(notice, 'Missing-proof notification must be created.');
    assert.match(notice.message, /Deadline Labs - Intern/);
    const isoMatches = notice.message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g) || [];
    assert.equal(isoMatches.length, 1, 'Notice must contain the exact ISO deadline timestamp.');
    assert.ok(new Date(isoMatches[0]).getTime() > Date.now() + 47 * 60 * 60 * 1000);
    const stored = await db.selectOne('internships', { id: response.body.internship.id });
    assert.ok(stored.proof_notice_sent_at, 'Entry must record that the required deadline notice was sent.');
    assert.equal(response.body.internship.verification_status, 'pending');
});

test('legacy missing-proof record gets a fresh notice and 48hr deadline before any deletion', async () => {
    const studentId = `proof-legacy-student-${Date.now()}`;
    await db.insert('students', { id: studentId, prn: `PL-${Date.now()}`, name: 'Legacy Proof Student', branch: 'CE' });
    const entry = await db.insert('certificates', { student_id: studentId, name: 'Legacy Certificate', issuer: 'Issuer', date: '2026-01-01', mode: 'online', created_at: oldIso(72), proof_deadline: oldIso(1), evidence_path: null, proof_notice_sent_at: null });
    const now = new Date();
    const result = await runProofExpiryCleanup({ now });
    assert.equal(await db.selectOne('certificates', { id: entry.id }) !== null, true, 'Legacy entry must survive its first expired scan when no notice was previously sent.');
    assert.ok(result.notices_sent >= 1);
    const refreshed = await db.selectOne('certificates', { id: entry.id });
    assert.ok(refreshed.proof_notice_sent_at);
    assert.ok(new Date(refreshed.proof_deadline).getTime() >= now.getTime() + (47 * 60 * 60 * 1000));
    const notifications = await db.select('notifications', { student_id: studentId });
    assert.ok(notifications.some(item => /Legacy Certificate/.test(item.message || '')));
});

test('48hr auto-delete fires only when no proof is attached', async () => {
    const studentId = `proof-expiry-student-${Date.now()}`;
    const prn = `PX-${Date.now()}`;
    await db.insert('students', { id: studentId, prn, name: 'Expiry Student', branch: 'CT' });
    const missing = await db.insert('internships', { student_id: studentId, company: 'No Proof Co', role: 'Intern', start_date: '2026-01-01', mode: 'offline', created_at: oldIso(), proof_missing_since: oldIso(), proof_deadline: oldIso(1), proof_notice_sent_at: oldIso(49), evidence_path: null });
    const protectedPending = await db.insert('internships', { student_id: studentId, company: 'Has Proof Co', role: 'Intern', start_date: '2026-01-01', mode: 'offline', created_at: oldIso(), proof_missing_since: oldIso(), proof_deadline: oldIso(1), proof_notice_sent_at: oldIso(49), evidence_path: 'internships/proof.jpg', verification_status: 'pending' });
    const result = await runProofExpiryCleanup({ now: new Date() });
    assert.ok(result.deleted >= 1);
    assert.equal(await db.selectOne('internships', { id: missing.id }), null, 'Missing-proof record must be deleted after its notified deadline.');
    assert.ok(await db.selectOne('internships', { id: protectedPending.id }), 'Proof-attached pending record must never be deleted for verification delay.');
});

test('48hr auto-delete does NOT fire when proof attached but still unverified', async () => {
    const studentId = `proof-pending-student-${Date.now()}`;
    await db.insert('students', { id: studentId, prn: `PP-${Date.now()}`, name: 'Pending Review Student', branch: 'ME' });
    const entry = await db.insert('certificates', { student_id: studentId, name: 'Pending Certificate', issuer: 'Issuer', date: '2026-01-01', mode: 'online', created_at: oldIso(72), proof_deadline: oldIso(24), proof_notice_sent_at: oldIso(72), evidence_path: 'certificates/pending.jpg', verification_status: 'pending' });
    await runProofExpiryCleanup({ now: new Date() });
    assert.ok(await db.selectOne('certificates', { id: entry.id }));
});

test('TPO can approve and reject uploaded internship proofs', async () => {
    const studentId = `proof-tpo-student-${Date.now()}`;
    const adminId = `proof-admin-${Date.now()}`;
    await db.insert('students', { id: studentId, prn: `PT-${Date.now()}`, name: 'TPO Review Student', branch: 'EE' });
    const entry = await db.insert('internships', { student_id: studentId, company: 'Verify Co', role: 'Intern', start_date: '2026-01-01', mode: 'offline', evidence_path: 'internships/verify.jpg', verification_status: 'pending' });
    const headers = writeHeaders(token('admin', { adminId }));
    let response = await request(app).post(`/api/admin/proof-review/internship/${entry.id}/review`).set(headers).send({ status: 'approved', note: '' }).expect(200);
    assert.equal(response.body.data.verification_status, 'approved');
    response = await request(app).post(`/api/admin/proof-review/internship/${entry.id}/review`).set(headers).send({ status: 'rejected', note: 'Unreadable proof' }).expect(200);
    assert.equal(response.body.data.verification_status, 'rejected');
});

test('TPC can approve/reject only own department entries', async () => {
    const observerId = `proof-tpc-${Date.now()}`;
    const ctStudent = `proof-ct-${Date.now()}`;
    const eeStudent = `proof-ee-${Date.now()}`;
    await db.insert('students', { id: ctStudent, prn: `CT-${Date.now()}`, name: 'CT Student', branch: 'CT' });
    await db.insert('students', { id: eeStudent, prn: `EE-${Date.now()}`, name: 'EE Student', branch: 'EE' });
    const ctEntry = await db.insert('internships', { student_id: ctStudent, company: 'CT Co', role: 'Intern', start_date: '2026-01-01', mode: 'offline', evidence_path: 'internships/ct.jpg', verification_status: 'pending' });
    const eeEntry = await db.insert('internships', { student_id: eeStudent, company: 'EE Co', role: 'Intern', start_date: '2026-01-01', mode: 'offline', evidence_path: 'internships/ee.jpg', verification_status: 'pending' });
    const headers = writeHeaders(token('observer', { observerId, department: 'CT' }));
    await request(app).post(`/api/observer/proof-review/internship/${ctEntry.id}/review`).set(headers).send({ status: 'approved', note: '' }).expect(200);
    const denied = await request(app).post(`/api/observer/proof-review/internship/${eeEntry.id}/review`).set(headers).send({ status: 'rejected', note: 'No' }).expect(403);
    assert.equal(denied.body.error.code, 'OUT_OF_SCOPE');
});

test('audit_log records both verification status changes and automatic proof deletions', async () => {
    const studentId = `proof-audit-student-${Date.now()}`;
    const prn = `PA-${Date.now()}`;
    const adminId = `proof-audit-admin-${Date.now()}`;
    await db.insert('students', { id: studentId, prn, name: 'Audit Student', branch: 'AIML' });
    const reviewEntry = await db.insert('internships', { student_id: studentId, company: 'Audit Review Co', role: 'Intern', start_date: '2026-01-01', mode: 'offline', evidence_path: 'internships/audit.jpg', verification_status: 'pending' });
    await request(app).post(`/api/admin/proof-review/internship/${reviewEntry.id}/review`)
        .set(writeHeaders(token('admin', { adminId })))
        .send({ status: 'approved', note: 'Valid' })
        .expect(200);
    const expiryEntry = await db.insert('certificates', { student_id: studentId, name: 'Old Missing Proof', issuer: 'Issuer', date: '2026-01-01', mode: 'online', created_at: oldIso(), proof_deadline: oldIso(1), proof_notice_sent_at: oldIso(49), evidence_path: null });
    await runProofExpiryCleanup({ now: new Date() });
    const logs = await db.select('audit_log');
    const reviewLog = logs.find(item => item.action === 'proof_verification_status_change' && item.target_id === reviewEntry.id);
    const deleteLog = logs.find(item => item.action === 'proof_auto_delete' && item.target_id === expiryEntry.id);
    assert.ok(reviewLog);
    assert.equal(reviewLog.details.actor_id, adminId);
    assert.equal(reviewLog.details.old_status, 'pending');
    assert.equal(reviewLog.details.new_status, 'approved');
    assert.ok(deleteLog);
    assert.equal(deleteLog.details.student_prn, prn);
    assert.equal(deleteLog.details.reason, 'no proof attached within 48hrs');
    assert.ok(deleteLog.details.proof_notice_sent_at);
});
