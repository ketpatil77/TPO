const express = require('express');
const multer = require('multer');
const { createHash } = require('node:crypto');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateStudent);

const MAX_CERTIFICATE_BYTES = 400 * 1024;
const STUDENT_CERTIFICATE_QUOTA_BYTES = 15 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CERTIFICATE_BYTES, files: 1 } });

function bucket() {
    return globalThis.cloudflareEnv?.CERTIFICATE_VAULT || null;
}

function detectImageMime(buffer) {
    if (!buffer || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) return 'image/png';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

function extensionForMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg') return 'jpg';
    return 'webp';
}

function acceptEvidence(req, res, next) {
    upload.single('certificate')(req, res, error => {
        if (error?.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, error: { code: 'CERTIFICATE_TOO_LARGE', message: 'Optimized certificate image must be 400 KB or smaller.' } });
        }
        if (error) return next(error);
        next();
    });
}

function clearStudentCache() {
    try {
        const adminStudentsRouter = require('./adminStudents');
        adminStudentsRouter.clearStudentCache?.();
    } catch (_) {
        // Non-critical cache invalidation.
    }
}

async function ownedCertificate(studentId, certificateId) {
    return db.selectOne('certificates', { id: certificateId, student_id: studentId });
}

async function studentUsage(studentId, excludeCertificateId = null) {
    const rows = await db.select('certificates', { student_id: studentId });
    return (rows || []).reduce((sum, item) => {
        if (excludeCertificateId && item.id === excludeCertificateId) return sum;
        return sum + Number(item.evidence_size_bytes || 0);
    }, 0);
}

router.get('/certificate-evidence/status', async (req, res) => {
    try {
        const rows = await db.select('certificates', { student_id: req.student.studentId });
        const used = (rows || []).reduce((sum, item) => sum + Number(item.evidence_size_bytes || 0), 0);
        res.json({
            success: true,
            data: {
                configured: Boolean(bucket()),
                max_file_bytes: MAX_CERTIFICATE_BYTES,
                quota_bytes: STUDENT_CERTIFICATE_QUOTA_BYTES,
                used_bytes: used,
                remaining_bytes: Math.max(0, STUDENT_CERTIFICATE_QUOTA_BYTES - used)
            }
        });
    } catch (error) {
        console.error('Certificate vault status failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'VAULT_STATUS_FAILED', message: 'Could not load certificate storage status.' } });
    }
});

router.post('/certificates/:id/evidence', acceptEvidence, async (req, res) => {
    const evidenceBucket = bucket();
    if (!evidenceBucket) return res.status(503).json({ success: false, error: { code: 'VAULT_NOT_CONFIGURED', message: 'Certificate Vault R2 storage is not configured yet.' } });

    try {
        const studentId = req.student.studentId;
        const certificate = await ownedCertificate(studentId, req.params.id);
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: { code: 'IMAGE_REQUIRED', message: 'Choose a JPG, JPEG or PNG certificate image.' } });

        const mime = detectImageMime(req.file.buffer);
        if (!mime) return res.status(400).json({ success: false, error: { code: 'INVALID_IMAGE', message: 'Only valid JPG, JPEG or PNG source images are supported. PDFs are not accepted.' } });

        const usedWithoutCurrent = await studentUsage(studentId, certificate.id);
        if (usedWithoutCurrent + req.file.size > STUDENT_CERTIFICATE_QUOTA_BYTES) {
            return res.status(413).json({ success: false, error: { code: 'CERTIFICATE_STORAGE_QUOTA', message: 'Your 15 MB certificate proof quota is full. Remove or replace older proof files.' } });
        }

        const sha256 = createHash('sha256').update(req.file.buffer).digest('hex');
        if (certificate.evidence_sha256 === sha256 && certificate.evidence_path) {
            return res.json({ success: true, message: 'This proof is already uploaded.', data: { certificate } });
        }

        const duplicateRows = await db.select('certificates', { student_id: studentId });
        const duplicate = (duplicateRows || []).find(item => item.id !== certificate.id && item.evidence_sha256 === sha256);
        if (duplicate) {
            return res.status(409).json({ success: false, error: { code: 'DUPLICATE_CERTIFICATE_PROOF', message: 'The same certificate image is already attached to another certificate record.' } });
        }

        const objectPath = `certificates/${studentId}/${certificate.id}.${extensionForMime(mime)}`;
        await evidenceBucket.put(objectPath, req.file.buffer, {
            httpMetadata: { contentType: mime, cacheControl: 'private, no-store, max-age=0' },
            customMetadata: { studentId: String(studentId), certificateId: String(certificate.id), sha256 }
        });

        let updated;
        try {
            updated = await db.update('certificates', { id: certificate.id, student_id: studentId }, {
                evidence_path: objectPath,
                evidence_mime_type: mime,
                evidence_size_bytes: req.file.size,
                evidence_sha256: sha256,
                evidence_uploaded_at: new Date().toISOString()
            });
        } catch (error) {
            await evidenceBucket.delete(objectPath).catch(() => {});
            throw error;
        }

        if (certificate.evidence_path && certificate.evidence_path !== objectPath) {
            await evidenceBucket.delete(certificate.evidence_path).catch(error => console.warn('Old certificate proof cleanup failed:', error.message));
        }
        clearStudentCache();
        return res.json({ success: true, message: certificate.evidence_path ? 'Certificate proof replaced.' : 'Certificate proof uploaded.', data: { certificate: updated } });
    } catch (error) {
        console.error('Certificate evidence upload failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'VAULT_UPLOAD_FAILED', message: 'Could not upload certificate proof.' } });
    }
});

router.get('/certificates/:id/evidence', async (req, res) => {
    const evidenceBucket = bucket();
    if (!evidenceBucket) return res.status(503).json({ success: false, error: { code: 'VAULT_NOT_CONFIGURED', message: 'Certificate Vault R2 storage is not configured yet.' } });

    try {
        const certificate = await ownedCertificate(req.student.studentId, req.params.id);
        if (!certificate?.evidence_path) return res.status(404).json({ success: false, error: { code: 'NO_EVIDENCE', message: 'Certificate proof has not been uploaded.' } });
        const object = await evidenceBucket.get(certificate.evidence_path);
        if (!object) return res.status(404).json({ success: false, error: { code: 'EVIDENCE_MISSING', message: 'Certificate proof file is unavailable.' } });

        const bytes = await object.arrayBuffer();
        res.setHeader('Content-Type', certificate.evidence_mime_type || object.httpMetadata?.contentType || 'image/jpeg');
        res.setHeader('Content-Length', String(bytes.byteLength));
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
        return res.end(Buffer.from(bytes));
    } catch (error) {
        console.error('Certificate evidence view failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'VAULT_VIEW_FAILED', message: 'Could not open certificate proof.' } });
    }
});

router.delete('/certificates/:id/evidence', async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const certificate = await ownedCertificate(studentId, req.params.id);
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        const oldPath = certificate.evidence_path;
        await db.update('certificates', { id: certificate.id, student_id: studentId }, {
            evidence_path: null,
            evidence_mime_type: null,
            evidence_size_bytes: null,
            evidence_sha256: null,
            evidence_uploaded_at: null
        });
        if (oldPath) await bucket()?.delete(oldPath).catch(error => console.warn('Certificate proof orphan cleanup failed:', error.message));
        clearStudentCache();
        return res.json({ success: true, message: oldPath ? 'Certificate proof removed.' : 'No certificate proof was stored.' });
    } catch (error) {
        console.error('Certificate proof removal failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'VAULT_DELETE_FAILED', message: 'Could not remove certificate proof.' } });
    }
});

// Shadow the legacy certificate DELETE route so R2 proof is cleaned with the record.
router.delete('/certificates/:id', async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const certificate = await ownedCertificate(studentId, req.params.id);
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        await db.delete('certificates', { id: certificate.id, student_id: studentId });
        if (certificate.evidence_path) await bucket()?.delete(certificate.evidence_path).catch(error => console.warn('Deleted certificate left an R2 orphan:', error.message));
        clearStudentCache();
        return res.json({ success: true, message: 'Certificate deleted successfully.' });
    } catch (error) {
        console.error('Certificate delete with proof cleanup failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'CERTIFICATE_DELETE_FAILED', message: 'Could not delete certificate.' } });
    }
});

module.exports = router;
