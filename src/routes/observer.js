const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateObserver } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { BRANCHES, branchName } = require('../config/branches');
const { normalizeStudentDob } = require('../utils/dateHelper');
const { calculateProfileCompletion } = require('../utils/profileCompletionModel');
const { createStudentNotification } = require('../services/incompleteProfilePush');

const router = express.Router();
router.use(authenticateObserver);
router.post('/register-student', require('../services/studentRegistration').registerStudent);

async function buildStudentDirectory(query = {}, paging = null) {
    let students;
    let count;
    if (!db.isLocal()) {
        let request = db.supabaseClient().from('students').select('*', { count: 'exact' });
        if (query.branch && query.branch !== 'all') request = request.eq('branch', String(query.branch).toUpperCase());
        if (query.year && query.year !== 'all') request = request.eq('year', query.year);
        if (query.search) {
            const term = String(query.search).trim().replace(/[%_,()]/g, '');
            if (term) request = request.or(`name.ilike.%${term}%,prn.ilike.%${term}%,branch.ilike.%${term}%,class.ilike.%${term}%,year.ilike.%${term}%`);
        }
        if (paging) request = request.range(paging.start, paging.end);
        const result = await request.order('name', { ascending: true });
        if (result.error) throw result.error;
        students = result.data || [];
        count = result.count || 0;
    } else {
        students = filterRows(await db.select('students'), query);
        count = students.length;
        if (paging) students = students.slice(paging.start, paging.end + 1);
    }
    const studentIds = students.map(student => student.id);
    const studentIdSet = new Set(studentIds);
    const related = async table => {
        if (!studentIds.length) return [];
        if (db.isLocal()) return (await db.select(table)).filter(row => studentIdSet.has(row.student_id));
        const { data, error } = await db.supabaseClient().from(table).select('*').in('student_id', studentIds);
        if (error) throw error;
        return data || [];
    };
    const [internships, certificates, projects, researchPapers, diploma, skills, declarations, competitions] = await Promise.all([
        related('internships'), related('certificates'), related('student_projects'),
        related('research_papers'), related('diploma'), related('student_skills'),
        related('student_profile_declarations'), related('student_competitions')
    ]);
    const groupByStudent = rows => rows.reduce((map, row) => {
        const list = map.get(row.student_id) || [];
        list.push(row);
        map.set(row.student_id, list);
        return map;
    }, new Map());
    const internshipMap = groupByStudent(internships);
    const certificateMap = groupByStudent(certificates);
    const projectMap = groupByStudent(projects);
    const researchMap = groupByStudent(researchPapers);
    const skillMap = groupByStudent(skills);
    const competitionMap = groupByStudent(competitions);
    const diplomaMap = new Map(diploma.map(item => [item.student_id, item]));
    const declarationMap = new Map(declarations.map(item => [item.student_id, item]));
    const rows = students.map(student => {
        const studentInternships = internshipMap.get(student.id) || [];
        const studentCertificates = certificateMap.get(student.id) || [];
        const studentProjects = projectMap.get(student.id) || [];
        const studentResearch = researchMap.get(student.id) || [];
        const studentCompetitions = competitionMap.get(student.id) || [];
        const studentSkills = (skillMap.get(student.id) || []).map(item => item.skill);
        const studentDiploma = diplomaMap.get(student.id) || null;
        const profileCompletion = calculateProfileCompletion({
            student,
            diploma: studentDiploma,
            skills: studentSkills,
            internships: studentInternships,
            certificates: studentCertificates,
            projects: studentProjects,
            research_papers: studentResearch,
            competitions: studentCompetitions,
            declarations: declarationMap.get(student.id) || {}
        });
        return {
            ...student,
            internships: studentInternships,
            certificates: studentCertificates,
            projects: studentProjects,
            research_papers: studentResearch,
            competitions: studentCompetitions,
            diploma: studentDiploma,
            skills: studentSkills,
            profile_completion: profileCompletion
        };
    });
    return { rows, count };
}

function filterRows(rows, query) {
    let filtered = rows;
    if (query.branch && query.branch !== 'all') {
        filtered = filtered.filter(row => String(row.branch || '').toUpperCase() === String(query.branch).toUpperCase());
    }
    if (query.year && query.year !== 'all') filtered = filtered.filter(row => String(row.year || '').toLowerCase() === String(query.year).toLowerCase());
    if (query.search) {
        const term = String(query.search).trim().toLowerCase();
        filtered = filtered.filter(row => [row.prn, row.name, row.branch, row.class, row.year]
            .some(value => String(value || '').toLowerCase().includes(term)));
    }
    return filtered;
}

router.get('/overview', async (req, res) => {
    const [roster, students, drives] = await Promise.all([
        db.select('roster'), buildStudentDirectory(), db.select('placement_drives')
    ]);
    const studentRows = students.rows;
    const rosterPrns = new Set(studentRows.map(student => student.prn));
    const byBranch = BRANCHES.map(branch => {
        const branchRoster = roster.filter(row => row.branch === branch.code).length;
        const profiles = studentRows.filter(row => row.branch === branch.code);
        return {
            code: branch.code, name: branch.name, roster: branchRoster, profiles: profiles.length,
            resumes: profiles.filter(row => row.resume_url).length,
            averageCgpa: profiles.length ? Number((profiles.reduce((sum, row) => sum + (Number(row.cgpa_overall) || 0), 0) / profiles.length).toFixed(2)) : 0
        };
    });
    res.json({ success: true, data: {
        observer: req.observer,
        totals: {
            roster: roster.length, profiles: studentRows.length,
            pendingProfiles: roster.filter(row => !rosterPrns.has(row.prn)).length,
            resumes: studentRows.filter(row => row.resume_url).length,
            internships: studentRows.reduce((sum, row) => sum + row.internships.length, 0),
            certificates: studentRows.reduce((sum, row) => sum + row.certificates.length, 0),
            projects: studentRows.reduce((sum, row) => sum + row.projects.length, 0),
            researchPapers: studentRows.reduce((sum, row) => sum + row.research_papers.length, 0),
            activeDrives: drives.filter(drive => drive.status === 'open').length
        },
        branches: byBranch
    } });
});

router.get('/students', async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const start = (page - 1) * pageSize;
    const directory = await buildStudentDirectory(req.query, { start, end: start + pageSize - 1 });
    res.json({ success: true, data: {
        count: directory.count, page, pageSize, totalPages: Math.max(1, Math.ceil(directory.count / pageSize)),
        students: directory.rows
    } });
});

const correctionSchema = z.object({
    fields: z.array(z.enum(['Personal details','Contact details','Academic / CGPA','Backlogs','Resume','Skills','Internships','Certificates','Projects','Research papers','Activities'])).min(1).max(11).transform(values => [...new Set(values)]),
    message: z.string().trim().min(5).max(1000)
}).strict();

router.post('/students/:id/corrections', validate(correctionSchema), async (req, res) => {
    const student = await db.selectOne('students', { id: req.params.id });
    if (!student) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } });
    const open = await db.select('correction_requests', { student_id: student.id, status: 'open' });
    const openFields = new Set(open.map(item => String(item.field_name).toLowerCase()));
    const fields = req.body.fields.filter(field => !openFields.has(field.toLowerCase()));
    const created = await Promise.all(fields.map(field => db.insert('correction_requests', {
        student_id: student.id, field_name: field, message: req.body.message, status: 'open',
        created_by: req.observer.observerId, created_at: new Date().toISOString()
    })));
    if (created.length) {
        await createStudentNotification({ student_id: student.id, audience: 'student', branches: [], title: 'Profile correction requested', message: `${fields.join(', ')}: ${req.body.message}`, priority: 'important', action_url: '/dashboard?tab=opportunities' });
        await db.logAudit('observer_correction_request', 'students', student.id, { observer_id: req.observer.observerId, fields, skipped: req.body.fields.length - fields.length });
    }
    return res.status(created.length ? 201 : 200).json({ success: true, data: created, created: created.length, skipped: req.body.fields.length - fields.length });
});

router.get('/roster', async (req, res) => {
    const [roster, students] = await Promise.all([db.select('roster'), db.select('students')]);
    const studentPrns = new Set(students.map(student => student.prn));
    const rows = filterRows(roster.map(row => ({ ...row, profileCompleted: studentPrns.has(row.prn) })), req.query);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const start = (page - 1) * pageSize;
    res.json({ success: true, data: { count: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)), rows: rows.slice(start, start + pageSize) } });
});

router.get('/students/:id/resume', async (req, res) => {
    const student = await db.selectOne('students', { id: req.params.id });
    if (!student?.resume_url) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resume not uploaded.' } });
    if (db.isLocal()) return res.status(503).json({ success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Resume storage requires Supabase.' } });
    const { data, error } = await db.supabaseClient().storage.from('resumes').createSignedUrl(student.resume_url, 300);
    if (error) throw error;
    res.json({ success: true, data: { url: data.signedUrl, expires_in: 300 } });
});

router.get('/students/:id/resume/open', async (req, res) => {
    const student = await db.selectOne('students', { id: req.params.id });
    if (!student?.resume_url) return res.status(404).send('Resume not uploaded.');
    if (db.isLocal()) return res.status(503).send('Resume storage requires Supabase.');
    const { data, error } = await db.supabaseClient().storage.from('resumes').createSignedUrl(student.resume_url, 300);
    if (error) throw error;
    return res.redirect(302, data.signedUrl);
});

router.get('/drives', async (req, res) => {
    const [drives, criteria, matches, shortlists] = await Promise.all([
        db.select('placement_drives'), db.select('drive_criteria'), db.select('drive_matches'), db.select('shortlists')
    ]);
    const data = drives.map(drive => ({
        ...drive,
        criteria: criteria.find(item => item.drive_id === drive.id) || null,
        matches: matches.filter(item => item.drive_id === drive.id).length,
        eligible: matches.filter(item => item.drive_id === drive.id && item.eligible).length,
        shortlisted: shortlists.filter(item => item.drive_id === drive.id && item.status === 'shortlisted').length
    })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json({ success: true, data });
});

const adminStudentsRouter = require('./adminStudents');

router.get('/dob-corrections', async (req, res) => {
    try {
        const dept = req.observer.department;
        const rows = await db.select('dob_corrections', { department: dept });
        res.json({ success: true, data: rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch DOB corrections.' });
    }
});

router.post('/dob-corrections/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const dept = req.observer.department;
        const correction = await db.selectOne('dob_corrections', { id, department: dept });
        if (!correction) return res.status(404).json({ success: false, error: 'Request not found in your department.' });
        if (correction.status !== 'pending') return res.status(400).json({ success: false, error: 'Request already processed.' });

        const formattedDob = normalizeStudentDob(correction.submitted_dob);
        if (!formattedDob) return res.status(400).json({ success: false, error: 'Correction contains an invalid DOB.' });

        const rosterEntry = await db.selectOne('roster', { prn: correction.prn, branch: dept });
        if (rosterEntry) {
            await db.update('roster', { prn: correction.prn }, { dob: formattedDob });
        }

        await db.update('dob_corrections', { id }, {
            status: 'approved',
            processed_at: new Date().toISOString(),
            processed_by: req.observer.observerId
        });

        await db.logAudit('observer_dob_correction_approve', 'dob_corrections', id, {
            prn: correction.prn,
            newDob: formattedDob,
            processedBy: req.observer.observerId
        });

        if (adminStudentsRouter.clearStudentCache) {
            await adminStudentsRouter.clearStudentCache();
        }

        res.json({ success: true, message: 'DOB correction request approved and updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to approve request.' });
    }
});

router.post('/dob-corrections/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const dept = req.observer.department;
        const correction = await db.selectOne('dob_corrections', { id, department: dept });
        if (!correction) return res.status(404).json({ success: false, error: 'Request not found in your department.' });
        if (correction.status !== 'pending') return res.status(400).json({ success: false, error: 'Request already processed.' });

        await db.update('dob_corrections', { id }, {
            status: 'rejected',
            processed_at: new Date().toISOString(),
            processed_by: req.observer.observerId
        });

        await db.logAudit('observer_dob_correction_reject', 'dob_corrections', id, {
            prn: correction.prn,
            processedBy: req.observer.observerId
        });

        res.json({ success: true, message: 'DOB correction request rejected.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to reject request.' });
    }
});

router.get('/branches', (req, res) => res.json({ success: true, data: BRANCHES.map(branch => ({ ...branch, label: `${branch.code} - ${branchName(branch.code)}` })) }));

module.exports = router;