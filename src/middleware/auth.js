const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_VERSION = 2;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}

/**
 * Computes server-side current admin password: "Tpo" + current date in DDMMYY format.
 * Example: For 5-Aug-2026 => "Tpo050826"
 * @returns {string}
 */
/**
 * Middleware to protect Student-only routes
 */
function authenticateStudent(req, res, next) {
    let token = getExtractToken(req, 'token');
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Student token required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.sessionVersion !== SESSION_VERSION) throw new Error('Session refresh required');
        if (decoded.role !== 'student') {
            return res.status(403).json({ success: false, error: 'Access denied: Staff credentials cannot be used on student portal.' });
        }
        req.student = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired student session.' });
    }
}

async function authenticateObserver(req, res, next) {
    const token = getExtractToken(req, 'observerToken');
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized: Observer authentication required.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.sessionVersion !== SESSION_VERSION) throw new Error('Session refresh required');
        if (decoded.role !== 'observer') {
            return res.status(403).json({ success: false, error: 'Access denied: Requires observer privileges.' });
        }
        if (!db.isLocal()) {
            const profile=await db.selectOne('profiles',{user_id:decoded.observerId});
            if(!profile||profile.status!=='active'||Number(profile.session_version||2)!==Number(decoded.sessionVersion))throw new Error('Session revoked');
        }
        req.observer = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired observer session.' });
    }
}

/**
 * Middleware to protect Admin-only routes
 */
async function authenticateAdmin(req, res, next) {
    let token = getExtractToken(req, 'adminToken');
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.sessionVersion !== SESSION_VERSION) throw new Error('Session refresh required');
        if (!['admin', 'super_admin'].includes(decoded.role)) {
            return res.status(403).json({ success: false, error: 'Access denied: Requires administrator privileges.' });
        }
        if (!db.isLocal()) {
            const profile=await db.selectOne('profiles',{user_id:decoded.adminId});
            if(!profile||profile.status!=='active'||Number(profile.session_version||2)!==Number(decoded.sessionVersion))throw new Error('Session revoked');
        }
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired admin session.' });
    }
}

async function authenticateSuperAdmin(req, res, next) {
    await authenticateAdmin(req, res, () => req.admin.role === 'super_admin' ? next() : res.status(403).json({ success:false, error:'Super Administrator access required.' }));
}

function getExtractToken(req, expectedCookie) {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const candidate = authHeader.substring(7);
        if (candidate && candidate !== 'null' && candidate !== 'undefined') token = candidate;
    }
    if (!token && req.cookies && req.cookies[expectedCookie]) {
        token = req.cookies[expectedCookie];
    }
    return token;
}

module.exports = {
    authenticateStudent,
    authenticateAdmin,
    authenticateObserver,
    authenticateSuperAdmin,
    JWT_SECRET
    ,SESSION_VERSION
};
