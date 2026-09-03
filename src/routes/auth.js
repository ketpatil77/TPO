const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { verifyDob, formatDateToYYYYMMDD } = require('../utils/dateHelper');
const { authenticateStudent, JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const { validate, verifyTurnstile, studentLoginSchema, issueCsrfToken, clearSessionCookies } = require('../middleware/security');
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
    keyGenerator: req => crypto.createHash('sha256')
        .update(String(req.body?.prn || req.ip || '').trim())
        .digest('hex'),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' } }
});
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

router.post('/login', studentLoginLimit, verifyTurnstile, validate(studentLoginSchema), async (req, res) => {
    try {
        const { prn, dob } = req.body;

        const cleanPrn = prn.trim();
        const cleanDob = dob.trim();
        const loginKey = crypto.createHash('sha256').update(cleanPrn).digest('hex');
        const attempt = await db.selectOne('login_attempts', { identifier_hash: loginKey });
        if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
            const minutesLeft = Math.ceil((new Date(attempt.locked_until) - new Date()) / 60000);
            return res.status(429).json({ success: false, error: { code: 'LOGIN_LOCKED', message: `Login temporarily locked. Try again in ${minutesLeft} minute(s).` } });
        }

        // 1. Look up student entry in Roster table (bypass cache for critical auth checks)
        let rosterEntry;
        if (!db.isLocal()) {
            const { data, error } = await db.supabaseClient().from('roster').select('*').eq('prn', cleanPrn).maybeSingle();
            if (error) throw error;
            rosterEntry = data;
        } else {
            rosterEntry = await db.selectOne('roster', { prn: cleanPrn });
        }

        if (!rosterEntry) {
            const failures = await recordFailure(loginKey, attempt, req.ip);
            return invalidCredentials(res, failures);
        }

        // 2. Verify Date of Birth against Roster DOB
        const isMatch = verifyDob(cleanDob, rosterEntry.dob);
        if (!isMatch) {
            const failures = await recordFailure(loginKey, attempt, req.ip);
            return invalidCredentials(res, failures);
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
            year: studentRecord.year,
            sessionVersion: SESSION_VERSION
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
    return failures;
}

function invalidCredentials(res, failures = 0) {
    const remaining = Math.max(0, MAX_FAILURES - failures);
    if (remaining === 0) {
        return res.status(429).json({ success: false, error: { code: 'LOGIN_LOCKED', message: 'Login temporarily locked after 5 incorrect attempts. Try again in 15 minutes.' } });
    }
    const attemptWord = remaining === 1 ? 'attempt' : 'attempts';
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: `Incorrect PRN or Date of Birth. ${remaining} ${attemptWord} remaining.` } });
}

const { z } = require('zod');
const { parseDDMMYY } = require('../utils/dateHelper');
const kvCache = require('../utils/kvCache');

const dobCorrectionSchema = z.object({
    prn: z.string().trim().min(5).max(50),
    name: z.string().trim().min(2).max(100),
    dob: z.string().trim().regex(/^\d{6}$/, { message: 'DOB must be exactly 6 digits (DDMMYY).' }),
    token: z.string({ required_error: 'Security verification (Turnstile) is required.' })
}).strict();

const dobNameSuggestionSchema = z.object({
    prn: z.string().trim().min(5).max(50),
    q: z.string().trim().min(2).max(100)
}).strict();

function nameQueryMatchesRoster(query, rosterName) {
    const queryTokens = String(query).toLowerCase().match(/[a-z0-9]+/g) || [];
    const rosterTokens = String(rosterName).toLowerCase().match(/[a-z0-9]+/g) || [];
    return queryTokens.length > 0 && queryTokens.every(queryToken =>
        rosterTokens.some(rosterToken => rosterToken.startsWith(queryToken))
    );
}

function getSimilarity(s1, s2) {
    const a = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
    const track = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= b.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1,
                track[j - 1][i] + 1,
                track[j - 1][i - 1] + indicator
            );
        }
    }
    const distance = track[b.length][a.length];
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1.0;
    return 1.0 - (distance / maxLength);
}

async function getStaffEmails(branch) {
    const emails = { admin: 'ket.patil77@gmail.com', tpc: null };
    try {
        if (db.isLocal()) {
            const profiles = await db.select('profiles');
            const admin = profiles.find(p => ['admin', 'super_admin'].includes(p.role) && p.email);
            if (admin) emails.admin = admin.email;
            const tpc = profiles.find(p => p.role === 'observer' && p.department === branch && p.email);
            if (tpc) emails.tpc = tpc.email;
        } else {
            const supabase = db.supabaseClient();
            const { data, error } = await supabase.auth.admin.listUsers();
            if (!error && data && data.users) {
                const profiles = await db.select('profiles');
                const profileMap = new Map(profiles.map(p => [p.user_id, p]));
                for (const u of data.users) {
                    const prof = profileMap.get(u.id);
                    if (prof) {
                        if (['admin', 'super_admin'].includes(prof.role)) emails.admin = u.email;
                        if (prof.role === 'observer' && prof.department === branch) emails.tpc = u.email;
                    }
                }
            }
        }
    } catch (err) {
        console.error('Failed to get staff emails:', err.message);
    }
    return emails;
}

async function sendStaffAlertEmail(emails, requestInfo) {
    if (process.env.NODE_ENV === 'test') return;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('RESEND_API_KEY not set. Skipping email alerts.');
        return;
    }
    const recipients = [...new Set([emails.admin, emails.tpc].filter(Boolean))];
    if (!recipients.length) return;

    const mismatchNote = requestInfo.name_mismatch ? '⚠️ WARNING: Submitted name does not match roster record!' : '✅ Name matches roster record.';

    const bodyText = `New DOB correction request submitted:
- PRN: ${requestInfo.prn}
- Submitted Name: ${requestInfo.submitted_name}
- Correct DOB Candidate: ${requestInfo.submitted_dob}
- Department: ${requestInfo.department} (TPC Observer: ${emails.tpc || 'No Observer Configured'})
- Verification: ${mismatchNote}

Review and approve/reject here:
https://ait.ait-placement-portal.workers.dev/`;

    const deliveries = await Promise.allSettled(recipients.map(async recipient => {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Placement Portal <onboarding@resend.dev>',
                to: [recipient],
                subject: `[DOB Correction] Pending Request for PRN ${requestInfo.prn}`,
                text: bodyText
            })
        });
        if (!res.ok) {
            const detail = await res.text();
            throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
        }
        return recipient;
    }));
    deliveries.forEach((delivery, index) => {
        if (delivery.status === 'rejected') console.error(`Failed DOB alert delivery for ${recipients[index]}:`, delivery.reason?.message || delivery.reason);
    });
}

router.get('/dob-correction-name-suggestion', async (req, res) => {
    const parsed = dobNameSuggestionSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Enter valid PRN and at least 2 name characters.' });
    const rosterEntry = await db.selectOne('roster', { prn: parsed.data.prn });
    const matches = rosterEntry && nameQueryMatchesRoster(parsed.data.q, rosterEntry.name);
    return res.json({ success: true, data: matches ? [{ name: rosterEntry.name }] : [] });
});

router.post('/dob-correction-requests', verifyTurnstile, validate(dobCorrectionSchema), async (req, res) => {
    try {
        const { prn, name, dob, token } = req.body;
        const cleanPrn = prn.trim();
        const cleanName = name.trim();
        const ip = req.ip;

        // 1. IP-based Rate Limiting (max 3 requests per hour using KV)
        const ipKey = `rate_limit:ip:${ip}`;
        const currentAttempts = parseInt(await kvCache.get(ipKey) || '0', 10);
        if (currentAttempts >= 3) {
            return res.status(429).json({ success: false, error: 'Too many correction requests from this IP. Limit 3 per hour.' });
        }

        const rosterEntry = await db.selectOne('roster', { prn: cleanPrn });
        if (!rosterEntry) {
            return res.status(404).json({ success: false, error: 'Student PRN not found in roster.' });
        }

        const existingPending = await db.selectOne('dob_corrections', { prn: cleanPrn, status: 'pending' });
        if (existingPending) {
            return res.status(400).json({ success: false, error: 'You already have a pending DOB correction request. Please wait for review.' });
        }

        const targetDob = parseDDMMYY(dob);
        if (!targetDob) {
            return res.status(400).json({ success: false, error: 'Invalid DOB format. Use DDMMYY.' });
        }

        if (!nameQueryMatchesRoster(cleanName, rosterEntry.name)) {
            return res.status(400).json({ success: false, error: 'Name does not match this PRN. Select the roster name suggestion.' });
        }

        const requestData = {
            prn: cleanPrn,
            submitted_name: rosterEntry.name,
            submitted_dob: targetDob,
            department: rosterEntry.branch,
            status: 'pending',
            name_mismatch: false,
            created_at: new Date().toISOString()
        };
        const record = await db.insert('dob_corrections', requestData);

        // Update IP rate limiting count in cache
        await kvCache.put(ipKey, String(currentAttempts + 1), 3600);

        const emails = await getStaffEmails(rosterEntry.branch);
        sendStaffAlertEmail(emails, record).catch(console.error);

        return res.status(201).json({ success: true, message: 'DOB correction request submitted successfully.', data: record });
    } catch (err) {
        console.error('Error during DOB correction request submission:', err);
        return res.status(500).json({ success: false, error: 'Unable to process DOB correction request.' });
    }
});

module.exports = router;