const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const router = express.Router();
router.use(authenticateStudent);

const COMPETITION_TYPES = [
    'Research Convention / Aavishkar',
    'Hackathon',
    'Ideathon',
    'Innovation / Project Competition',
    'Coding / Programming Contest',
    'Data / AI Challenge',
    'Cybersecurity / CTF',
    'Robotics Competition',
    'Paper Presentation',
    'Technical Quiz',
    'Design / CAD Challenge',
    'Case Study Competition',
    'Business Plan / Startup Pitch',
    'Other Technical / Academic Competition'
];

const COMPETITION_LEVELS = [
    'Department',
    'Institute / College',
    'Inter-College',
    'District',
    'Zonal',
    'University',
    'Inter-University',
    'Regional',
    'State',
    'National',
    'International',
    'Open / Online'
];

const COMPETITION_RESULTS = [
    'Participated',
    'Shortlisted / Selected',
    'Finalist',
    'Rank / Position',
    'Runner-up',
    'Winner',
    'Special Award'
];

const optionalHttpsUrl = z.union([
    z.literal(''),
    z.string().url().max(1000).refine(value => value.startsWith('https://'), 'Use an HTTPS link.'),
    z.null()
]).optional().transform(value => value || null);

const competitionSchema = z.object({
    title: z.string().trim().min(2).max(200),
    organizer: z.string().trim().min(2).max(200),
    competition_type: z.enum(COMPETITION_TYPES),
    level: z.enum(COMPETITION_LEVELS),
    result_status: z.enum(COMPETITION_RESULTS),
    position_text: z.string().trim().max(80).optional().transform(value => value || null),
    participated_on: z.string().date().refine(value => value <= new Date().toISOString().slice(0, 10), 'Competition date cannot be in the future.'),
    team_type: z.enum(['Individual', 'Team']),
    team_size: z.coerce.number().int().min(1).max(25),
    project_title: z.string().trim().max(250).optional().transform(value => value || null),
    source_url: optionalHttpsUrl,
    proof_url: optionalHttpsUrl,
    notes: z.string().trim().max(1500).optional().transform(value => value || null)
}).strict().superRefine((value, ctx) => {
    if (value.team_type === 'Individual' && value.team_size !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['team_size'], message: 'Individual entries must have team size 1.' });
    }
    if (value.result_status === 'Rank / Position' && !value.position_text) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['position_text'], message: 'Enter the achieved rank or position.' });
    }
});

router.get('/catalog', (_req, res) => {
    res.json({
        success: true,
        data: {
            types: COMPETITION_TYPES,
            levels: COMPETITION_LEVELS,
            results: COMPETITION_RESULTS,
            examples: ['Aavishkar', 'Smart India Hackathon', 'Anveshan', 'Hackathon', 'Project Competition', 'Coding Contest', 'Paper Presentation']
        }
    });
});

router.get('/', async (req, res) => {
    try {
        const rows = await db.select('student_competitions', { student_id: req.student.studentId });
        rows.sort((a, b) => String(b.participated_on || '').localeCompare(String(a.participated_on || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Competition list error:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_LIST_FAILED', message: 'Unable to load competition records.' } });
    }
});

router.post('/', validate(competitionSchema), async (req, res) => {
    try {
        const now = new Date().toISOString();
        const competition = await db.insert('student_competitions', {
            student_id: req.student.studentId,
            ...req.body,
            verification_status: 'pending',
            verified_by: null,
            verified_at: null,
            verification_note: null,
            created_at: now,
            updated_at: now
        });
        await db.logAudit('student_competition_create', 'student_competitions', competition.id, { student_id: req.student.studentId, title: competition.title });
        res.status(201).json({ success: true, message: 'Competition added. Verification is pending.', data: competition });
    } catch (error) {
        if (error?.code === '23505') return res.status(409).json({ success: false, error: { code: 'DUPLICATE_COMPETITION', message: 'This competition record already exists.' } });
        console.error('Competition create error:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_CREATE_FAILED', message: 'Unable to save competition.' } });
    }
});

router.put('/:id', validate(competitionSchema), async (req, res) => {
    try {
        const existing = await db.selectOne('student_competitions', { id: req.params.id, student_id: req.student.studentId });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Competition record not found.' } });
        const competition = await db.update('student_competitions', { id: existing.id, student_id: req.student.studentId }, {
            ...req.body,
            verification_status: 'pending',
            verified_by: null,
            verified_at: null,
            verification_note: null,
            updated_at: new Date().toISOString()
        });
        await db.logAudit('student_competition_update', 'student_competitions', existing.id, { student_id: req.student.studentId, title: competition.title });
        res.json({ success: true, message: 'Competition updated. Verification has been reset to pending.', data: competition });
    } catch (error) {
        if (error?.code === '23505') return res.status(409).json({ success: false, error: { code: 'DUPLICATE_COMPETITION', message: 'This competition record already exists.' } });
        console.error('Competition update error:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_UPDATE_FAILED', message: 'Unable to update competition.' } });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existing = await db.selectOne('student_competitions', { id: req.params.id, student_id: req.student.studentId });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Competition record not found.' } });
        await db.delete('student_competitions', { id: existing.id, student_id: req.student.studentId });
        await db.logAudit('student_competition_delete', 'student_competitions', existing.id, { student_id: req.student.studentId, title: existing.title });
        res.json({ success: true, message: 'Competition removed.' });
    } catch (error) {
        console.error('Competition delete error:', error.message);
        res.status(500).json({ success: false, error: { code: 'COMPETITION_DELETE_FAILED', message: 'Unable to delete competition.' } });
    }
});

module.exports = router;
