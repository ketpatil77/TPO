const express = require('express');
const multer = require('multer');
const { createHash } = require('node:crypto');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { notifyMissingProof } = require('../services/proofExpiry');

const router = express.Router();
router.use(authenticateStudent);

const STORAGE_BUCKET = 'certificate-evidence';
const MAX_EVIDENCE_BYTES = 400 * 1024;
const STUDENT_EVIDENCE_QUOTA_BYTES = 15 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 } });

function storage() {
    if (db.isLocal()) return null;
    return db.supabaseClient()?.storage?.from(STORAGE_BUCKET) || null;
}

function detectImageMime(buffer) {
    if (!buffer || buffer.length < 8) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'image/png';
    return null;
}

function extensionForMime(mime) {
    return mime === 'image/png' ? 'png' : 'jpg';
}

function acceptEvidence(req, res, next) {
    upload.single('evidence')(req, res, error => {
        if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: { code: 'INTERNSHIP_PROOF_TOO_LARGE', message: 'Optimized internship proof image must be 400 KB or smaller.' } });
        if (error) return next(error);
        return next();
    });
}

async function ownedInternship(studentId, id) {
    return db.selectOne('internships', { id, student_id: studentId });
}

async function studentUsage(studentId, excludeInternshipId = null) {
    const [internships, certificates] = await Promise.all([
        db.select('internships', { student_id: studentId }),
        db.select('certificates', { student_id: studentId })
    ]);
    const internshipBytes = (internships || []).reduce((sum, item) => sum + (item.id === excludeInternshipId ? 0 : Number(item.evidence_bytes || 0)), 0);
    const certificateBytes = (certificates || []).reduce((sum, item) => sum + Number(item.evidence_bytes || 0), 0);
    return internshipBytes + certificateBytes;
}

async function removeObject(path) {
    if (!path) return;
    const evidenceStorage = storage();
    if (!evidenceStorage) return;
    const { error } = await evidenceStorage.remove([path]);
    if (error) throw error;
}

router.get('/internship-evidence/status', async (req, res) => {
    const used = await studentUsage(req.student.studentId);
    const ready = Boolean(storage());
    return res.json({ success: true, data: {
        configured: ready,
        storage_ready: ready,
        storage_provider: ready ? 'supabase' : 'unavailable',
        max_file_bytes: MAX_EVIDENCE_BYTES,
        quota_bytes: STUDENT_EVIDENCE_QUOTA_BYTES,
        used_bytes: used,
        remaining_bytes: Math.max(0, STUDENT_EVIDENCE_QUOTA_BYTES - used)
    }});
});

router.post('/internship-evidence/:id', acceptEvidence, async (req, res) => {
    const evidenceStorage = storage();
    if (!evidenceStorage) return res.status(503).json({ success: false, error: { code: 'VAULT_NOT_CONFIGURED', message: 'Internship proof storage is not configured yet.' } });
    try {
        const studentId = req.student.studentId;
        const internship = await ownedInternship(studentId, req.params.id);
        if (!internship) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Internship not found.' } });
        if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: { code: 'IMAGE_REQUIRED', message: 'Choose a JPG, JPEG or PNG proof image.' } });
        const mime = detectImageMime(req.file.buffer);
        if (!mime) return res.status(400).json({ success: false, error: { code: 'INVALID_IMAGE', message: 'Only real JPG, JPEG or PNG images are accepted. PDF files are not supported.' } });
        const usedWithoutCurrent = await studentUsage(studentId, internship.id);
        if (usedWithoutCurrent + req.file.size > STUDENT_EVIDENCE_QUOTA_BYTES) return res.status(413).json({ success: false, error: { code: 'EVIDENCE_STORAGE_QUOTA', message: 'Your 15 MB proof quota is full. Remove or replace older proof files.' } });

        const sha256 = createHash('sha256').update(req.file.buffer).digest('hex');
        if (internship.evidence_sha256 === sha256 && internship.evidence_path) return res.json({ success: true, message: 'This proof is already uploaded.', data: { internship } });
        const rows = await db.select('internships', { student_id: studentId });
        const duplicate = (rows || []).find(item => item.id !== internship.id && item.evidence_sha256 === sha256);
        if (duplicate) return res.status(409).json({ success: false, error: { code: 'DUPLICATE_INTERNSHIP_PROOF', message: 'The same proof image is already attached to another internship record.' } });

        const objectPath = `internships/${studentId}/${internship.id}.${extensionForMime(mime)}`;
        const { error: uploadError } = await evidenceStorage.upload(objectPath, req.file.buffer, { contentType: mime, cacheControl: '0', upsert: true });
        if (uploadError) throw uploadError;

        let updated;
        try {
            updated = await db.update('internships', { id: internship.id, student_id: studentId }, {
                evidence_path: objectPath,
                evidence_mime: mime,
                evidence_bytes: req.file.size,
                evidence_sha256: sha256,
                evidence_uploaded_at: new Date().toISOString(),
                proof_missing_since: null,
                proof_deadline: null,
                verification_status: 'pending',
                verification_note: null,
                verified_at: null,
                verified_by: null,
                verified_role: null
            });
        } catch (error) {
            await removeObject(objectPath).catch(() => {});
            throw error;
        }
        if (internship.evidence_path && internship.evidence_path !== objectPath) await removeObject(internship.evidence_path).catch(() => {});
        return res.json({ success: true, message: internship.evidence_path ? 'Internship proof replaced.' : 'Internship proof uploaded.', data: { internship: updated } });
    } catch (error) {
        console.error('Internship evidence upload failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNSHIP_PROOF_UPLOAD_FAILED', message: 'Could not upload internship proof.' } });
    }
});

router.get('/internship-evidence/:id', async (req, res) => {
    const evidenceStorage = storage();
    if (!evidenceStorage) return res.status(503).json({ success: false, error: { code: 'VAULT_NOT_CONFIGURED', message: 'Internship proof storage is not configured yet.' } });
    const internship = await ownedInternship(req.student.studentId, req.params.id);
    if (!internship?.evidence_path) return res.status(404).json({ success: false, error: { code: 'NO_EVIDENCE', message: 'Internship proof has not been uploaded.' } });
    const { data, error } = await evidenceStorage.download(internship.evidence_path);
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'EVIDENCE_MISSING', message: 'Internship proof file is unavailable.' } });
    const bytes = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', internship.evidence_mime || data.type || 'image/jpeg');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    return res.end(bytes);
});

router.delete('/internship-evidence/:id', async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const internship = await ownedInternship(studentId, req.params.id);
        if (!internship) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Internship not found.' } });
        const oldPath = internship.evidence_path;
        const updated = await db.update('internships', { id: internship.id, student_id: studentId }, {
            evidence_path: null,
            evidence_mime: null,
            evidence_bytes: null,
            evidence_sha256: null,
            evidence_uploaded_at: null,
            verification_status: 'pending',
            verification_note: null,
            verified_at: null,
            verified_by: null,
            verified_role: null
        });
        if (oldPath) await removeObject(oldPath).catch(() => {});
        await notifyMissingProof({ table: 'internships', entry: updated, studentId }).catch(() => {});
        return res.json({ success: true, message: oldPath ? 'Internship proof removed.' : 'No internship proof was stored.', data: { internship: updated } });
    } catch (error) {
        console.error('Internship proof removal failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNSHIP_PROOF_DELETE_FAILED', message: 'Could not remove internship proof.' } });
    }
});

router.delete('/internships/:id', async (req, res) => {
    try {
        const internship = await ownedInternship(req.student.studentId, req.params.id);
        if (!internship) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Internship not found.' } });
        await db.delete('internships', { id: internship.id, student_id: req.student.studentId });
        if (internship.evidence_path) await removeObject(internship.evidence_path).catch(() => {});
        return res.json({ success: true, message: 'Internship deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, error: { code: 'INTERNSHIP_DELETE_FAILED', message: 'Could not delete internship.' } });
    }
});

module.exports = router;
