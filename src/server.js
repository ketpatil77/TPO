const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { csrfProtection } = require('./middleware/security');
const { protectCollegeAcademics, blockAcademicVerification } = require('./middleware/collegeAcademics');

require('dotenv').config();

// Student Routes
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const competitionRoutes = require('./routes/competitions');
const competitionReviewRoutes = require('./routes/competitionReview');
const profileRankingRoutes = require('./routes/profileRanking');
const rosterRoutes = require('./routes/roster');

// Admin Routes (Part 2)
const adminAuthRoutes = require('./routes/adminAuth');
const adminRosterRoutes = require('./routes/adminRoster');
const adminStudentsRoutes = require('./routes/adminStudents');
const profileCompletionRoutes = require('./routes/profileCompletion');
const adminAuditRoutes = require('./routes/adminAudit');
const adminDriveRoutes = require('./routes/adminDrives');
const observerAuthRoutes = require('./routes/observerAuth');
const observerRoutes = require('./routes/observer');
const workflowRoutes = require('./routes/workflow');
const advancedRoutes = require('./routes/advanced');
const intelligenceRoutes = require('./routes/intelligence');
const launchOperationsRoutes = require('./routes/launchOperations');

const app = express();
const PORT = process.env.PORT || 3000;
const isCloudflareWorker = process.env.CLOUDFLARE_WORKER === 'true';

// Middleware
app.disable('x-powered-by');
app.set('trust proxy', 1);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            frameSrc: ['https://challenges.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin))) return callback(null, true);
        return callback(new Error('Origin not allowed'));
    },
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again later.' } }
}));
app.use(csrfProtection);

// Static Assets
if (!isCloudflareWorker) app.use(express.static(path.join(process.cwd(), 'public')));

// API Endpoints - Student
app.use('/api/auth', authRoutes);
// College-provided CGPA / semester SGPA are authoritative and cannot be changed from Student Workspace.
app.use('/api/student', protectCollegeAcademics);
app.use('/api/student', studentRoutes);
app.use('/api/student/competitions', competitionRoutes);
app.use('/api/student/rankings', profileRankingRoutes.student);
app.use('/api/student/workflow', workflowRoutes.student);
app.use('/api/student/advanced', advancedRoutes.student);
// Legacy roster routes intentionally not mounted: roster data is admin-only.

// API Endpoints - Admin (Part 2)
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/roster', adminRosterRoutes);
app.use('/api/admin/students', adminStudentsRoutes);
app.use('/api/admin/profile-completion', profileCompletionRoutes.admin);
app.use('/api/admin/audit-logs', adminAuditRoutes);
app.use('/api/admin/drives', adminDriveRoutes);
app.use('/api/admin/competitions', competitionReviewRoutes.admin);
app.use('/api/admin/rankings', blockAcademicVerification);
app.use('/api/admin/rankings', profileRankingRoutes.admin);
app.use('/api/admin/workflow', workflowRoutes.admin);
app.use('/api/admin/advanced', advancedRoutes.admin);
app.use('/api/admin/intelligence', intelligenceRoutes);
app.use('/api/admin/launch', launchOperationsRoutes);
app.use('/api/observer/auth', observerAuthRoutes);
app.use('/api/observer/profile-completion', profileCompletionRoutes.observer);
app.use('/api/observer/competitions', competitionReviewRoutes.observer);
app.use('/api/observer/rankings', blockAcademicVerification);
app.use('/api/observer/rankings', profileRankingRoutes.observer);
app.use('/api/observer', observerRoutes);

// View Routing - Student
if (!isCloudflareWorker) app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/dashboard.html'));
});

// View Routing - Admin (Part 2)
if (!isCloudflareWorker) app.get('/admin', (req, res) => {
    res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/index.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/admin-dashboard.html'));
});

if (!isCloudflareWorker) app.get('/observer', (req, res) => res.sendFile(path.join(process.cwd(), 'public/index.html')));
app.get('/observer/login', (req, res) => res.sendFile(path.join(process.cwd(), 'public/index.html')));
app.get('/observer/dashboard', (req, res) => res.sendFile(path.join(process.cwd(), 'public/observer-dashboard.html')));

app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }));

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error('Unhandled request error:', err.message);
    if (res.headersSent) return next(err);
    if (err.message === 'Origin not allowed') {
        return res.status(403).json({ success: false, error: { code: 'ORIGIN_DENIED', message: 'Request origin not allowed.' } });
    }
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON request.' } });
    }
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Server request failed.' } });
});

// Start Server if run directly
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 TPO Portal Server running on http://localhost:${PORT}`);
        console.log(`🔑 Student Login: http://localhost:${PORT}/login`);
        console.log(`🎓 Student Dashboard: http://localhost:${PORT}/dashboard`);
        console.log(`🛡️ Admin Login: http://localhost:${PORT}/admin/login`);
        console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin/dashboard`);
    });
}

module.exports = app;