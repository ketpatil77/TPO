const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const router = express.Router();
router.use(authenticateStudent);

function isHttpsUrl(value) {
    if (!value) return true;
    try {
        return new URL(value).protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function isGithubProfile(value) {
    if (!value) return true;
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        const parts = url.pathname.split('/').filter(Boolean);
        return url.protocol === 'https:' && (host === 'github.com' || host === 'www.github.com') && parts.length >= 1;
    } catch (_) {
        return false;
    }
}

const profileLinksSchema = z.object({
    github_url: z.string().trim().max(500).refine(isGithubProfile, 'Enter a valid GitHub profile URL using https://github.com/...').optional(),
    portfolio_url: z.string().trim().max(500).refine(isHttpsUrl, 'Portfolio URL must be a valid HTTPS link.').optional()
}).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one professional link field.');

router.get('/', async (req, res) => {
    try {
        const student = await db.selectOne('students', { id: req.student.studentId });
        if (!student) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student record not found.' } });
        return res.json({
            success: true,
            data: {
                github_url: student.github_url || '',
                portfolio_url: student.portfolio_url || ''
            }
        });
    } catch (error) {
        console.error('Profile links read error:', error.message);
        return res.status(500).json({ success: false, error: { code: 'PROFILE_LINKS_READ_FAILED', message: 'Unable to load professional links.' } });
    }
});

router.put('/', validate(profileLinksSchema), async (req, res) => {
    try {
        const update = { updated_at: new Date().toISOString() };
        if (req.body.github_url !== undefined) update.github_url = req.body.github_url || null;
        if (req.body.portfolio_url !== undefined) update.portfolio_url = req.body.portfolio_url || null;
        const student = await db.update('students', { id: req.student.studentId }, update);
        await db.logAudit('student_profile_links_update', 'students', req.student.studentId, {
            student_id: req.student.studentId,
            github_url: Boolean(student.github_url),
            portfolio_url: Boolean(student.portfolio_url)
        });
        return res.json({
            success: true,
            data: {
                github_url: student.github_url || '',
                portfolio_url: student.portfolio_url || ''
            }
        });
    } catch (error) {
        console.error('Profile links update error:', error.message);
        return res.status(500).json({ success: false, error: { code: 'PROFILE_LINKS_UPDATE_FAILED', message: 'Unable to save professional links.' } });
    }
});

module.exports = router;
