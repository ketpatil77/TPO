const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const router = express.Router();
router.use(authenticateStudent);

const declarationSchema = z.object({
  no_certificates: z.boolean().optional(),
  no_projects: z.boolean().optional(),
  no_research: z.boolean().optional(),
  no_internships: z.boolean().optional(),
  no_competitions: z.boolean().optional()
}).strict().refine(value => Object.keys(value).length > 0, 'Choose at least one declaration to update.');

const defaults = {
  no_certificates: false,
  no_projects: false,
  no_research: false,
  no_internships: false,
  no_competitions: false
};

router.get('/', async (req, res) => {
  try {
    const row = await db.selectOne('student_profile_declarations', { student_id: req.student.studentId });
    res.json({ success: true, data: { ...defaults, ...(row || {}) } });
  } catch (error) {
    console.error('Profile declaration read error:', error.message);
    res.status(500).json({ success: false, error: { code: 'PROFILE_DECLARATIONS_READ_FAILED', message: 'Unable to load profile declarations.' } });
  }
});

router.put('/', validate(declarationSchema), async (req, res) => {
  try {
    const studentId = req.student.studentId;
    const now = new Date().toISOString();
    const existing = await db.selectOne('student_profile_declarations', { student_id: studentId });
    const saved = await db.upsert('student_profile_declarations', {
      ...(existing || {}),
      student_id: studentId,
      ...req.body,
      updated_at: now
    }, 'student_id');
    await db.logAudit('student_profile_declarations_update', 'student_profile_declarations', studentId, { student_id: studentId, changes: req.body });
    res.json({ success: true, data: { ...defaults, ...saved } });
  } catch (error) {
    console.error('Profile declaration update error:', error.message);
    res.status(500).json({ success: false, error: { code: 'PROFILE_DECLARATIONS_UPDATE_FAILED', message: 'Unable to save profile declaration.' } });
  }
});

module.exports = router;
