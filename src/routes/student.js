const express = require('express');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const multer = require('multer');
const { z } = require('zod');
const { validate } = require('../middleware/security');
const { normalizeTerm } = require('../utils/matching');

const router = express.Router();

// Apply authentication middleware to all student routes
router.use(authenticateStudent);
const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/**
 * @route   GET /api/student/profile
 * @desc    Fetch complete profile, internships, certificates, and diploma details for logged in student
 * @access  Private
 */
router.get('/profile', async (req, res) => {
    try {
        const studentId = req.student.studentId;

        // Fetch Student Record
        const student = await db.selectOne('students', { id: studentId });
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found.' });
        }

        // Fetch Sub-tables
        const internships = await db.select('internships', { student_id: studentId });
        const certificates = await db.select('certificates', { student_id: studentId });
        const diploma = await db.selectOne('diploma', { student_id: studentId });
        const skills = await db.select('student_skills', { student_id: studentId });

        return res.json({
            success: true,
            data: {
                student,
                internships: internships || [],
                certificates: certificates || [],
                diploma: diploma || null,
                skills: skills || []
            }
        });
    } catch (err) {
        console.error('Error fetching student profile:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

const skillsSchema = z.object({ skills: z.array(z.string().trim().min(1).max(60)).max(50) }).strict();
router.put('/skills', validate(skillsSchema), async (req, res) => {
    const studentId = req.student.studentId;
    const normalized = [...new Set(req.body.skills.map(normalizeTerm).filter(Boolean))];
    const current = await db.select('student_skills', { student_id: studentId });
    for (const row of current) await db.delete('student_skills', { id: row.id, student_id: studentId });
    const saved = [];
    for (const skill of normalized) saved.push(await db.insert('student_skills', { student_id: studentId, skill }));
    res.json({ success: true, data: saved });
});

router.post('/resume', resumeUpload.single('resume'), async (req, res) => {
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
    name: z.string().trim().min(1).max(150), branch: z.string().trim().min(1).max(100),
    class: z.string().trim().min(1).max(50), year: z.string().trim().min(1).max(50),
    cgpa_overall: score,
    cgpa_semesterwise: z.record(z.string(), score).refine(value => Object.keys(value).every(key => /^sem[1-8]$/.test(key)), 'Invalid semester.'),
    activities: z.string().trim().max(5000), resume_url: z.string().optional()
}).partial().strict();
router.put('/profile', validate(profileSchema), async (req, res) => {
    try {
        const studentId = req.student.studentId;
        const {
            name,
            branch,
            class: className,
            year,
            cgpa_overall,
            cgpa_semesterwise,
            activities,
            resume_url
        } = req.body;

        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (name !== undefined) updateData.name = name;
        if (branch !== undefined) updateData.branch = branch;
        if (className !== undefined) updateData.class = className;
        if (year !== undefined) updateData.year = year;
        if (cgpa_overall !== undefined) updateData.cgpa_overall = parseFloat(cgpa_overall) || 0;
        if (cgpa_semesterwise !== undefined) updateData.cgpa_semesterwise = cgpa_semesterwise;
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   PUT /api/student/internships/:id
 * @desc    Update an existing internship record
 */
router.put('/internships/:id', async (req, res) => {
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   PUT /api/student/certificates/:id
 * @desc    Update a certificate record
 */
router.put('/certificates/:id', async (req, res) => {
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
    }
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
