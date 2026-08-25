const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../config/database');
const { authenticateAdmin, authenticateObserver } = require('../middleware/auth');
const { BRANCHES } = require('../config/branches');

const CHECKS = [
    ['name', 'Name'], ['branch', 'Branch'], ['class', 'Class'], ['year', 'Year'],
    ['photo', 'Photo'], ['email', 'Email'], ['phone', 'Phone'],
    ['ssc', 'SSC %'], ['hsc', 'HSC %'], ['cgpa', 'Overall CGPA'], ['backlogs', 'Backlog declaration'],
    ['resume', 'Resume'], ['activities', 'Activities'], ['skills', 'Skills'], ['internship', 'Internship'],
    ['certificate', 'Certificate'], ['project', 'Project'], ['research', 'Research paper']
];
const text = value => typeof value === 'string' && value.trim().length > 0;
const scoreInRange = (value, min, max, allowZero = true) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= (allowZero ? min : Math.max(min, Number.EPSILON)) && Number(value) <= max;
const validBacklogs = value => {
    const entries = Object.entries(value || {});
    return entries.length > 0 && entries.every(([key, count]) => /^sem[1-8]$/.test(key) && Number.isInteger(Number(count)) && Number(count) >= 0 && Number(count) <= 20);
};

function completionRow(row) {
    const status = {
        name: text(row.name),
        branch: BRANCHES.some(branch => branch.code === row.branch),
        class: text(row.class), year: text(row.year), photo: text(row.avatar_path),
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email || '')),
        phone: /^\+?[0-9]{7,15}$/.test(String(row.phone || '')),
        ssc: scoreInRange(row.ssc_marks, 0, 100), hsc: scoreInRange(row.hsc_marks, 0, 100),
        cgpa: scoreInRange(row.cgpa_overall, 0, 10, false), backlogs: validBacklogs(row.backlogs_semesterwise),
        resume: text(row.resume_url), activities: text(row.activities), skills: Boolean(row.has_skills),
        internship: Boolean(row.has_internship), certificate: Boolean(row.has_certificate),
        project: Boolean(row.has_project), research: Boolean(row.has_research)
    };
    const employmentApplicable = row.is_employed === true;
    const employment = !employmentApplicable || [row.employment_type, row.org_type, row.company_name, row.company_address].every(text);
    const checks = [...CHECKS.map(([key, label]) => ({ key, label, present: status[key] }))];
    if (employmentApplicable) checks.push({ key: 'employment', label: 'Employment details', present: employment });
    const missing = checks.filter(check => !check.present).map(check => check.label);
    return { prn: String(row.prn || ''), name: row.name || '', branch: row.branch || '', year: row.year || '', profile_active: Boolean(row.profile_active), status, employmentApplicable, employment, completion: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

async function localSource(branch, year) {
    const [roster, students, skills, internships, certificates, projects, papers] = await Promise.all([
        db.select('roster'), db.select('students'), db.select('student_skills'), db.select('internships'),
        db.select('certificates'), db.select('student_projects'), db.select('research_papers')
    ]);
    const studentByPrn = new Map(students.map(student => [String(student.prn), student]));
    const ids = rows => new Set(rows.map(row => row.student_id));
    const skillIds = ids(skills), internshipIds = ids(internships), certificateIds = ids(certificates), projectIds = ids(projects), researchIds = ids(papers);
    return roster.filter(row => (!branch || branch === 'all' || row.branch === branch) && (!year || year === 'all' || row.year === year)).map(row => {
        const student = studentByPrn.get(String(row.prn));
        return { ...row, ...(student || {}), prn: row.prn, name: row.name, branch: row.branch, class: row.class, year: row.year, profile_active: Boolean(student), has_skills: skillIds.has(student?.id), has_internship: internshipIds.has(student?.id), has_certificate: certificateIds.has(student?.id), has_project: projectIds.has(student?.id), has_research: researchIds.has(student?.id) };
    });
}

async function reportRows(query) {
    const branch = String(query.branch || 'all');
    const year = String(query.year || 'all');
    let source;
    if (db.isLocal()) source = await localSource(branch, year);
    else {
        const { data, error } = await db.supabaseClient().rpc('profile_completion_report', { filter_branch: branch === 'all' ? null : branch, filter_year: year === 'all' ? null : year });
        if (error) throw error;
        source = data || [];
    }
    return source.map(completionRow).sort((a, b) => a.name.localeCompare(b.name) || a.prn.localeCompare(b.prn));
}

function createRouter(authenticate, auditActor) {
    const router = express.Router();
    router.use(authenticate);
    router.get('/', async (req, res) => {
        const rows = await reportRows(req.query);
        res.json({ success: true, data: { checks: CHECKS.map(([, label]) => label), count: rows.length, rows } });
    });
    router.get('/excel', async (req, res) => {
        const rows = await reportRows(req.query);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'AIT Placement Portal';
        const sheet = workbook.addWorksheet('Profile Completion', { views: [{ state: 'frozen', ySplit: 1, xSplit: 5 }] });
        sheet.columns = [
            { header: 'PRN', key: 'prn', width: 20 }, { header: 'Name', key: 'student_name', width: 28 }, { header: 'Branch', key: 'branch', width: 12 }, { header: 'Year', key: 'year', width: 16 },
            { header: 'Completion %', key: 'completion', width: 15 }, { header: 'Missing Count', key: 'missing_count', width: 15 }, { header: 'Missing Items', key: 'missing', width: 55 },
            ...CHECKS.map(([key, label]) => ({ header: label, key, width: Math.max(12, label.length + 3) })),
            { header: 'Employment Details', key: 'employment', width: 20 }
        ];
        rows.forEach(row => sheet.addRow({ prn: row.prn, student_name: row.name, branch: row.branch, year: row.year, completion: row.completion, missing_count: row.missing.length, missing: row.missing.join(', ') || 'Complete', ...Object.fromEntries(CHECKS.map(([key]) => [key, row.status[key] ? 'Yes' : 'No'])), employment: row.employmentApplicable ? (row.employment ? 'Yes' : 'No') : 'N/A' }));
        sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}${Math.max(1, sheet.rowCount)}` };
        const header = sheet.getRow(1); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174A3A' } }; header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        sheet.getColumn('prn').numFmt = '@'; sheet.getColumn('completion').numFmt = '0"%"';
        sheet.eachRow((row, number) => { if (number > 1) { row.alignment = { vertical: 'top', wrapText: true }; row.height = 30; } });
        await db.logAudit('profile_completion_export', 'students', null, { actor: auditActor(req), rowCount: rows.length, branch: req.query.branch || 'all', year: req.query.year || 'all' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="profile_completion.xlsx"');
        await workbook.xlsx.write(res); res.end();
    });
    return router;
}

module.exports = {
    admin: createRouter(authenticateAdmin, req => req.admin.adminId),
    observer: createRouter(authenticateObserver, req => req.observer.observerId),
    CHECKS, completionRow, reportRows
};
