const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin, authenticateObserver } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const reviewSchema = z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
    note: z.string().trim().max(500).optional().default('')
}).strict();

function storage() {
    if (db.isLocal()) return null;
    return db.supabaseClient()?.storage?.from('certificate-evidence') || null;
}

function tableFor(type) {
    if (type === 'internship') return 'internships';
    if (type === 'certificate') return 'certificates';
    return null;
}

function normalizeStoredStatus(type, status) {
    if (type === 'certificate' && status === 'verified') return 'approved';
    return status || 'pending';
}

function statusForDatabase(type, status) {
    if (type === 'certificate' && status === 'approved') return 'verified';
    return status;
}

async function studentMap() {
    return new Map((await db.select('students')).map(student => [student.id, student]));
}

async function pendingRows({ branch = null } = {}) {
    const [internships, certificates, students] = await Promise.all([
        db.select('internships'), db.select('certificates'), db.select('students')
    ]);
    const byId = new Map(students.map(student => [student.id, student]));
    const build = (type, rows) => rows
        .filter(entry => entry.evidence_path && normalizeStoredStatus(type, entry.verification_status) === 'pending')
        .map(entry => {
            const student = byId.get(entry.student_id);
            return {
                type,
                id: entry.id,
                student_id: entry.student_id,
                student_prn: student?.prn || '',
                student_name: student?.name || '',
                branch: student?.branch || '',
                class: student?.class || '',
                entry_name: type === 'internship' ? `${entry.company}${entry.role ? ` - ${entry.role}` : ''}` : entry.name,
                details: type === 'internship' ? entry.company : entry.issuer,
                evidence_uploaded_at: entry.evidence_uploaded_at || null,
                verification_status: 'pending'
            };
        })
        .filter(row => !branch || row.branch === branch);
    return [...build('internship', internships || []), ...build('certificate', certificates || [])]
        .sort((a, b) => String(a.evidence_uploaded_at || '').localeCompare(String(b.evidence_uploaded_at || '')));
}

async function clearStudentCache() {
    try {
        const adminStudentsRouter = require('./adminStudents');
        await adminStudentsRouter.clearStudentCache?.();
    } catch (_) {}
}

function createRouter(role) {
    const router = express.Router();
    const isObserver = role === 'observer';
    router.use(isObserver ? authenticateObserver : authenticateAdmin);

    router.get('/pending', async (req, res) => {
        try {
            const branch = isObserver ? req.observer.department : (req.query.branch && req.query.branch !== 'all' ? String(req.query.branch).toUpperCase() : null);
            let rows = await pendingRows({ branch });
            if (req.query.type === 'internship' || req.query.type === 'certificate') rows = rows.filter(row => row.type === req.query.type);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            return res.json({ success: true, data: rows, scope: { role, branch: branch || 'all' } });
        } catch (error) {
            console.error('Proof review pending list failed:', error.message);
            return res.status(500).json({ success: false, error: { code: 'PROOF_REVIEW_LIST_FAILED', message: 'Could not load pending proofs.' } });
        }
    });

    router.get('/:type/:id/proof', async (req, res) => {
        const table = tableFor(req.params.type);
        if (!table) return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'Invalid proof type.' } });
        const evidenceStorage = storage();
        if (!evidenceStorage) return res.status(503).json({ success: false, error: { code: 'VAULT_NOT_CONFIGURED', message: 'Proof storage is not configured.' } });
        const entry = await db.selectOne(table, { id: req.params.id });
        if (!entry?.evidence_path) return res.status(404).json({ success: false, error: { code: 'NO_EVIDENCE', message: 'No proof uploaded.' } });
        const students = await studentMap();
        const student = students.get(entry.student_id);
        if (isObserver && student?.branch !== req.observer.department) return res.status(403).json({ success: false, error: { code: 'OUT_OF_SCOPE', message: 'This entry belongs to another department.' } });
        const { data, error } = await evidenceStorage.download(entry.evidence_path);
        if (error || !data) return res.status(404).json({ success: false, error: { code: 'EVIDENCE_MISSING', message: 'Proof file is unavailable.' } });
        const bytes = Buffer.from(await data.arrayBuffer());
        res.setHeader('Content-Type', entry.evidence_mime || data.type || 'image/jpeg');
        res.setHeader('Content-Length', String(bytes.length));
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
        return res.end(bytes);
    });

    router.post('/:type/:id/review', validate(reviewSchema), async (req, res) => {
        try {
            const type = req.params.type;
            const table = tableFor(type);
            if (!table) return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'Invalid proof type.' } });
            const entry = await db.selectOne(table, { id: req.params.id });
            if (!entry) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Entry not found.' } });
            if (!entry.evidence_path && req.body.status === 'approved') return res.status(400).json({ success: false, error: { code: 'PROOF_REQUIRED', message: 'Proof must be attached before approval.' } });

            const students = await studentMap();
            const student = students.get(entry.student_id);
            if (isObserver && student?.branch !== req.observer.department) return res.status(403).json({ success: false, error: { code: 'OUT_OF_SCOPE', message: 'TPC reviewers can only review their own department.' } });

            const oldStatus = normalizeStoredStatus(type, entry.verification_status);
            const now = new Date().toISOString();
            const actorId = isObserver ? req.observer.observerId : req.admin.adminId;
            const actorRole = isObserver ? 'tpc' : 'tpo';
            const storedStatus = statusForDatabase(type, req.body.status);

            const updated = await db.update(table, { id: entry.id }, {
                verification_status: storedStatus,
                verification_note: req.body.note || null,
                verified_at: req.body.status === 'pending' ? null : now,
                verified_by: req.body.status === 'pending' ? null : actorId,
                verified_role: req.body.status === 'pending' ? null : actorRole
            });

            // Never tell the UI "approved" unless the database actually persisted it.
            if (!updated) throw new Error('Proof review update matched no record.');
            const persisted = await db.selectOne(table, { id: entry.id });
            const persistedStatus = normalizeStoredStatus(type, persisted?.verification_status);
            if (!persisted || persistedStatus !== req.body.status) {
                throw new Error(`Proof review persistence check failed: expected ${req.body.status}, got ${persistedStatus}.`);
            }

            await clearStudentCache();
            await db.logAudit('proof_verification_status_change', table, entry.id, {
                entry_type: type,
                student_id: entry.student_id,
                student_prn: student?.prn || null,
                actor_id: actorId,
                actor_role: actorRole,
                old_status: oldStatus,
                new_status: req.body.status,
                note: req.body.note || '',
                changed_at: now
            });

            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            return res.json({ success: true, data: { ...persisted, verification_status: persistedStatus }, message: `${type === 'internship' ? 'Internship' : 'Certificate'} ${req.body.status}.` });
        } catch (error) {
            console.error('Proof review update failed:', error.message);
            return res.status(500).json({ success: false, error: { code: 'PROOF_REVIEW_FAILED', message: 'Could not persist proof verification. Please retry.' } });
        }
    });

    return router;
}

module.exports = { admin: createRouter('admin'), observer: createRouter('observer'), normalizeStoredStatus, statusForDatabase };
