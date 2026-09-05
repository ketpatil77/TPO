'use strict';

const express = require('express');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { evaluate, submissionFingerprints } = require('../services/submissionRisk');

const router = express.Router();
router.use(authenticateStudent);

const TABLES = { project:'student_projects', research:'research_papers', internship:'internships', certificate:'certificates' };

function submissionType(path) {
  if (/^\/projects(?:\/[^/]+)?$/.test(path)) return 'project';
  if (/^\/research-papers(?:\/[^/]+)?$/.test(path)) return 'research';
  if (/^\/internships(?:\/[^/]+)?$/.test(path)) return 'internship';
  if (/^\/certificates(?:\/[^/]+)?$/.test(path)) return 'certificate';
  return null;
}
function recordId(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  return parts.length > 1 ? parts[1] : null;
}
function hasBaseShape(type, body = {}) {
  if (type === 'project') return Boolean(String(body.title || '').trim() && String(body.summary || '').trim());
  if (type === 'research') return Boolean(String(body.title || '').trim() && String(body.publication || '').trim() && String(body.abstract || '').trim());
  if (type === 'internship') return Boolean(String(body.company || '').trim() && String(body.role || '').trim());
  if (type === 'certificate') return Boolean(String(body.name || '').trim() && String(body.issuer || '').trim());
  return false;
}

router.use(async (req, res, next) => {
  try {
    if (!['POST','PUT'].includes(req.method)) return next();
    const type = submissionType(req.path);
    if (!type || !hasBaseShape(type, req.body || {})) return next();

    const student = await db.selectOne('students', { id:req.student.studentId });
    const risk = evaluate(type, req.body || {}, { github_url:student?.github_url || '' });
    if (risk.level === 'high') {
      return res.status(422).json({ success:false, error:{ code:'SUBMISSION_QUALITY_FAILED', message:`This ${type} entry looks incomplete or invalid. Fix the highlighted information before saving.`, reasons:risk.reasons, risk_score:risk.score } });
    }

    const incoming = new Set(submissionFingerprints(type, req.body || {}));
    if (incoming.size) {
      const existing = await db.select(TABLES[type], { student_id:req.student.studentId });
      const editingId = recordId(req.path);
      const duplicate = existing.find(item => {
        if (String(item.id) === String(editingId || '')) return false;
        return submissionFingerprints(type,item).some(fp => incoming.has(fp));
      });
      if (duplicate) {
        return res.status(409).json({ success:false, error:{ code:'DUPLICATE_SUBMISSION', message:`Duplicate ${type} entry detected. The same link, proof, or identifying details are already saved. No cheating.` } });
      }
    }

    req.submissionRisk = risk;
    return next();
  } catch (error) {
    console.warn('Submission integrity pre-check failed open:', error.message);
    return next();
  }
});

module.exports = router;
