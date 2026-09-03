const express = require('express');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const multer = require('multer');
const { z } = require('zod');
const { validate } = require('../middleware/security');
const { normalizeTerm } = require('../utils/matching');
const { BRANCHES } = require('../config/branches');
const { acceptAvatar, uploadAvatar, getAvatar, deleteAvatar } = require('../utils/avatar');
const { extractSkillsFromPdf, scoreResumeAts } = require('../utils/pdfSkillExtractor');
const { configuredThreshold } = require('../services/incompleteProfilePush');

const router = express.Router();

// Apply authentication middleware to all student routes
router.use(authenticateStudent);
const adminStudentsRouter = require('./adminStudents');
router.use((req, res, next) => {
    res.on('finish', () => {
        if (req.method !== 'GET' && res.statusCode >= 200 && res.statusCode < 300) {
            if (adminStudentsRouter.clearStudentCache) adminStudentsRouter.clearStudentCache();
        }
    });
    next();
});
const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const pushSubscriptionSchema = z.object({
    endpoint: z.string().url().max(2048).refine(value => value.startsWith('https://'), 'Push endpoint must use HTTPS.'),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(256) }).strict()
}).strict();

router.get('/push/config', async (req, res) => {
    const subscriptions = await db.select('student_push_subscriptions', { student_id: req.student.studentId });
    res.json({ success: true, data: { publicKey: process.env.VAPID_PUBLIC_KEY || '', threshold: configuredThreshold(), subscribed: subscriptions.length > 0 } });
});

router.post('/push/subscriptions', validate(pushSubscriptionSchema), async (req, res) => {
    const existing = await db.selectOne('student_push_subscriptions', { endpoint: req.body.endpoint });
    if (existing && existing.student_id !== req.student.studentId) return res.status(409).json({ success: false, error: { code: 'SUBSCRIPTION_CONFLICT', message: 'Push subscription belongs to another session.' } });
    const now = new Date().toISOString();
    const saved = existing
        ? await db.update('student_push_subscriptions', { id: existing.id }, { subscription: req.body, updated_at: now, last_error: null })
        : await db.insert('student_push_subscriptions', { student_id: req.student.studentId, endpoint: req.body.endpoint, subscription: req.body, created_at: now, updated_at: now });
    res.status(existing ? 200 : 201).json({ success: true, data: { id: saved.id, subscribed: true } });
});

const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 1, parts: 2, fieldNestingDepth: 0, fieldArrayIndexLimit: 0 } });
function acceptResume(req, res, next) {
    resumeUpload.single('resume')(req, res, err => {
        if (err?.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, error: { code: 'PDF_TOO_LARGE', message: 'Resume PDF must be 2 MB or smaller.' } });
        }
        if (err) return next(err);
        return next();
    });
}

/**
 * @route   GET /api/student/profile
 * @desc    Fetch complete profile, internships, certificates, and diploma details for logged in student
 * @access  Private
 */
router.get('/profile', async (req, res) => {
    try {
        const studentId = req.student.studentId;

        // Fetch student record and sections in parallel to reduce database network roundtrips to 1
        const [student, internships, certificates, projects, researchPapers, diploma, skills] = await Promise.all([
            db.selectOne('students', { id: studentId }),
            db.select('internships', { student_id: studentId }),
            db.select('certificates', { student_id: studentId }),
            db.select('student_projects', { student_id: studentId }),
            db.select('research_papers', { student_id: studentId }),
            db.selectOne('diploma', { student_id: studentId }),
            db.select('student_skills', { student_id: studentId })
        ]);

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        return res.json({
            success: true,
            data: {
                student,
                internships: internships || [],
                certificates: certificates || [],
                projects: projects || [],
                research_papers: researchPapers || [],
                diploma: diploma || null,
                skills: skills || []
            }
        });
    } catch (err) {
        console.error('Error fetching student profile:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to load student profile.' } });
    }
});

router.post('/avatar', acceptAvatar, (req, res) => uploadAvatar(req, res, {
    table: 'students', filter: { id: req.student.studentId }, id: req.student.studentId, folder: 'student'
}));
router.get('/avatar', (req, res) => getAvatar(res, {
    table: 'students', filter: { id: req.student.studentId }, id: req.student.studentId, folder: 'student'
}));
router.delete('/avatar', (_req, res) => res.status(409).json({ success: false, error: { code: 'PROFILE_PHOTO_REQUIRED', message: 'Profile picture is mandatory. Upload a replacement instead.' } }));

const skillsSchema = z.object({ skills: z.array(z.string().trim().min(1).max(60)).max(50) }).strict();
router.put('/skills', validate(skillsSchema), async (req, res) => {
    const studentId = req.student.studentId;
    const normalized = [...new Set(req.body.skills.map(normalizeTerm).filter(Boolean))];
    const saved = await db.replaceStudentSkills(studentId, normalized);
    res.json({ success: true, data: saved });
});

router.post('/resume', acceptResume, async (req, res) => {
    if (!req.file || req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
        return res.status(400).json({ success: false, error: { code: 'INVALID_PDF', message: 'Valid PDF file required.' } });
    }
    if (db.isLocal()) return res.status(503).json({ success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Resume storage requires Supabase.' } });
    const path = `${req.student.studentId}/resume.pdf`;
    const { error } = await db.supabaseClient().storage.from('resumes').upload(path, req.file.buffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    await db.update('students', { id: req.student.studentId }, { resume_url: path, updated_at: new Date().toISOString() });
    res.json({ success: true, data: { uploaded: true } });
});

router.post('/resume/skills/extract', acceptResume, async (req, res) => {
    if (!req.file || req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
        return res.status(400).json({ success: false, error: { code: 'INVALID_PDF', message: 'Choose a valid text-based PDF resume.' } });
    }
    try {
        const result = await extractSkillsFromPdf(req.file.buffer);
        if (!result.suggestions.length) return res.status(422).json({ success: false, error: { code: 'NO_SKILLS_FOUND', message: 'No recognized skills found. Scanned-image PDFs need OCR; add skills manually.' } });
        res.json({ success: true, data: result });
    } catch (error) {
        const pageLimit = /10 pages/i.test(error.message || '');
        res.status(422).json({ success: false, error: { code: pageLimit ? 'PDF_TOO_LONG' : 'PDF_TEXT_UNREADABLE', message: pageLimit ? error.message : 'Could not read text from this PDF. Export it as a text-based PDF or add skills manually.' } });
    }
});

/**
 * @route POST /api/student/resume/ats-score
 * @desc Compute an ATS score for the resume against a selected profile
 */
router.post('/resume/ats-score', acceptResume, async (req, res) => {
    try {
        if (!req.file || !req.file.buffer || req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_PDF', message: 'Valid PDF file required.' } });
        }
        
        const profile = req.body.profile || 'software';
        const result = await scoreResumeAts(req.file.buffer, profile);
        
        if (!db.isLocal()) {
            const path = `${req.student.studentId}/resume.pdf`;
            const { error } = await db.supabaseClient().storage.from('resumes').upload(path, req.file.buffer, { contentType: 'application/pdf', upsert: true });
            if (!error) {
                await db.update('students', { id: req.student.studentId }, { resume_url: path, updated_at: new Date().toISOString() });
            }
        }
        
        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('ATS Scorer Error:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to score resume.' } });
    }
});

router.get('/resume', async (req, res) => {
    const student = await db.selectOne('students', { id: req.student.studentId });
    if (!student?.resume_url) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resume not uploaded.' } });
    const { data, error } = await db.supabaseClient().storage.from('resumes').createSignedUrl(student.resume_url, 300);
    if (error) throw error;
    res.json({ success: true, data: { url: data.signedUrl, expires_in: 300 } });
});

router.delete('/resume', async (req, res) => {
    const student = await db.selectOne('students', { id: req.student.studentId });
    if (student?.resume_url && !db.isLocal()) await db.supabaseClient().storage.from('resumes').remove([student.resume_url]);
    await db.update('students', { id: req.student.studentId }, { resume_url: null, updated_at: new Date().toISOString() });
    res.json({ success: true, data: { removed: true } });
});

/**
 * @route   PUT /api/student/profile
 * @desc    Update student basic information, overall CGPA, sem-wise CGPA, activities, resume URL
 * @access  Private
 */
const score = z.coerce.number().min(0).max(10);
const profileSchema = z.object({
    name: z.string().trim().min(1).max(150), email: z.string().email().max(254),
    phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Use 7 to 15 digits, with optional +.'), branch: z.enum(BRANCHES.map(branch => branch.code)),
    year: z.string().trim().min(1).max(50),
    ssc_marks: z.union([z.string(), z.number()]).optional().transform(v => (v === "" || v === null || v === undefined) ? null : Number(v)),
    hsc_marks: z.union([z.string(), z.number()]).optional().transform(v => (v === "" || v === null || v === undefined) ? null : Number(v)),
    is_employed: z.boolean().optional(),
    employment_type: z.enum(['Govt', 'Private']).optional(),
    org_type: z.enum(['Startup', 'MNC', 'PSU', 'Govt', 'SMB', 'Other']).optional(),
    current_ctc: z.coerce.number().min(0).max(999.99).optional(),
    company_address: z.string().trim().max(1000).optional(),
    company_name: z.string().trim().max(200).optional(),
    hr_name: z.string().trim().max(100).optional(),
    hr_number: z.string().trim().max(50).optional(),
    cgpa_overall: score,
    cgpa_semesterwise: z.record(z.string(), score).refine(value => Object.keys(value).every(key => /^sem[1-8]$/.test(key)), 'Invalid semester.'),
    backlogs_semesterwise: z.record(z.string(), z.coerce.number().int().min(0).max(20)).refine(value => Object.keys(value).every(key => /^sem[1-8]$/.test(key)), 'Invalid backlog semester.'),
    activities: z.string().trim().max(5000), resume_url: z.string().optional(),
    lateral_entry: z.boolean(), complete_profile: z.boolean()
}).partial().strict();
router.put('/profile', validate(profileSchema), async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const {
            name,
            email,
            phone,
            branch,
            year,
            ssc_marks,
            hsc_marks,
            is_employed,
            employment_type,
            org_type,
            current_ctc,
            company_address,
            company_name,
            hr_name,
            hr_number,
            cgpa_overall,
            cgpa_semesterwise,
            backlogs_semesterwise,
            activities,
            resume_url,
            lateral_entry,
            complete_profile
        } = req.body;

        const currentStudent = await db.selectOne('students', { id: studentId });
        if (!currentStudent) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student record not found.' } });
        if (complete_profile) {
            const finalEmail = email === undefined ? currentStudent.email : email;
            const finalPhone = phone === undefined ? currentStudent.phone : phone;
            const finalSsc = ssc_marks === undefined ? currentStudent.ssc_marks : ssc_marks;
            const finalHsc = hsc_marks === undefined ? currentStudent.hsc_marks : hsc_marks;
            if (!currentStudent.avatar_path || !finalEmail || !finalPhone || finalSsc === undefined || finalSsc === null || finalHsc === undefined || finalHsc === null) {
                return res.status(422).json({ success: false, error: { code: 'PROFILE_INCOMPLETE', message: 'Profile picture, contact email, mobile number, SSC and HSC marks are required.' } });
            }
            const finalIsEmployed = is_employed === undefined ? currentStudent.is_employed : is_employed;
            if (finalIsEmployed) {
                const finalOrgType = org_type === undefined ? currentStudent.org_type : org_type;
                const finalCompanyAddr = company_address === undefined ? currentStudent.company_address : company_address;
                const finalCompany = company_name === undefined ? currentStudent.company_name : company_name;
                const finalEmpType = employment_type === undefined ? currentStudent.employment_type : employment_type;
                if (!finalOrgType || !finalCompanyAddr || !finalCompany || !finalEmpType) {
                    return res.status(422).json({ success: false, error: { code: 'PROFILE_INCOMPLETE', message: 'Employment details (Type, Org Type, Company Name, and Address) are required if employed.' } });
                }
            }
        }

        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email.toLowerCase();
        if (phone !== undefined) updateData.phone = phone;
        // Branch, class and academic year are college-owned roster assignments.
        // Student payload values are accepted for backward compatibility but never trusted.
        const rosterAssignment = await db.selectOne('roster', { prn: currentStudent.prn });
        if (rosterAssignment) {
            updateData.branch = rosterAssignment.branch;
            updateData.class = rosterAssignment.class;
            updateData.year = rosterAssignment.year;
        }
        if (ssc_marks !== undefined) updateData.ssc_marks = ssc_marks === null || ssc_marks === "" || Number.isNaN(parseFloat(ssc_marks)) ? null : parseFloat(ssc_marks);
        if (hsc_marks !== undefined) updateData.hsc_marks = hsc_marks === null || hsc_marks === "" || Number.isNaN(parseFloat(hsc_marks)) ? null : parseFloat(hsc_marks);
        if (is_employed !== undefined) {
            updateData.is_employed = is_employed;
            if (!is_employed) {
                updateData.employment_type = null;
                updateData.org_type = null;
                updateData.current_ctc = null;
                updateData.company_address = null;
                updateData.company_name = null;
                updateData.hr_name = null;
                updateData.hr_number = null;
            }
        }
        if (employment_type !== undefined) updateData.employment_type = employment_type;
        if (org_type !== undefined) updateData.org_type = org_type;
        if (current_ctc !== undefined) updateData.current_ctc = parseFloat(current_ctc) || null;
        if (company_address !== undefined) updateData.company_address = company_address;
        if (company_name !== undefined) updateData.company_name = company_name;
        if (hr_name !== undefined) updateData.hr_name = hr_name;
        if (hr_number !== undefined) updateData.hr_number = hr_number;
        if (cgpa_overall !== undefined) updateData.cgpa_overall = parseFloat(cgpa_overall) || 0;
        if (lateral_entry !== undefined) updateData.lateral_entry = lateral_entry;
        if (cgpa_semesterwise !== undefined) {
            const normalizedSemesterScores = { ...cgpa_semesterwise };
            if (lateral_entry === true || (lateral_entry === undefined && currentStudent.lateral_entry)) {
                normalizedSemesterScores.sem1 = 0;
                normalizedSemesterScores.sem2 = 0;
            }
            updateData.cgpa_semesterwise = normalizedSemesterScores;
            const semesterScores = Object.values(normalizedSemesterScores).map(Number).filter(value => Number.isFinite(value) && value > 0);
            updateData.cgpa_overall = semesterScores.length ? Number((semesterScores.reduce((sum, value) => sum + value, 0) / semesterScores.length).toFixed(2)) : 0;
        }
        if (backlogs_semesterwise !== undefined) updateData.backlogs_semesterwise = backlogs_semesterwise;
        if (activities !== undefined) updateData.activities = activities;
        // Resume path is managed only by private Storage endpoints.

        const updatedStudent = await db.update('students', { id: studentId }, updateData);

        return res.json({
            success: true,
            message: 'Student profile updated successfully!',
            student: updatedStudent
        });
    } catch (err) {
        console.error('Error updating student profile:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to update student profile.' } });
    }
});

/* ==========================================================================
   INTERNSHIPS CRUD
   ========================================================================== */

/**
 * @route   POST /api/student/internships
 * @desc    Add a new internship record
 */
const internshipSchema = z.object({
    company: z.string().trim().min(1).max(150), role: z.string().trim().min(1).max(150),
    start_date: z.string().date(), end_date: z.string().date().nullable().optional(), mode: z.enum(['online', 'offline']).default('offline')
}).refine(value => !value.end_date || value.end_date >= value.start_date, { message: 'End date cannot be before start date.' });
router.post('/internships', validate(internshipSchema), async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const { company, role, start_date, end_date, mode } = req.body;

        if (!company || !role || !start_date) {
            return res.status(400).json({
                success: false,
                error: 'Company, role, and start date are required fields.'
            });
        }

        const newInternship = await db.insert('internships', {
            student_id: studentId,
            company: company.trim(),
            role: role.trim(),
            start_date,
            end_date: end_date || null,
            mode: mode === 'online' ? 'online' : 'offline'
        });

        return res.json({
            success: true,
            message: 'Internship record added successfully!',
            internship: newInternship
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to save internship.' } });
    }
});

/**
 * @route   PUT /api/student/internships/:id
 * @desc    Update an existing internship record
 */
router.put('/internships/:id', validate(internshipSchema), async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const internshipId = req.params.id;
        const { company, role, start_date, end_date, mode } = req.body;

        const existing = await db.selectOne('internships', { id: internshipId, student_id: studentId });
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Internship record not found.' });
        }

        const updated = await db.update('internships', { id: internshipId }, {
            company: company !== undefined ? company : existing.company,
            role: role !== undefined ? role : existing.role,
            start_date: start_date !== undefined ? start_date : existing.start_date,
            end_date: end_date !== undefined ? end_date : existing.end_date,
            mode: mode !== undefined ? mode : existing.mode
        });

        return res.json({ success: true, message: 'Internship updated successfully!', internship: updated });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to update internship.' } });
    }
});

/**
 * @route   DELETE /api/student/internships/:id
 * @desc    Delete an internship record
 */
router.delete('/internships/:id', async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const internshipId = req.params.id;

        await db.delete('internships', { id: internshipId, student_id: studentId });
        return res.json({ success: true, message: 'Internship deleted successfully.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to delete internship.' } });
    }
});

/* ==========================================================================
   CERTIFICATES CRUD
   ========================================================================== */

/**
 * @route   POST /api/student/certificates
 * @desc    Add a new certificate record
 */
const certificateSchema = z.object({
    name: z.string().trim().min(1).max(150), issuer: z.string().trim().min(1).max(150),
    date: z.string().date().refine(value => value <= new Date().toISOString().slice(0, 10), 'Certificate date cannot be in future.'),
    mode: z.enum(['online', 'offline']).default('online')
});
router.post('/certificates', validate(certificateSchema), async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const { name, issuer, date, mode } = req.body;

        if (!name || !issuer || !date) {
            return res.status(400).json({
                success: false,
                error: 'Certificate name, issuer, and date are required.'
            });
        }

        const newCert = await db.insert('certificates', {
            student_id: studentId,
            name: name.trim(),
            issuer: issuer.trim(),
            date,
            mode: mode === 'offline' ? 'offline' : 'online'
        });

        return res.json({
            success: true,
            message: 'Certificate added successfully!',
            certificate: newCert
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to save certificate.' } });
    }
});

/**
 * @route   PUT /api/student/certificates/:id
 * @desc    Update a certificate record
 */
router.put('/certificates/:id', validate(certificateSchema), async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const certId = req.params.id;
        const { name, issuer, date, mode } = req.body;

        const existing = await db.selectOne('certificates', { id: certId, student_id: studentId });
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Certificate record not found.' });
        }

        const updated = await db.update('certificates', { id: certId }, {
            name: name !== undefined ? name : existing.name,
            issuer: issuer !== undefined ? issuer : existing.issuer,
            date: date !== undefined ? date : existing.date,
            mode: mode !== undefined ? mode : existing.mode
        });

        return res.json({ success: true, message: 'Certificate updated successfully!', certificate: updated });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to update certificate.' } });
    }
});

/**
 * @route   DELETE /api/student/certificates/:id
 * @desc    Delete a certificate record
 */
router.delete('/certificates/:id', async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const certId = req.params.id;

        await db.delete('certificates', { id: certId, student_id: studentId });
        return res.json({ success: true, message: 'Certificate deleted successfully.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to delete certificate.' } });
    }
});

/* ==========================================================================
   STUDENT PROJECTS CRUD
   ========================================================================== */

const optionalUrl = z.union([z.literal(''), z.url().max(500)]).optional().transform(value => value || null);
const projectSchema = z.object({
    title: z.string().trim().min(1).max(150),
    summary: z.string().trim().min(1).max(2000),
    technologies: z.string().trim().max(500).optional().default(''),
    project_url: optionalUrl,
    repository_url: optionalUrl,
    completed_on: z.union([z.literal(''), z.string().date(), z.null()]).optional().transform(value => value || null)
}).strict();

router.post('/projects', validate(projectSchema), async (req, res) => {
    const project = await db.insert('student_projects', { student_id: req.student.studentId, ...req.body });
    res.status(201).json({ success: true, message: 'Project added successfully.', project });
});

router.put('/projects/:id', validate(projectSchema), async (req, res) => {
    const existing = await db.selectOne('student_projects', { id: req.params.id, student_id: req.student.studentId });
    if (!existing) return res.status(404).json({ success: false, error: 'Project not found.' });
    const project = await db.update('student_projects', { id: existing.id, student_id: req.student.studentId }, req.body);
    res.json({ success: true, message: 'Project updated successfully.', project });
});

router.delete('/projects/:id', async (req, res) => {
    const existing = await db.selectOne('student_projects', { id: req.params.id, student_id: req.student.studentId });
    if (!existing) return res.status(404).json({ success: false, error: 'Project not found.' });
    await db.delete('student_projects', { id: existing.id, student_id: req.student.studentId });
    res.json({ success: true, message: 'Project deleted successfully.' });
});

/* ==========================================================================
   RESEARCH PAPERS CRUD
   ========================================================================== */
const researchPaperSchema = z.object({
    title: z.string().trim().min(1).max(250), authors: z.string().trim().min(1).max(1000),
    publication: z.string().trim().min(1).max(250), abstract: z.string().trim().min(1).max(3000),
    doi_url: optionalUrl, paper_url: optionalUrl,
    published_on: z.string().date().refine(value => value <= new Date().toISOString().slice(0, 10), 'Publication date cannot be in future.')
}).strict();
router.post('/research-papers', validate(researchPaperSchema), async (req, res) => {
    const researchPaper = await db.insert('research_papers', { student_id: req.student.studentId, ...req.body });
    res.status(201).json({ success: true, message: 'Research paper added successfully.', research_paper: researchPaper });
});
router.put('/research-papers/:id', validate(researchPaperSchema), async (req, res) => {
    const existing = await db.selectOne('research_papers', { id: req.params.id, student_id: req.student.studentId });
    if (!existing) return res.status(404).json({ success: false, error: 'Research paper not found.' });
    const researchPaper = await db.update('research_papers', { id: existing.id, student_id: req.student.studentId }, req.body);
    res.json({ success: true, message: 'Research paper updated successfully.', research_paper: researchPaper });
});
router.delete('/research-papers/:id', async (req, res) => {
    const existing = await db.selectOne('research_papers', { id: req.params.id, student_id: req.student.studentId });
    if (!existing) return res.status(404).json({ success: false, error: 'Research paper not found.' });
    await db.delete('research_papers', { id: existing.id, student_id: req.student.studentId });
    res.json({ success: true, message: 'Research paper deleted successfully.' });
});

/* ==========================================================================
   DIPLOMA DETAILS CRUD (OPTIONAL PER STUDENT)
   ========================================================================== */

/**
 * @route   POST /api/student/diploma
 * @desc    Create or update diploma details
 */
const diplomaSchema = z.object({
    institute: z.string().trim().min(1).max(200), branch: z.string().trim().min(1).max(120),
    year_of_passing: z.string().trim().regex(/^\d{4}$/), percentage_or_cgpa: z.string().trim().min(1).max(30)
}).strict();
router.post('/diploma', validate(diplomaSchema), async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const { institute, branch, year_of_passing, percentage_or_cgpa } = req.body;

        if (!institute || !branch || !year_of_passing || !percentage_or_cgpa) {
            return res.status(400).json({
                success: false,
                error: 'All diploma fields (Institute, Branch, Year of Passing, Percentage/CGPA) are required.'
            });
        }

        const diplomaData = {
            student_id: studentId,
            institute: institute.trim(),
            branch: branch.trim(),
            year_of_passing: year_of_passing.trim(),
            percentage_or_cgpa: percentage_or_cgpa.trim()
        };

        const existing = await db.selectOne('diploma', { student_id: studentId });
        let diplomaRecord;
        if (existing) {
            diplomaRecord = await db.update('diploma', { student_id: studentId }, diplomaData);
        } else {
            diplomaRecord = await db.insert('diploma', diplomaData);
        }

        return res.json({
            success: true,
            message: 'Diploma details saved successfully!',
            diploma: diplomaRecord
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to save diploma.' } });
    }
});

/**
 * @route   DELETE /api/student/diploma
 * @desc    Remove diploma details
 */
router.delete('/diploma', async (req, res) => {
    try {
        const studentId = req.student.studentId;
        await db.delete('diploma', { student_id: studentId });
        return res.json({ success: true, message: 'Diploma details removed.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to delete diploma.' } });
    }
});

/**
 * @route GET /api/student/drives
 * @desc Get available placement drives
 */
router.get('/drives', async (req, res) => {
    try {
        const drives = await db.select('placement_drives', { status: 'open' });
        
        // Also fetch user's applications
        const apps = await db.select('drive_applications', { student_id: req.student.studentId });
        const appliedDriveIds = apps.map(a => a.drive_id);
        
        const data = drives.map(d => ({
            ...d,
            applied: appliedDriveIds.includes(d.id)
        }));
        
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ success: false, error: { message: 'Failed to fetch drives.' } });
    }
});

/**
 * @route POST /api/student/drives/:id/apply
 * @desc Apply to a placement drive
 */
router.post('/drives/:id/apply', async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const driveId = req.params.id;
        
        const existing = await db.selectOne('drive_applications', { drive_id: driveId, student_id: studentId });
        if (existing) return res.status(400).json({ success: false, error: { message: 'Already applied' } });

        await db.insert('drive_applications', {
            id: require('crypto').randomUUID(),
            drive_id: driveId,
            student_id: studentId,
            status: 'applied',
            applied_at: new Date().toISOString()
        });
        
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: { message: 'Application failed.' } });
    }
});

let cachedAlumni = null;
let lastAlumniCacheTime = 0;
const ALUMNI_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

router.get('/alumni', async (req, res) => {
    try {
        if (cachedAlumni && (Date.now() - lastAlumniCacheTime < ALUMNI_CACHE_TTL)) {
            return res.json({ success: true, data: cachedAlumni });
        }

        const [students, profiles, offers] = await Promise.all([
            db.select('students'),
            db.select('profiles'),
            db.select('offers')
        ]);

        const studentMap = new Map(students.map(s => [s.id, s]));
        const profileMap = new Map(profiles.map(p => [p.student_id, p]));

        const acceptedOffers = offers.filter(o => ['accepted', 'joined'].includes(o.status));

        const alumni = acceptedOffers.map(offer => {
            const s = studentMap.get(offer.student_id);
            if (!s) return null;
            const prof = profileMap.get(s.id) || {};
            return {
                id: s.id,
                name: s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Alumni',
                branch: s.branch,
                company: offer.company || 'Unknown',
                role: offer.role || 'Placed',
                linkedin: prof.linkedin_url || ''
            };
        }).filter(Boolean);

        cachedAlumni = alumni;
        lastAlumniCacheTime = Date.now();

        return res.json({ success: true, data: alumni });
    } catch (err) {
        console.error('Alumni fetch error:', err);
        return res.status(500).json({ success: false, error: { message: 'Failed to fetch alumni.' } });
    }
});

module.exports = router;
