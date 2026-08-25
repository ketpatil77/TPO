const express = require('express');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const db = require('../config/database');
const { authenticateObserver, JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
const { validate, verifyTurnstile, adminLoginSchema, issueCsrfToken, clearSessionCookies } = require('../middleware/security');
const { acceptAvatar, uploadAvatar, getAvatar, deleteAvatar } = require('../utils/avatar');

const router = express.Router();
const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' } }
});

router.post('/login', loginLimit, verifyTurnstile, validate(adminLoginSchema), async (req, res) => {
    try {
        const supabase = db.authClient();
        if (!supabase || db.isLocal()) {
            return res.status(503).json({ success: false, error: { code: 'AUTH_UNAVAILABLE', message: 'Observer authentication is not configured.' } });
        }
        const { data, error } = await supabase.auth.signInWithPassword(req.body);
        if (error || !data.user) {
            return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
        }
        const profile = await db.selectOne('profiles', { user_id: data.user.id });
        if (!profile || profile.role !== 'observer' || profile.status !== 'active') {
            await supabase.auth.signOut();
            return res.status(403).json({ success: false, error: { code: 'OBSERVER_REQUIRED', message: 'Active observer account required.' } });
        }
        const token = jwt.sign({
            role: 'observer', observerId: data.user.id, email: data.user.email,
            department: profile.department, issuedAt: new Date().toISOString(), sessionVersion: Number(profile.session_version || SESSION_VERSION)
        }, JWT_SECRET, { expiresIn: '8h' });
        res.cookie('observerToken', token, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
            path: '/'
        });
        issueCsrfToken(res);
        await db.update('profiles', { user_id: data.user.id }, { last_login_at: new Date().toISOString() });
        await db.logAudit('observer_login', 'auth', data.user.id, { email: data.user.email, department: profile.department });
        return res.json({ success: true, observer: { email: data.user.email, department: profile.department } });
    } catch (err) {
        console.error({ event: 'observer_login_failed', message: err.message });
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to complete authentication.' } });
    }
});

router.get('/me', authenticateObserver, (req, res) => res.json({ success: true, observer: req.observer }));
router.post('/avatar', authenticateObserver, acceptAvatar, (req, res) => uploadAvatar(req, res, {
    table: 'profiles', filter: { user_id: req.observer.observerId }, id: req.observer.observerId, folder: 'observer'
}));
router.get('/avatar', authenticateObserver, (req, res) => getAvatar(res, {
    table: 'profiles', filter: { user_id: req.observer.observerId }, id: req.observer.observerId, folder: 'observer'
}));
router.delete('/avatar', authenticateObserver, (req, res) => deleteAvatar(res, {
    table: 'profiles', filter: { user_id: req.observer.observerId }, id: req.observer.observerId, folder: 'observer'
}));
router.post('/logout', (req, res) => {
    clearSessionCookies(res);
    res.json({ success: true });
});

module.exports = router;
