const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { csrfProtection } = require('./middleware/security');
const { protectCollegeAcademics } = require('./middleware/collegeAcademics');
const { authenticateStudent, authenticateAdmin, authenticateObserver } = require('./middleware/auth');

require('dotenv').config();

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const studentSubmissionGuard = require('./routes/studentSubmissionGuard');
const proofManagedRecordsRoutes = require('./routes/proofManagedRecords');
const internshipEvidenceRoutes = require('./routes/internshipEvidence');
const certificateEvidenceRoutes = require('./routes/certificateEvidence');
const competitionRoutes = require('./routes/competitions');
const profileDeclarationRoutes = require('./routes/profileDeclarations');
const profileLinksRoutes = require('./routes/profileLinks');
const freeLearningRoutes = require('./routes/freeLearning');
const competitionReviewRoutes = require('./routes/competitionReview');
const profileRankingViewRoutes = require('./routes/profileRankingView');
const { createStudentAvatarDirectory } = require('./routes/studentAvatarDirectory');

const adminAuthRoutes = require('./routes/adminAuth');
const adminRosterRoutes = require('./routes/adminRoster');
const adminStudentsRoutes = require('./routes/adminStudents');
const adminModerationRoutes = require('./routes/adminModeration');
const moderationQueueRoutes = require('./routes/moderationQueue');
const fullStudentExportRoutes = require('./routes/fullStudentExport');
const certificateReviewRoutes = require('./routes/certificateReview');
const proofReviewRoutes = require('./routes/proofReview');
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

app.disable('x-powered-by');
app.set('trust proxy', 1);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"], baseUri: ["'self'"],
            connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'], formAction: ["'self'"],
            frameAncestors: ["'none'"], frameSrc: ['https://challenges.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'blob:'], objectSrc: ["'none'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
            scriptSrcAttr: ["'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin))) return callback(null, true);
        return callback(new Error('Origin not allowed'));
    }, credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: 'draft-7', legacyHeaders: false,
    validate: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again later.' } }
}));
app.use(csrfProtection);
app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

if (!isCloudflareWorker) app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/student', protectCollegeAcademics);
app.use('/api/student/student-avatars', createStudentAvatarDirectory(authenticateStudent));
app.use('/api/student', studentSubmissionGuard);
app.use('/api/student', proofManagedRecordsRoutes);
app.use('/api/student', internshipEvidenceRoutes);
app.use('/api/student', certificateEvidenceRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/student/competitions', competitionRoutes);
app.use('/api/student/profile-declarations', profileDeclarationRoutes);
app.use('/api/student/profile-links', profileLinksRoutes);
app.use('/api/student/free-learning', freeLearningRoutes);
app.use('/api/student/rankings-view', profileRankingViewRoutes);
app.use('/api/student/workflow', workflowRoutes.student);
app.use('/api/student/advanced', advancedRoutes.student);

app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/roster', adminRosterRoutes);
app.use('/api/admin/student-avatars', createStudentAvatarDirectory(authenticateAdmin));
app.use('/api/admin/students/export', fullStudentExportRoutes);
app.use('/api/admin/proof-review', proofReviewRoutes.admin);
app.use('/api/admin/certificates', certificateReviewRoutes);
app.use('/api/admin/moderation-queue', moderationQueueRoutes.admin);
// Moderation is mounted before the legacy student router so the corrected
// impersonation endpoint and record moderation actions are authoritative.
app.use('/api/admin/students', adminModerationRoutes);
app.use('/api/admin/students', adminStudentsRoutes);
app.use('/api/admin/profile-completion', profileCompletionRoutes.admin);
app.use('/api/admin/audit-logs', adminAuditRoutes);
app.use('/api/admin/drives', adminDriveRoutes);
app.use('/api/admin/competitions', competitionReviewRoutes.admin);
app.use('/api/admin/workflow', workflowRoutes.admin);
app.use('/api/admin/advanced', advancedRoutes.admin);
app.use('/api/admin/intelligence', intelligenceRoutes);
app.use('/api/admin/launch', launchOperationsRoutes);
app.use('/api/observer/auth', observerAuthRoutes);
app.use('/api/observer/student-avatars', createStudentAvatarDirectory(authenticateObserver));
app.use('/api/observer/proof-review', proofReviewRoutes.observer);
app.use('/api/observer/moderation-queue', moderationQueueRoutes.observer);
app.use('/api/observer/profile-completion', profileCompletionRoutes.observer);
app.use('/api/observer/competitions', competitionReviewRoutes.observer);
app.use('/api/observer', observerRoutes);

if (!isCloudflareWorker) app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(process.cwd(), 'public/index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(process.cwd(), 'public/dashboard.html')));
if (!isCloudflareWorker) app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/admin/login', (req, res) => res.sendFile(path.join(process.cwd(), 'public/index.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(process.cwd(), 'public/admin-dashboard.html')));
if (!isCloudflareWorker) app.get('/observer', (req, res) => res.redirect('/observer/login'));
app.get('/observer/login', (req, res) => res.sendFile(path.join(process.cwd(), 'public/index.html')));
app.get('/observer/dashboard', (req, res) => res.sendFile(path.join(process.cwd(), 'public/observer-dashboard.html')));
app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }));

app.use((req, res) => res.status(404).json({ success: false, error: 'Endpoint not found' }));
app.use((err, req, res, next) => {
    console.error('Unhandled request error:', err.message);
    if (res.headersSent) return next(err);
    if (err.message === 'Origin not allowed') return res.status(403).json({ success: false, error: { code: 'ORIGIN_DENIED', message: 'Request origin not allowed.' } });
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) return res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON request.' } });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Server request failed.' } });
});

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
