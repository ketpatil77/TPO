const express = require('express');
const jwt = require('jsonwebtoken');
const { authenticateAdmin, JWT_SECRET } = require('../middleware/auth');
const db = require('../config/database');
const { rateLimit } = require('express-rate-limit');
const { validate, adminLoginSchema, issueCsrfToken, clearSessionCookies } = require('../middleware/security');
const { z } = require('zod');

const router = express.Router();

/**
 * @route   POST /api/admin/auth/login
 * @desc    Admin login through Supabase email/password authentication
 */
const adminLoginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, validate: false });

router.post('/login', adminLoginLimit, validate(adminLoginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const supabase = db.supabaseClient();
        if (!supabase || db.isLocal()) {
            return res.status(503).json({ success: false, error: { code: 'AUTH_UNAVAILABLE', message: 'Admin authentication is not configured.' } });
        }
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError || !authData.user) {
            return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
        }
        const profile = await db.selectOne('profiles', { user_id: authData.user.id });
        if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
            await supabase.auth.signOut();
            return res.status(403).json({ success: false, error: { code: 'ADMIN_REQUIRED', message: 'Administrator access required.' } });
        }

        // Generate Admin JWT Scoped Token
        const payload = {
            role: 'admin',
            adminId: authData.user.id,
            email: authData.user.email,
            issuedAt: new Date().toISOString()
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000,
            path: '/'
        });
        issueCsrfToken(res);

        // Audit Log
        await db.logAudit('admin_login', 'auth', authData.user.id, { email: authData.user.email });

        return res.json({
            success: true,
            message: 'Admin authentication successful!',
            admin: { email: authData.user.email }
        });
    } catch (err) {
        console.error({ event: 'admin_login_failed', message: err.message });
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to complete authentication.' } });
    }
});

/**
 * @route   GET /api/admin/auth/me
 * @desc    Check admin session
 */
router.get('/me', authenticateAdmin, (req, res) => {
    return res.json({ success: true, admin: req.admin });
});

router.get('/accounts', authenticateAdmin, async (req, res) => {
    const supabase = db.supabaseClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) throw error;
    const profiles = await db.select('profiles');
    const profileMap = new Map(profiles.map(item => [item.user_id, item]));
    const accounts = data.users.map(user => ({ id: user.id, email: user.email, profile: profileMap.get(user.id) || null, created_at: user.created_at }));
    res.json({ success: true, data: accounts });
});

const accountSchema = z.object({ email: z.email().max(254), password: z.string().min(12).max(128) }).strict();
router.post('/accounts', authenticateAdmin, validate(accountSchema), async (req, res) => {
    const supabase = db.supabaseClient();
    const { data, error } = await supabase.auth.admin.createUser({ email: req.body.email, password: req.body.password, email_confirm: true });
    if (error) throw error;
    const profile = await db.insert('profiles', { user_id: data.user.id, role: 'admin', status: 'active', created_at: new Date().toISOString() });
    await db.logAudit('admin_create', 'profiles', profile.id, { email: data.user.email });
    res.status(201).json({ success: true, data: { id: data.user.id, email: data.user.email, profile } });
});

/**
 * @route   POST /api/admin/auth/logout
 */
router.post('/logout', (req, res) => {
    clearSessionCookies(res);
    return res.json({ success: true, message: 'Admin logged out.' });
});

module.exports = router;
