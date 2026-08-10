const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { csrfProtection } = require('./middleware/security');

require('dotenv').config();

// Student Routes
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const rosterRoutes = require('./routes/roster');

// Admin Routes (Part 2)
const adminAuthRoutes = require('./routes/adminAuth');
const adminRosterRoutes = require('./routes/adminRoster');
const adminStudentsRoutes = require('./routes/adminStudents');
const adminAuditRoutes = require('./routes/adminAudit');
const adminDriveRoutes = require('./routes/adminDrives');

const app = express();
const PORT = process.env.PORT || 3000;
const isCloudflareWorker = process.env.CLOUDFLARE_WORKER === 'true';

// Middleware
app.disable('x-powered-by');
app.set('trust proxy', 1);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
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
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use(csrfProtection);

// Static Assets
if (!isCloudflareWorker) app.use(express.static(path.join(process.cwd(), 'public')));

// API Endpoints - Student
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
// Legacy roster routes intentionally not mounted: roster data is admin-only.

// API Endpoints - Admin (Part 2)
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/roster', adminRosterRoutes);
app.use('/api/admin/students', adminStudentsRoutes);
app.use('/api/admin/audit-logs', adminAuditRoutes);
app.use('/api/admin/drives', adminDriveRoutes);

// View Routing - Student
if (!isCloudflareWorker) app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/dashboard.html'));
});

// View Routing - Admin (Part 2)
if (!isCloudflareWorker) app.get('/admin', (req, res) => {
    res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/admin-login.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/admin-dashboard.html'));
});

app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }));

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error('Unhandled request error:', err.message);
    if (res.headersSent) return next(err);
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
