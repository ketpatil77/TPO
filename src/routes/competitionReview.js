const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin, authenticateObserver } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { createStudentNotification } = require('../services/incompleteProfilePush');

const admin = express.Router();
const observer = express.Router();
admin.use(authenticateAdmin);
observer.use(authenticateObserver);

const decisionSchema = z.object({
    status: z.enum(['verified', 'rejected']),
    note: z.string().trim().max(1000).optional().transform(value => value || null)
}).strict().superRefine((value, ctx) => {
    if (value.status === 'rejected' && (!value.note || value.note.length < 3)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Add a short reason when rejecting a competition.' });
    }
});

function safeStatus(value) {
    return ['pending', 'verified', 'rejected', 'all'].includes(value) ? value : 'pending';
}

async function listCompetitions({ status = 'pending', branch = null }) {
    const [competitions, students] = await Promise.all([
        db.select('student_competitions'),
        db.select('students')
    ]);
    const people = new Map(students.map(student => [student.id, student]));
    const normalizedStatus = safeStatus(status);
    return competitions
        .map(competition => ({ competition, student: people.get(competition.student_id) || null }))
        .filter(item => item.student)
        .filter(item => normalizedStatus === 'all' || item.competition.verification_status === normalizedStatus)
        .filter(item => !branch || branch === 'all' || String(item.student.branch || '').toUpperCase() === String(branch).toUpperCase())
        .sort((a, b) => String(b.competition.updated_at || b.competition.created_at || '').localeCompare(String(a.competition.updated_at || a.competition.created_at || '')))
        .slice(0, 500)
        .map(({ competition, student }) => ({
            ...competition,
            student: {
                id: student.id,
                name: student.name,
                prn: student.prn,
                branch: student.branch,
                class: student.class,
                year: student.year
            }
        }));
}

async function applyDecision({ competitionId, status, note, actorId, actorRole, department = null }) {
    const competition = await db.selectOne('student_competitions', { id: competitionId });
    if (!competition) return { error: { status: 404, code: 'NOT_FOUND', message: 'Competition record not found.' } };
    const student = await db.selectOne('students', { id: competition.student_id });
    if (!student) return { error: { status: 404, code: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' } };
    if (department && String(student.branch || '').toUpperCase() !== String(department).toUpperCase()) {
        return { error: { status: 403, code: 'DEPARTMENT_SCOPE', message: 'TPC can verify competitions only for students in their own department.' } };
    }

    const now = new Date().toISOString();
    const updated = await db.update('student_competitions', { id: competition.id }, {
        verification_status: status,
        verification_note: note,
        verified_by: actorId,
        verified_role: actorRole,
        verified_at: now,
        updated_at: now
    });

    await db.logAudit(`competition_${status}`, 'student_competitions', competition.id, {
        student_id: student.id,
        student_prn: student.prn,
        branch: student.branch,
        verifier_id: actorId,
        verifier_role: actorRole,
        note
    });

    try {
        const title = status === 'verified' ? 'Competition verified' : 'Competition needs correction';
        const message = status === 'verified'
            ? `${competition.title} has been verified by ${actorRole}.`
            : `${competition.title} was not verified. ${note || 'Please review the record and supporting proof.'}`;
        await createStudentNotification({
            student_id: student.id,
            audience: 'student',
            branches: [],
            title,
            message,
            priority: status === 'rejected' ? 'important' : 'normal',
            action_url: '/dashboard?tab=competitions'
        });
    } catch (error) {
        console.error('Competition verification notification failed:', error.message);
    }

    return { updated, student };
}

admin.get('/', async (req, res) => {
    try {
        const data = await listCompetitions({ status: req.query.status, branch: req.query.branch || null });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Admin competition review list failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_REVIEW_LIST_FAILED', message: 'Unable to load competition verification queue.' } });
    }
});

admin.put('/:id/verification', validate(decisionSchema), async (req, res) => {
    try {
        const result = await applyDecision({
            competitionId: req.params.id,
            status: req.body.status,
            note: req.body.note,
            actorId: req.admin.adminId,
            actorRole: 'TPO'
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        res.json({ success: true, message: `Competition ${req.body.status}.`, data: result.updated });
    } catch (error) {
        console.error('Admin competition verification failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_VERIFY_FAILED', message: 'Unable to update verification status.' } });
    }
});

observer.get('/', async (req, res) => {
    try {
        const data = await listCompetitions({ status: req.query.status, branch: req.observer.department });
        res.json({ success: true, data, scope: req.observer.department });
    } catch (error) {
        console.error('TPC competition review list failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_REVIEW_LIST_FAILED', message: 'Unable to load department competition verification queue.' } });
    }
});

observer.put('/:id/verification', validate(decisionSchema), async (req, res) => {
    try {
        const result = await applyDecision({
            competitionId: req.params.id,
            status: req.body.status,
            note: req.body.note,
            actorId: req.observer.observerId,
            actorRole: 'TPC',
            department: req.observer.department
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        res.json({ success: true, message: `Competition ${req.body.status}.`, data: result.updated });
    } catch (error) {
        console.error('TPC competition verification failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_VERIFY_FAILED', message: 'Unable to update verification status.' } });
    }
});

module.exports = { admin, observer };
