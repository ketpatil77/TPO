const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { verifyDob, formatDateToYYYYMMDD } = require('../utils/dateHelper');
const { authenticateStudent, JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const { validate, studentLoginSchema, issueCsrfToken, clearSessionCookies } = require('../middleware/security');
const { normalizeBranch } = require('../config/branches');

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Student login using PRN as username and DOB (DDMMYY format) as password
 * @access  Public
 */
const studentLoginLimit = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    limit: 10, 
    standardHeaders: 'draft-7', 
    legacyHeaders: false, 
    validate: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' } }
});
const MAX_FAILURES = 6;
const LOCK_MS = 15 * 60 * 1000;

router.post('/login', studentLoginLimit, validate(studentLoginSchema), async (req, res) => {
    try {
        const { prn, dob } = req.body;

        const cleanPrn = prn.trim();
        const cleanDob = dob.trim();
        const loginKey = crypto.createHash('sha256').update(cleanPrn).digest('hex');
        const attempt = await db.selectOne('login_attempts', { identifier_hash: loginKey });
        if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
            return res.status(429).json({ success: false, error: { code: 'LOGIN_LOCKED', message: 'Too many attempts. Try again later.' } });
        }

        // 1. Look up student entry in Roster table
        const rosterEntry = await db.selectOne('roster', { prn: cleanPrn });

        if (!rosterEntry) {
            await recordFailure(loginKey, attempt, req.ip);
            return invalidCredentials(res);
        }

        // 2. Verify Date of Birth against Roster DOB
        const isMatch = verifyDob(cleanDob, rosterEntry.dob);
        if (!isMatch) {
            await recordFailure(loginKey, attempt, req.ip);
            return invalidCredentials(res);
        }

        // 3. Check if student profile already exists in `students` table
        let studentRecord = await db.selectOne('students', { prn: cleanPrn });

        // If first-time login / profile missing, prefill and create from Roster
        if (!studentRecord) {
            studentRecord = await db.insert('students', {
                prn: rosterEntry.prn,
                name: rosterEntry.name,
                email: null,
                phone: null,
                branch: normalizeBranch(rosterEntry.branch) || rosterEntry.branch,
                class: rosterEntry.class,
                year: rosterEntry.year,
                cgpa_overall: 0.0,
                cgpa_semesterwise: {
                    sem1: 0, sem2: 0, sem3: 0, sem4: 0,
                    sem5: 0, sem6: 0, sem7: 0, sem8: 0
                },
                backlogs_semesterwise: { sem1: 0, sem2: 0, sem3: 0, sem4: 0, sem5: 0, sem6: 0, sem7: 0, sem8: 0 },
                activities: '',
                resume_url: null
            });
        }

        // 4. Generate JWT token
        const payload = {
            role: 'student',
            studentId: studentRecord.id,
            prn: studentRecord.prn,
            name: studentRecord.name,
            branch: studentRecord.branch,
            class: studentRecord.class,
            year: studentRecord.year
            ,sessionVersion: SESSION_VERSION
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

        // Set Cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/'
        });
        issueCsrfToken(res);
        if (attempt) await db.delete('login_attempts', { identifier_hash: loginKey });

        return res.json({
            success: true,
            message: 'Login successful!',
            student: studentRecord
        });

    } catch (err) {
        console.error('Error during student login:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to complete authentication.' } });
    }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get currently logged in student session
 * @access  Private
 */
router.get('/me', authenticateStudent, async (req, res) => {
    try {
        const student = await db.selectOne('students', { id: req.student.studentId });
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }
        return res.json({ success: true, student });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to load student session.' } });
    }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout student session
 * @access  Public
 */
router.post('/logout', (req, res) => {
    clearSessionCookies(res);
    return res.json({ success: true, message: 'Logged out successfully.' });
});

async function recordFailure(identifierHash, existing, ip) {
    const failures = (existing?.failures || 0) + 1;
    const data = {
        identifier_hash: identifierHash,
        ip_hash: crypto.createHash('sha256').update(String(ip || '')).digest('hex'),
        failures,
        locked_until: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MS).toISOString() : null,
        updated_at: new Date().toISOString()
    };
    await db.upsert('login_attempts', data, 'identifier_hash');
}

function invalidCredentials(res) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid PRN or date of birth.' } });
}

module.exports = router;
