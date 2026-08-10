const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { normalizeTerms, scoreCandidate } = require('../utils/matching');

const router = express.Router();
router.use(authenticateAdmin);

const driveSchema = z.object({
    company: z.string().trim().min(1).max(150),
    role: z.string().trim().min(1).max(150),
    jd_text: z.string().trim().min(20).max(50000),
    application_deadline: z.string().date().nullable().optional(),
    status: z.enum(['draft', 'open', 'closed']).default('draft')
}).strict();

const criteriaSchema = z.object({
    branches: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    min_cgpa: z.number().min(0).max(10).default(0),
    graduation_year: z.string().trim().max(50).nullable().default(null),
    required_skills: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    preferred_skills: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    keywords: z.array(z.string().trim().min(1).max(60)).max(100).default([])
}).strict();

router.get('/', async (req, res) => {
    const drives = await db.select('placement_drives');
    drives.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json({ success: true, data: drives });
});

router.post('/', validate(driveSchema), async (req, res) => {
    const drive = await db.insert('placement_drives', { ...req.body, created_by: req.admin.adminId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await db.logAudit('drive_create', 'placement_drives', drive.id, { company: drive.company, role: drive.role });
    res.status(201).json({ success: true, data: drive });
});

router.put('/:id', validate(driveSchema), async (req, res) => {
    const existing = await db.selectOne('placement_drives', { id: req.params.id });
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Drive not found.' } });
    const drive = await db.update('placement_drives', { id: req.params.id }, { ...req.body, updated_at: new Date().toISOString() });
    await db.logAudit('drive_update', 'placement_drives', drive.id);
    res.json({ success: true, data: drive });
});

router.post('/:id/criteria', validate(criteriaSchema), async (req, res) => {
    const drive = await db.selectOne('placement_drives', { id: req.params.id });
    if (!drive) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Drive not found.' } });
    const criteria = await db.upsert('drive_criteria', {
        drive_id: drive.id,
        branches: normalizeTerms(req.body.branches),
        min_cgpa: req.body.min_cgpa,
        graduation_year: req.body.graduation_year,
        required_skills: normalizeTerms(req.body.required_skills),
        preferred_skills: normalizeTerms(req.body.preferred_skills),
        keywords: normalizeTerms(req.body.keywords),
        confirmed_by: req.admin.adminId,
        confirmed_at: new Date().toISOString()
    }, 'drive_id');
    await db.logAudit('criteria_confirm', 'drive_criteria', criteria.id, { drive_id: drive.id });
    res.json({ success: true, data: criteria });
});

router.post('/:id/match', async (req, res) => {
    const drive = await db.selectOne('placement_drives', { id: req.params.id });
    const criteria = await db.selectOne('drive_criteria', { drive_id: req.params.id });
    if (!drive || !criteria) return res.status(400).json({ success: false, error: { code: 'CRITERIA_REQUIRED', message: 'Confirm drive criteria first.' } });
    const [students, internships, certificates, skills] = await Promise.all([
        db.select('students'), db.select('internships'), db.select('certificates'), db.select('student_skills')
    ]);
    const runId = crypto.randomUUID();
    const results = [];
    for (const student of students) {
        const candidate = {
            ...student,
            internships: internships.filter(i => i.student_id === student.id),
            certificates: certificates.filter(c => c.student_id === student.id),
            skills: skills.filter(s => s.student_id === student.id)
        };
        const result = scoreCandidate(candidate, criteria);
        results.push(await db.insert('drive_matches', { drive_id: drive.id, student_id: student.id, run_id: runId, ...result, explanation: result, created_at: new Date().toISOString() }));
    }
    results.sort((a, b) => b.score - a.score);
    await db.logAudit('match_run', 'drive_matches', runId, { drive_id: drive.id, candidates: results.length });
    res.json({ success: true, data: { run_id: runId, results } });
});

router.get('/:id/matches', async (req, res) => {
    const matches = await db.select('drive_matches', { drive_id: req.params.id });
    matches.sort((a, b) => b.score - a.score);
    res.json({ success: true, data: matches });
});

router.get('/:id/shortlist', async (req, res) => {
    const rows = await db.select('shortlists', { drive_id: req.params.id });
    res.json({ success: true, data: rows });
});

router.get('/:id/matches/export/csv', async (req, res) => {
    const [matches, students] = await Promise.all([
        db.select('drive_matches', { drive_id: req.params.id }), db.select('students')
    ]);
    const studentMap = new Map(students.map(student => [student.id, student]));
    const safe = value => {
        let text = String(value ?? '');
        if (/^[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [['PRN', 'Name', 'Branch', 'CGPA', 'Eligible', 'Score', 'Matched Skills', 'Reasons']];
    matches.sort((a, b) => b.score - a.score).forEach(match => {
        const student = studentMap.get(match.student_id) || {};
        rows.push([student.prn, student.name, student.branch, student.cgpa_overall, match.eligible, match.score, (match.matched_skills || []).join('; '), (match.reasons || []).join('; ')]);
    });
    await db.logAudit('match_export_csv', 'drive_matches', req.params.id, { rows: matches.length });
    res.type('text/csv').attachment(`drive-${req.params.id}-matches.csv`).send(rows.map(row => row.map(safe).join(',')).join('\n'));
});

const shortlistSchema = z.object({ student_id: z.uuid(), status: z.enum(['shortlisted', 'rejected', 'hold']), notes: z.string().trim().max(1000).default('') }).strict();
router.put('/:id/shortlist', validate(shortlistSchema), async (req, res) => {
    const key = `${req.params.id}:${req.body.student_id}`;
    const row = await db.upsert('shortlists', { key, drive_id: req.params.id, ...req.body, updated_by: req.admin.adminId, updated_at: new Date().toISOString() }, 'key');
    await db.logAudit('shortlist_update', 'shortlists', row.id, { drive_id: req.params.id, student_id: req.body.student_id, status: req.body.status });
    res.json({ success: true, data: row });
});

module.exports = router;
