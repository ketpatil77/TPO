const express = require('express');
const ExcelJS = require('exceljs');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin, authenticateSuperAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { normalizeTerms } = require('../utils/matching');
const { callGroqJson } = require('../utils/groqClient');
const { BRANCHES } = require('../config/branches');

const router = express.Router();
router.use(authenticateAdmin);

const jdSchema = z.object({ jd_text: z.string().trim().min(10).max(50000) }).strict();

/**
 * Fallback regex-based JD parsing when Groq API key is unavailable or fails.
 */
function parseJdFallback(text) {
    const lower = text.toLowerCase();
    const branchCodes = BRANCHES.map(b => b.code);

    // Match branch names / abbreviations
    const branches = branchCodes.filter(branch => {
        const pattern = new RegExp(`(?:^|[^a-z0-9])${branch.toLowerCase().replace(/[&]/g, '\\&')}(?=$|[^a-z0-9])`, 'i');
        return pattern.test(lower);
    });

    const cgpaMatch = lower.match(/(?:cgpa|gpa)[^0-9]{0,12}([0-9](?:\.[0-9]+)?)/i);
    const minCgpa = cgpaMatch ? Number(cgpaMatch[1]) : 0;

    const deadlineMatch = text.match(/(?:deadline|last date|apply by)[^\n:]*[:\-]?\s*([^\n]{5,40})/i);
    const locationMatch = text.match(/(?:location|place|job location|work location)[^\n:]*[:\-]?\s*([^\n]{2,80})/i);

    const dictionary = [
        'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'sql', 'react', 'node.js', 'express.js',
        'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'linux', 'machine learning', 'deep learning',
        'natural language processing', 'computer vision', 'data structures', 'communication',
        'autocad', 'solidworks', 'matlab', 'plc', 'powerbi', 'tableau', 'postgresql', 'mongodb', 'git', 'ci/cd'
    ];

    const lines = text.split('\n');
    const requiredSkills = [];
    const preferredSkills = [];
    let currentMode = 'required';

    for (const line of lines) {
        const lineLower = line.toLowerCase();
        if (/(?:preferred|nice to have|plus|optional|good to have)/i.test(lineLower)) {
            currentMode = 'preferred';
        } else if (/(?:required|mandatory|must have|skills required|qualifications)/i.test(lineLower)) {
            currentMode = 'required';
        }

    const lineSkills = dictionary.filter(skill => {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i');
        return regex.test(lineLower);
    });
        if (currentMode === 'preferred') {
            preferredSkills.push(...lineSkills);
        } else {
            requiredSkills.push(...lineSkills);
        }
    }

    const normRequired = normalizeTerms(requiredSkills.length ? requiredSkills : dictionary.filter(skill => lower.includes(skill)));
    const normPreferred = normalizeTerms(preferredSkills);
    const normAll = normalizeTerms([...normRequired, ...normPreferred]);

    return {
        branches: branches.length ? branches : [],
        min_cgpa: minCgpa,
        skills: normAll,
        required_skills: normRequired,
        preferred_skills: normPreferred,
        keywords: normAll,
        deadline: deadlineMatch ? deadlineMatch[1].trim() : null,
        location: locationMatch ? locationMatch[1].trim() : null,
        needs_confirmation: true
    };
}

router.post('/jd-parser', validate(jdSchema), async (req, res) => {
    const text = req.body.jd_text;

    // Attempt Groq LLM parsing first
    const systemPrompt = `You are an expert AI recruiter system for university placements.
Extract structured information from Job Descriptions (JDs) into JSON format.
Allowed engineering branches strictly include: ["AIML", "CT", "EE", "ME", "CE", "E&C"].
Output JSON schema:
{
  "branches": ["string"], // subset of allowed branches or empty
  "min_cgpa": number, // floating point CGPA requirement (e.g. 7.5) or 0
  "required_skills": ["string"], // mandatory technical skills
  "preferred_skills": ["string"], // nice to have skills
  "keywords": ["string"], // domain topics, technologies, concepts
  "deadline": "string | null", // application deadline if stated
  "location": "string | null" // job location if stated
}`;

    const userPrompt = `Parse the following Job Description:\n\n${text}`;

    let parsed = await callGroqJson(systemPrompt, userPrompt, { temperature: 0.1 });

    if (!parsed) {
        // Fallback to deterministic regex parser
        parsed = parseJdFallback(text);
    } else {
        // Validate and normalize Groq output
        const branchCodes = BRANCHES.map(b => b.code);
        const validBranches = Array.isArray(parsed.branches)
            ? parsed.branches.map(b => String(b).toUpperCase()).filter(b => branchCodes.includes(b))
            : [];

        const reqSkills = normalizeTerms(parsed.required_skills);
        const prefSkills = normalizeTerms(parsed.preferred_skills);
        const allSkills = normalizeTerms([...reqSkills, ...prefSkills, ...(parsed.skills || [])]);
        const keywords = normalizeTerms(parsed.keywords || allSkills);

        parsed = {
            branches: validBranches,
            min_cgpa: Number(parsed.min_cgpa) || 0,
            skills: allSkills,
            required_skills: reqSkills.length ? reqSkills : allSkills,
            preferred_skills: prefSkills,
            keywords: keywords.length ? keywords : allSkills,
            deadline: parsed.deadline || null,
            location: parsed.location || null,
            needs_confirmation: true
        };
    }

    res.json({ success: true, data: parsed });
});

router.get('/rankings/:driveId', async (req, res) => {
    const [matches, students] = await Promise.all([
        db.select('drive_matches', { drive_id: req.params.driveId }),
        db.select('students')
    ]);
    const people = new Map(students.map(s => [s.id, s]));
    const latest = new Map();
    matches.forEach(m => {
        const old = latest.get(m.student_id);
        if (!old || String(m.created_at) > String(old.created_at)) latest.set(m.student_id, m);
    });
    const data = [...latest.values()]
        .filter(m => m.eligible)
        .sort((a, b) => b.score - a.score)
        .slice(0, 200)
        .map((m, index) => ({
            rank: index + 1,
            ...m,
            student: people.get(m.student_id) || null,
            decision: 'Human confirmation required'
        }));
    res.json({ success: true, data });
});

router.get('/fraud-check', async (_req, res) => {
    const [roster, students, certificates, internships] = await Promise.all([
        'roster', 'students', 'certificates', 'internships'
    ].map(t => db.select(t)));
    const findings = [];
    const groups = (rows, key) => {
        const map = new Map();
        rows.forEach(row => {
            const value = String(key(row) || '').trim().toLowerCase();
            if (!value) return;
            (map.get(value) || map.set(value, []).get(value)).push(row);
        });
        return [...map.entries()].filter(([, items]) => items.length > 1);
    };

    groups(roster, r => r.prn).forEach(([value, items]) => findings.push({ severity: 'high', type: 'duplicate_prn', value, count: items.length, records: items.map(x => x.id) }));
    groups(students, r => r.email).forEach(([value, items]) => findings.push({ severity: 'high', type: 'duplicate_email', value, count: items.length, records: items.map(x => x.id) }));
    groups(students, r => r.phone || r.mobile).forEach(([value, items]) => findings.push({ severity: 'high', type: 'duplicate_phone', value, count: items.length, records: items.map(x => x.id) }));
    groups(students, r => `${r.name || ''}:${r.dob || ''}`).forEach(([value, items]) => findings.push({ severity: 'medium', type: 'possible_duplicate_identity', value, count: items.length, records: items.map(x => x.id) }));
    groups(students, r => r.resume_url).forEach(([value, items]) => findings.push({ severity: 'high', type: 'reused_resume', value, count: items.length, records: items.map(x => x.id) }));
    groups(certificates, r => `${r.student_id}:${r.name}:${r.issuer}`).forEach(([value, items]) => findings.push({ severity: 'medium', type: 'duplicate_certificate', value, count: items.length, records: items.map(x => x.id) }));
    internships.filter(x => x.start_date && x.end_date && x.start_date > x.end_date).forEach(x => findings.push({ severity: 'high', type: 'conflicting_internship_dates', value: x.company, records: [x.id] }));
    students.filter(x => Number(x.cgpa_overall) < 0 || Number(x.cgpa_overall) > 10).forEach(x => findings.push({ severity: 'high', type: 'invalid_cgpa', value: x.cgpa_overall, records: [x.id] }));
    res.json({ success: true, data: findings.slice(0, 500), summary: { total: findings.length, high: findings.filter(x => x.severity === 'high').length, medium: findings.filter(x => x.severity === 'medium').length } });
});

router.get('/health', authenticateSuperAdmin, async (_req, res) => {
    const began = Date.now();
    let database = 'ok';
    let counts = {};
    let failedLogins = 0;
    let recentErrors = 0;
    try {
        const rows = await Promise.all(['students', 'roster', 'profiles', 'notifications', 'audit_log', 'login_attempts'].map(t => db.select(t)));
        counts = Object.fromEntries(['students', 'roster', 'staff', 'notifications', 'auditLogs'].map((key, i) => [key, rows[i].length]));
        failedLogins = rows[5].reduce((n, x) => n + Number(x.failures || 0), 0);
        recentErrors = rows[4].filter(x => /(fail|error|reject)/i.test(x.action)).length;
    } catch {
        database = 'error';
    }
    const audits = (await db.select('audit_log')).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10);
    res.json({ success: true, data: { api: 'ok', database, databaseLatencyMs: Date.now() - began, runtime: 'Cloudflare Worker · stateless', release: '2026.08.12-intelligence', email: 'Not configured · in-app notifications active', failedLogins, recentErrors, counts, recentActivity: audits, limits: { listRows: 500, resumeMb: 2, avatarMb: 1 }, checkedAt: new Date().toISOString() } });
});

router.get('/reports/management.xlsx', async (_req, res) => {
    const [students, offers, drives, applications] = await Promise.all(['students', 'offers', 'placement_drives', 'drive_applications'].map(t => db.select(t)));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AIT Placement Portal';
    const summary = workbook.addWorksheet('Summary');
    summary.addRows([['AIT Placement Management Report'], ['Generated', new Date().toISOString()], ['Students', students.length], ['Placement drives', drives.length], ['Applications', applications.length], ['Offers', offers.length], ['Accepted / joined', offers.filter(x => ['accepted', 'joined'].includes(x.status)).length]]);
    summary.getColumn(1).width = 28;
    summary.getColumn(2).width = 28;
    const sheet = workbook.addWorksheet('Students');
    sheet.columns = [{ header: 'PRN', key: 'prn', width: 20 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Branch', key: 'branch', width: 12 }, { header: 'Year', key: 'year', width: 16 }, { header: 'CGPA', key: 'cgpa_overall', width: 10 }, { header: 'Resume', key: 'resume_url', width: 18 }];
    sheet.addRows(students.map(s => ({ ...s, resume_url: s.resume_url ? 'Available' : 'Missing' })));
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    await db.logAudit('management_report_export', 'reports', null, { students: students.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="AIT-placement-management-report.xlsx"');
    res.send(Buffer.from(buffer));
});

router.get('/reports/management-print', async (_req, res) => {
    const [students, offers, drives, applications] = await Promise.all(['students', 'offers', 'placement_drives', 'drive_applications'].map(t => db.select(t)));
    const safe = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const branchCounts = {};
    students.forEach(s => branchCounts[s.branch] = (branchCounts[s.branch] || 0) + 1);
    await db.logAudit('management_report_print', 'reports', null, { students: students.length });
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>AIT Placement Management Report</title><style>body{font:14px Arial;color:#17212b;margin:32px}h1{margin-bottom:4px}.meta{color:#52606d}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card{border:1px solid #ccd4dc;padding:16px;border-radius:8px}.card strong{display:block;font-size:24px;margin-top:6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd4dc;padding:9px;text-align:left}@media print{button{display:none}body{margin:12mm}}</style></head><body><button onclick="print()">Print / Save as PDF</button><h1>AIT Placement Management Report</h1><p class="meta">Generated ${safe(new Date().toLocaleString('en-IN'))}</p><div class="cards"><div class="card">Students<strong>${students.length}</strong></div><div class="card">Drives<strong>${drives.length}</strong></div><div class="card">Applications<strong>${applications.length}</strong></div><div class="card">Offers<strong>${offers.length}</strong></div></div><h2>Branch summary</h2><table><thead><tr><th>Branch</th><th>Students</th></tr></thead><tbody>${Object.entries(branchCounts).map(([b, n]) => `<tr><td>${safe(b)}</td><td>${n}</td></tr>`).join('')}</tbody></table></body></html>`);
});

router.get('/reports/access-logins.xlsx', authenticateSuperAdmin, async (_req, res) => {
    const [profiles, roster, students] = await Promise.all(['profiles', 'roster', 'students'].map(t => db.select(t)));
    const auth = db.authClient();
    let authUsers = [];
    if (auth) {
        const { data, error } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw error;
        authUsers = data.users || [];
    }
    const profileByUser = new Map(profiles.map(p => [p.user_id, p]));
    const studentByPrn = new Map(students.map(s => [String(s.prn), s]));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AIT Placement Portal';
    workbook.created = new Date();
    const style = sheet => {
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5B49' } };
    };
    const staff = workbook.addWorksheet('Staff logins');
    staff.columns = [{ header: 'Name', key: 'name', width: 25 }, { header: 'Email', key: 'email', width: 32 }, { header: 'Role', key: 'role', width: 18 }, { header: 'Department', key: 'department', width: 16 }, { header: 'Status', key: 'status', width: 14 }, { header: 'Last login', key: 'last_login', width: 24 }, { header: 'Created', key: 'created', width: 24 }];
    staff.addRows(authUsers.map(u => {
        const p = profileByUser.get(u.id) || {};
        return { name: p.display_name || '', email: u.email || '', role: p.role || 'unconfigured', department: p.department || 'All', status: p.status || 'unconfigured', last_login: p.last_login_at || 'Never', created: u.created_at || p.created_at || '' };
    }));
    style(staff);
    const studentSheet = workbook.addWorksheet('Student logins');
    studentSheet.columns = [{ header: 'PRN', key: 'prn', width: 20 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Branch', key: 'branch', width: 12 }, { header: 'Class', key: 'class', width: 12 }, { header: 'Year', key: 'year', width: 16 }, { header: 'Login ready', key: 'login_ready', width: 14 }, { header: 'Profile created', key: 'profile', width: 16 }, { header: 'Profile completion', key: 'completion', width: 20 }];
    studentSheet.addRows(roster.map(r => {
        const s = studentByPrn.get(String(r.prn));
        const required = s ? [s.name, s.branch, s.class, s.year, s.cgpa_overall, s.resume_url, s.activities] : [];
        return { prn: r.prn, name: r.name, branch: r.branch, class: r.class, year: r.year, login_ready: r.dob ? 'Yes' : 'No', profile: s ? 'Yes' : 'No', completion: s ? `${Math.round(required.filter(Boolean).length / 7 * 100)}%` : '0%' };
    }));
    style(studentSheet);
    studentSheet.getColumn('prn').numFmt = '@';
    const access = workbook.addWorksheet('Feature access');
    access.columns = [{ header: 'Feature', key: 'feature', width: 34 }, { header: 'Super Admin', key: 'super_admin', width: 18 }, { header: 'Admin', key: 'admin', width: 18 }, { header: 'TPC Observer', key: 'observer', width: 18 }, { header: 'Student', key: 'student', width: 18 }];
    access.addRows([['Student profiles', 'Full control', 'Full control', 'Read only', 'Own profile'], ['Roster import / undo', 'Full control', 'Full control', 'No access', 'No access'], ['Placement drives', 'Approve + control', 'Create + control', 'Read only', 'Eligible drives'], ['Applications', 'Full control', 'Full control', 'Read only', 'Own applications'], ['Notifications', 'Send + analytics', 'Send + analytics', 'Read only', 'Receive + read'], ['Reports', 'All reports', 'Operational reports', 'Read only', 'Own dashboard'], ['Staff accounts', 'Full control', 'No access', 'No access', 'No access'], ['Security intelligence', 'Full control', 'Limited', 'No access', 'No access'], ['Backups / restore', 'Full control', 'No access', 'No access', 'No access'], ['Audit history', 'Full access', 'Full access', 'No access', 'No access']].map(r => ({ feature: r[0], super_admin: r[1], admin: r[2], observer: r[3], student: r[4] })));
    style(access);
    const summary = workbook.addWorksheet('Summary');
    summary.addRows([['AIT Login and Feature Access Report'], ['Generated', new Date().toISOString()], ['Staff logins', authUsers.length], ['Super Admins', profiles.filter(p => p.role === 'super_admin').length], ['Admins', profiles.filter(p => p.role === 'admin').length], ['TPC observers', profiles.filter(p => p.role === 'observer').length], ['Roster logins', roster.length], ['Student profiles', students.length]]);
    summary.getColumn(1).width = 28;
    summary.getColumn(2).width = 32;
    const buffer = await workbook.xlsx.writeBuffer();
    await db.logAudit('access_login_report_export', 'reports', null, { staff: authUsers.length, roster: roster.length, students: students.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="AIT-login-feature-access-report.xlsx"');
    res.send(Buffer.from(buffer));
});

module.exports = router;
