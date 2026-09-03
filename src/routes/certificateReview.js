const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const router = express.Router();
router.use(authenticateAdmin);

function bucket() {
    return globalThis.cloudflareEnv?.CERTIFICATE_VAULT || null;
}

const reviewSchema = z.object({
    status: z.enum(['pending', 'verified', 'rejected']),
    note: z.string().trim().max(500).optional().default('')
}).strict();

router.get('/student/:studentId', async (req, res) => {
    try {
        const rows = await db.select('certificates', { student_id: req.params.studentId });
        return res.json({ success: true, data: (rows || []).map(item => ({
            id: item.id,
            student_id: item.student_id,
            name: item.name,
            issuer: item.issuer,
            date: item.date,
            mode: item.mode,
            has_proof: Boolean(item.evidence_path),
            evidence_bytes: item.evidence_bytes || null,
            evidence_uploaded_at: item.evidence_uploaded_at || null,
            verification_status: item.verification_status || 'pending',
            verification_note: item.verification_note || '',
            verified_at: item.verified_at || null
        })) });
    } catch (error) {
        console.error('Certificate review list failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'CERTIFICATE_REVIEW_LIST_FAILED', message: 'Could not load certificate proofs.' } });
    }
});

router.get('/:id/proof', async (req, res) => {
    const evidenceBucket = bucket();
    if (!evidenceBucket) return res.status(503).json({ success: false, error: { code: 'VAULT_NOT_CONFIGURED', message: 'Certificate Vault storage is not configured.' } });
    try {
        const certificate = await db.selectOne('certificates', { id: req.params.id });
        if (!certificate?.evidence_path) return res.status(404).json({ success: false, error: { code: 'NO_EVIDENCE', message: 'No certificate proof uploaded.' } });
        const object = await evidenceBucket.get(certificate.evidence_path);
        if (!object) return res.status(404).json({ success: false, error: { code: 'EVIDENCE_MISSING', message: 'Certificate proof file is unavailable.' } });
        const bytes = await object.arrayBuffer();
        res.setHeader('Content-Type', certificate.evidence_mime || object.httpMetadata?.contentType || 'image/jpeg');
        res.setHeader('Content-Length', String(bytes.byteLength));
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
        return res.end(Buffer.from(bytes));
    } catch (error) {
        console.error('Certificate proof review open failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'CERTIFICATE_PROOF_OPEN_FAILED', message: 'Could not open certificate proof.' } });
    }
});

router.post('/:id/review', validate(reviewSchema), async (req, res) => {
    try {
        const certificate = await db.selectOne('certificates', { id: req.params.id });
        if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
        if (!certificate.evidence_path && req.body.status === 'verified') {
            return res.status(400).json({ success: false, error: { code: 'PROOF_REQUIRED', message: 'A certificate cannot be verified until proof is uploaded.' } });
        }
        const now = new Date().toISOString();
        const updated = await db.update('certificates', { id: certificate.id }, {
            verification_status: req.body.status,
            verification_note: req.body.note || null,
            verified_at: req.body.status === 'pending' ? null : now,
            verified_by: req.body.status === 'pending' ? null : req.admin.adminId
        });
        try {
            const adminStudentsRouter = require('./adminStudents');
            await adminStudentsRouter.clearStudentCache?.();
        } catch (_) {}
        await db.logAudit('certificate_review', 'certificates', certificate.id, {
            student_id: certificate.student_id,
            status: req.body.status,
            note: req.body.note || '',
            admin_id: req.admin.adminId
        });
        return res.json({ success: true, data: updated, message: `Certificate ${req.body.status}.` });
    } catch (error) {
        console.error('Certificate review update failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'CERTIFICATE_REVIEW_FAILED', message: 'Could not update certificate verification.' } });
    }
});

module.exports = router;
