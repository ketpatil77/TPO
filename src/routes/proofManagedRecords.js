const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { notifyMissingProof } = require('../services/proofExpiry');

const router = express.Router();
router.use(authenticateStudent);

const internshipSchema = z.object({
    company: z.string().trim().min(1).max(150),
    role: z.string().trim().min(1).max(150),
    start_date: z.string().date(),
    end_date: z.string().date().nullable().optional(),
    mode: z.enum(['online', 'offline']).default('offline')
}).refine(value => !value.end_date || value.end_date >= value.start_date, { message: 'End date cannot be before start date.' });

const certificateSchema = z.object({
    name: z.string().trim().min(1).max(150),
    issuer: z.string().trim().min(1).max(150),
    date: z.string().date().refine(value => value <= new Date().toISOString().slice(0, 10), 'Certificate date cannot be in future.'),
    mode: z.enum(['online', 'offline']).default('online')
});

function proofPlanned(req) {
    return req.get('x-proof-attached') === '1';
}

async function maybeNotify(req, table, entry) {
    if (!entry?.evidence_path && !proofPlanned(req)) {
        await notifyMissingProof({ table, entry, studentId: req.student.studentId }).catch(error => {
            console.error('Missing-proof notification failed:', error.message);
        });
    }
}

router.post('/internships', validate(internshipSchema), async (req, res) => {
    try {
        const entry = await db.insert('internships', {
            student_id: req.student.studentId,
            company: req.body.company,
            role: req.body.role,
            start_date: req.body.start_date,
            end_date: req.body.end_date || null,
            mode: req.body.mode || 'offline',
            verification_status: 'pending'
        });
        await maybeNotify(req, 'internships', entry);
        return res.json({ success: true, message: 'Internship record added successfully!', internship: entry });
    } catch (error) {
        console.error('Managed internship create failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to save internship.' } });
    }
});

router.put('/internships/:id', validate(internshipSchema), async (req, res) => {
    try {
        const existing = await db.selectOne('internships', { id: req.params.id, student_id: req.student.studentId });
        if (!existing) return res.status(404).json({ success: false, error: 'Internship record not found.' });
        const entry = await db.update('internships', { id: existing.id, student_id: req.student.studentId }, {
            company: req.body.company,
            role: req.body.role,
            start_date: req.body.start_date,
            end_date: req.body.end_date || null,
            mode: req.body.mode || 'offline',
            verification_status: 'pending',
            verification_note: null,
            verified_at: null,
            verified_by: null,
            verified_role: null
        });
        await maybeNotify(req, 'internships', entry);
        return res.json({ success: true, message: 'Internship updated successfully!', internship: entry });
    } catch (error) {
        console.error('Managed internship update failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to update internship.' } });
    }
});

router.post('/certificates', validate(certificateSchema), async (req, res) => {
    try {
        const entry = await db.insert('certificates', {
            student_id: req.student.studentId,
            name: req.body.name,
            issuer: req.body.issuer,
            date: req.body.date,
            mode: req.body.mode || 'online',
            verification_status: 'pending'
        });
        await maybeNotify(req, 'certificates', entry);
        return res.json({ success: true, message: 'Certificate added successfully!', certificate: entry });
    } catch (error) {
        console.error('Managed certificate create failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to save certificate.' } });
    }
});

router.put('/certificates/:id', validate(certificateSchema), async (req, res) => {
    try {
        const existing = await db.selectOne('certificates', { id: req.params.id, student_id: req.student.studentId });
        if (!existing) return res.status(404).json({ success: false, error: 'Certificate record not found.' });
        const entry = await db.update('certificates', { id: existing.id, student_id: req.student.studentId }, {
            name: req.body.name,
            issuer: req.body.issuer,
            date: req.body.date,
            mode: req.body.mode || 'online',
            verification_status: 'pending',
            verification_note: null,
            verified_at: null,
            verified_by: null,
            verified_role: null
        });
        await maybeNotify(req, 'certificates', entry);
        return res.json({ success: true, message: 'Certificate updated successfully!', certificate: entry });
    } catch (error) {
        console.error('Managed certificate update failed:', error.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to update certificate.' } });
    }
});

router.post('/proof-missing-notice/:type/:id', async (req, res) => {
    const table = req.params.type === 'internship' ? 'internships' : req.params.type === 'certificate' ? 'certificates' : null;
    if (!table) return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'Invalid proof entry type.' } });
    const entry = await db.selectOne(table, { id: req.params.id, student_id: req.student.studentId });
    if (!entry) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Entry not found.' } });
    if (entry.evidence_path) return res.json({ success: true, notified: false, reason: 'proof_present' });
    await notifyMissingProof({ table, entry, studentId: req.student.studentId });
    return res.json({ success: true, notified: true, deadline: entry.proof_deadline || null });
});

module.exports = router;
