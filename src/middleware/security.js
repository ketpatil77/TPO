const crypto = require('crypto');
const { z } = require('zod');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfProtection(req, res, next) {
    if (!MUTATING.has(req.method) || req.path.endsWith('/login')) return next();
    const hasSession = Boolean(req.cookies?.token || req.cookies?.adminToken);
    if (!hasSession) return next();
    const cookieToken = req.cookies?.csrfToken;
    const headerToken = req.get('x-csrf-token');
    if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length ||
        !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        return res.status(403).json({ success: false, error: { code: 'CSRF_INVALID', message: 'Invalid security token.' } });
    }
    next();
}

function issueCsrfToken(res) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/'
    });
    return token;
}

function clearSessionCookies(res) {
    const options = { sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' };
    res.clearCookie('token', options);
    res.clearCookie('adminToken', options);
    res.clearCookie('csrfToken', options);
}

function validate(schema) {
    return (req, res, next) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid request.' }
            });
        }
        req.body = parsed.data;
        next();
    };
}

const prnSchema = z.string().trim().regex(/^\d{6,20}$/, 'PRN must contain 6 to 20 digits.');
const dobSchema = z.string().trim().regex(/^\d{6}$/, 'DOB must use DDMMYY format.');
const studentLoginSchema = z.object({ prn: prnSchema, dob: dobSchema }).strict();
const adminLoginSchema = z.object({ email: z.email().max(254), password: z.string().min(8).max(128) }).strict();

module.exports = {
    csrfProtection,
    issueCsrfToken,
    clearSessionCookies,
    validate,
    studentLoginSchema,
    adminLoginSchema
};

