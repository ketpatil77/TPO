const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

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
    let token = getExtractToken(req);
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Student token required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role === 'admin') {
            return res.status(403).json({ success: false, error: 'Access denied: Admin credentials cannot be used on student portal.' });
        }
        req.student = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired student session.' });
    }
}

/**
 * Middleware to protect Admin-only routes
 */
function authenticateAdmin(req, res, next) {
    let token = getExtractToken(req);
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Access denied: Requires administrator privileges.' });
        }
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired admin session.' });
    }
}

function getExtractToken(req) {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const candidate = authHeader.substring(7);
        if (candidate && candidate !== 'null' && candidate !== 'undefined') token = candidate;
    }
    if (!token && req.cookies && req.cookies.adminToken) {
        token = req.cookies.adminToken;
    }
    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    return token;
}

module.exports = {
    authenticateStudent,
    authenticateAdmin,
    JWT_SECRET
};
