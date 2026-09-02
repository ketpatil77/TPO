const express = require('express');
const multer = require('multer');
const db = require('../config/database');
const { authenticateStudent, authenticateAdmin } = require('../middleware/auth');
const {
    MAX_CERTIFICATE_BYTES,
    isVaultConfigured,
    detectImageMime,
    putCertificateEvidence,
    getCertificateEvidence,
    deleteCertificateEvidence
} = require('../utils/certificateVault');

const studentRouter = express.Router();
const adminRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CERTIFICATE_BYTES, files: 1 } });

function acceptEvidence(req, res, next) {
    upload.single('certificate')(req, res, error => {
        if (error?.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, error: { code: 'CERTIFICATE_TOO_LARGE', message: 'Optimized certificate image must be 400 KB or smaller.' } });
        }
        if (error) return next(error);
        return next();
    });
}

function certificateOwner(studentId, certificateId) {
    return db.selectOne('certificates', { id: certificateId, student_id: studentId });
}

async function sendEvidence(res, certificate) {
    if (!certificate?.evidence_path) {
        return res.status(404).json({ success: false, error: { code: 'NO_EVIDENCE', message: 'Certificate proof has not been uploaded.' } });
    }
    if (!isVaultConfigured()) {
        return res.status(503).json({ success: false, error: { code: 'VAULT_NOT_CONFIGURED', message: 'Certificate Vault is not configured yet.' } });
    }

    const object = await getCertificateEvidence(certificate.evidence_path);
    if (!object) {
        return res.status(404).json({ success: false, error: { code: 'EVIDENCE_MISSING', message: 'Certificate proof is unavailable.' } });
    }

    const bytes = await object.arrayBuffer();
    const contentType = certificate.evidence_mime_type || object.httpMetadata?.contentType || 'image/webp';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(bytes.byteLength));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${certificate.id}.${contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp'}"`);
    return res.end(Buffer.from(bytes));
}

studentRouter.use(authenticateStudent);

studentRouter.get('/status', (req, res) => {
    res.json({
        success: true,
        data: {
            configured: isVaultConfigured(),
            max_bytes: MAX_CERTIFICATE_BYTES,
            accepted_input_types: ['image/jpeg', 'image/png'],
            storage: 'private-r2'
        }
    });
});

studentRouter.post('/:id/evidence', acceptEvidence, async (req, res) => {
    try {
        const certificate = await certificateOwner(req.student.studentId, req.params.id);
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: { code: 'IMAGE_REQUIRED', message: 'Choose a JPG, JPEG or PNG certificate image.' } });

        const mime = detectImageMime(req.file.buffer);
        if (!mime) return res.status(400).json({ success: false, error: { code: 'INVALID_IMAGE', message: 'Certificate proof must be a valid image file.' } });

        const saved = await putCertificateEvidence({
            studentId: req.student.studentId,
            certificateId: certificate.id,
            buffer: req.file.buffer,
            mime,
            previousPath: certificate.evidence_path || null
        });

        const updated = await db.update('certificates', { id: certificate.id, student_id: req.student.studentId }, {
            evidence_path: saved.path,
            evidence_mime_type: saved.mime,
            evidence_size_bytes: saved.size,
            evidence_sha256: saved.sha256,
            evidence_uploaded_at: new Date().toISOString()
        });

        return res.json({ success: true, message: 'Certificate proof uploaded.', data: { certificate: updated } });
    } catch (error) {
        console.error('Certificate evidence upload failed:', error.message);
        const status = error.code === 'VAULT_NOT_CONFIGURED' ? 503 : error.code === 'CERTIFICATE_TOO_LARGE' ? 413 : 500;
        return res.status(status).json({ success: false, error: { code: error.code || 'VAULT_UPLOAD_FAILED', message: error.message || 'Could not upload certificate proof.' } });
    }
});

studentRouter.get('/:id/evidence', async (req, res) => {
    try {
        const certificate = await certificateOwner(req.student.studentId, req.params.id);
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        return sendEvidence(res, certificate);
    } catch (error) {
        console.error('Certificate evidence view failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'VAULT_VIEW_FAILED', message: 'Could not open certificate proof.' } });
    }
});

studentRouter.delete('/:id/evidence', async (req, res) => {
    try {
        const certificate = await certificateOwner(req.student.studentId, req.params.id);
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        if (certificate.evidence_path) await deleteCertificateEvidence(certificate.evidence_path);
        await db.update('certificates', { id: certificate.id, student_id: req.student.studentId }, {
            evidence_path: null,
            evidence_mime_type: null,
            evidence_size_bytes: null,
            evidence_sha256: null,
            evidence_uploaded_at: null
        });
        return res.json({ success: true, message: 'Certificate proof removed.' });
    } catch (error) {
        console.error('Certificate evidence delete failed:', error.message);
        const status = error.code === 'VAULT_NOT_CONFIGURED' ? 503 : 500;
        return res.status(status).json({ success: false, error: { code: error.code || 'VAULT_DELETE_FAILED', message: error.message || 'Could not remove certificate proof.' } });
    }
});

// This shadows the legacy student DELETE route so R2 cleanup happens before metadata deletion.
studentRouter.delete('/:id', async (req, res) => {
    try {
        const certificate = await certificateOwner(req.student.studentId, req.params.id);
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        if (certificate.evidence_path) await deleteCertificateEvidence(certificate.evidence_path);
        await db.delete('certificates', { id: certificate.id, student_id: req.student.studentId });
        return res.json({ success: true, message: 'Certificate deleted successfully.' });
    } catch (error) {
        console.error('Certificate delete with vault cleanup failed:', error.message);
        const status = error.code === 'VAULT_NOT_CONFIGURED' ? 503 : 500;
        return res.status(status).json({ success: false, error: { code: error.code || 'CERTIFICATE_DELETE_FAILED', message: error.message || 'Could not delete certificate.' } });
    }
});

adminRouter.use(authenticateAdmin);
adminRouter.get('/:id/evidence', async (req, res) => {
    try {
        const certificate = await db.selectOne('certificates', { id: req.params.id });
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        return sendEvidence(res, certificate);
    } catch (error) {
        console.error('Admin certificate evidence view failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'VAULT_VIEW_FAILED', message: 'Could not open certificate proof.' } });
    }
});

module.exports = { studentRouter, adminRouter };
