'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const kvCache = require('../utils/kvCache');
const { authenticateAdmin, JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
const { normalizeBranch } = require('../config/branches');
const { evaluate } = require('../services/submissionRisk');

const router = express.Router();
router.use(authenticateAdmin);

const TYPE_MAP = {
  project: { table: 'student_projects', riskType: 'project', label: 'project' },
  research: { table: 'research_papers', riskType: 'research', label: 'research paper' },
  internship: { table: 'internships', riskType: 'internship', label: 'internship' },
  certificate: { table: 'certificates', riskType: 'certificate', label: 'certificate' }
};

async function clearCaches() {
  await Promise.all([
    kvCache.clearPattern('students_list'),
    kvCache.clearPattern('profile_ranking'),
    kvCache.clearPattern('leaderboard')
  ]).catch(() => {});
}

router.post('/:prn/impersonate', async (req, res) => {
  try {
    const cleanPrn = String(req.params.prn || '').trim();
    if (!cleanPrn) return res.status(400).json({ success:false, error:'PRN is required.' });

    const rosterEntry = await db.selectOne('roster', { prn: cleanPrn });
    if (!rosterEntry) return res.status(404).json({ success:false, error:'Student PRN not found in roster.' });

    let student = await db.selectOne('students', { prn: cleanPrn });
    if (!student) {
      student = await db.insert('students', {
        prn: rosterEntry.prn,
        name: rosterEntry.name,
        email: null,
        phone: null,
        branch: normalizeBranch(rosterEntry.branch) || rosterEntry.branch,
        class: rosterEntry.class || null,
        year: rosterEntry.year || null,
        cgpa_overall: 0,
        cgpa_semesterwise: {},
        backlogs_semesterwise: {},
        activities: '',
        lateral_entry: false,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    const token = jwt.sign({
      role: 'student',
      studentId: student.id,
      prn: student.prn,
      name: student.name,
      branch: student.branch,
      class: student.class,
      year: student.year,
      adminImpersonation: true,
      impersonatedBy: req.admin.adminId,
      sessionVersion: SESSION_VERSION
    }, JWT_SECRET, { expiresIn: '2h' });

    await db.logAudit('impersonate_student', 'students', student.id, {
      prn: student.prn,
      admin_id: req.admin.adminId,
      mode: 'support_preview'
    });

    return res.json({ success:true, token, impersonation:true });
  } catch (error) {
    console.error('Admin impersonation failed:', error);
    return res.status(500).json({ success:false, error:'Unable to open student profile.' });
  }
});

router.get('/:studentId/moderation', async (req, res) => {
  try {
    const student = await db.selectOne('students', { id: req.params.studentId });
    if (!student) return res.status(404).json({ success:false, error:'Student not found.' });
    const [projects,research,internships,certificates] = await Promise.all([
      db.select('student_projects', { student_id: student.id }),
      db.select('research_papers', { student_id: student.id }),
      db.select('internships', { student_id: student.id }),
      db.select('certificates', { student_id: student.id })
    ]);
    const decorate = (type, rows) => rows.map(item => ({ ...item, moderation: evaluate(type, item) }));
    res.json({ success:true, data:{
      projects: decorate('project', projects),
      research: decorate('research', research),
      internships: decorate('internship', internships),
      certificates: decorate('certificate', certificates)
    }});
  } catch (error) {
    console.error('Moderation scan failed:', error);
    res.status(500).json({ success:false, error:'Unable to scan student submissions.' });
  }
});

router.delete('/:studentId/moderation/:type/:id', async (req, res) => {
  try {
    const config = TYPE_MAP[req.params.type];
    if (!config) return res.status(400).json({ success:false, error:'Unsupported record type.' });
    const existing = await db.selectOne(config.table, { id:req.params.id, student_id:req.params.studentId });
    if (!existing) return res.status(404).json({ success:false, error:`${config.label} not found.` });
    const risk = evaluate(config.riskType, existing);
    await db.delete(config.table, { id:existing.id, student_id:req.params.studentId });
    await db.logAudit('delete_student_submission', config.table, existing.id, {
      student_id: req.params.studentId,
      type: req.params.type,
      title: existing.title || existing.name || existing.company || null,
      risk_score: risk.score,
      risk_level: risk.level,
      reasons: risk.reasons
    });
    await clearCaches();
    res.json({ success:true, message:`${config.label} deleted.`, data:{ risk } });
  } catch (error) {
    console.error('Delete student submission failed:', error);
    res.status(500).json({ success:false, error:'Unable to delete student submission.' });
  }
});

module.exports = router;
