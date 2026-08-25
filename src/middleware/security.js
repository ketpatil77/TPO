const crypto = require('crypto');
const { z } = require('zod');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfProtection(req, res, next) {
    if (!MUTATING.has(req.method) || req.path.endsWith('/login')) return next();
    const hasSession = Boolean(req.cookies?.token || req.cookies?.adminToken || req.cookies?.observerToken);
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
    res.clearCookie('observerToken', options);
    res.clearCookie('csrfToken', options);
}

function validate(schema) {
    return (req, res, next) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', field: parsed.error.issues[0]?.path?.join('.') || null, message: parsed.error.issues[0]?.message || 'Invalid request.' }
            });
        }
        req.body = parsed.data;
        next();
    };
}

async function verifyTurnstile(req, res, next) {
    const token = req.body.token || req.body.cf_turnstile_response || req.body['cf-turnstile-response'];
    const ip = req.ip;

    if (process.env.NODE_ENV === 'test' && token === 'test-turnstile-token') return next();

    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
        return res.status(403).json({ success: false, error: { code: 'TURNSTILE_REQUIRED', message: 'Complete security verification and try again.' } });
    }

    const testSecret = '1x0000000000000000000000000000000AA';
    const configuredSecret = process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET;
    const secret = configuredSecret || testSecret;
    const expectedAction = req.baseUrl === '/api/admin/auth'
        ? 'admin_login'
        : req.baseUrl === '/api/observer/auth'
            ? 'observer_login'
            : req.path.includes('dob-correction') ? 'dob_correction' : 'student_login';
    const expectedHostnames = new Set((process.env.TURNSTILE_HOSTNAMES || '').split(',').map(value => value.trim()).filter(Boolean));
    try {
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(10000),
            body: new URLSearchParams({ secret, response: token, remoteip: String(ip || '') })
        });
        if (!verifyRes.ok) throw new Error(`siteverify ${verifyRes.status}`);
        const verifyJson = await verifyRes.json();
        const productionChecksPass = !configuredSecret || (
            expectedHostnames.size > 0 &&
            verifyJson.action === expectedAction &&
            expectedHostnames.has(verifyJson.hostname)
        );
        if (!verifyJson.success || !productionChecksPass) {
            return res.status(403).json({ success: false, error: { code: 'TURNSTILE_FAILED', message: 'Security verification failed. Refresh and try again.' } });
        }
    } catch (err) {
        console.error('Turnstile verification error:', err);
        return res.status(403).json({ success: false, error: { code: 'TURNSTILE_UNAVAILABLE', message: 'Security verification is temporarily unavailable.' } });
    }
    next();
}

const prnSchema = z.string().trim().regex(/^\d{6,20}$/, 'PRN must contain 6 to 20 digits.');
const dobSchema = z.string().trim().regex(/^\d{6}$/, 'DOB must use DDMMYY format.');
const studentLoginSchema = z.object({ prn: prnSchema, dob: dobSchema, token: z.string().optional() }).strict();
const adminLoginSchema = z.object({ email: z.email().max(254), password: z.string().min(8).max(128), token: z.string().optional() }).strict();

module.exports = {
    csrfProtection,
    issueCsrfToken,
    clearSessionCookies,
    validate,
    verifyTurnstile,
    studentLoginSchema,
    adminLoginSchema
};
