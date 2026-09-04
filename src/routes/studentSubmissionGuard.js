'use strict';

const express = require('express');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { evaluate, canonicalSubmissionKey } = require('../services/submissionRisk');

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
    if (!type) return next();
    if (!hasBaseShape(type, req.body || {})) return next();

    const risk = evaluate(type, req.body || {});
    if (risk.level === 'high') {
      return res.status(422).json({ success:false, error:{ code:'SUBMISSION_QUALITY_FAILED', message:`This ${type} entry looks incomplete or invalid. Fix the highlighted information before saving.`, reasons:risk.reasons, risk_score:risk.score } });
    }

    const key = canonicalSubmissionKey(type, req.body || {});
    if (key) {
      const existing = await db.select(TABLES[type], { student_id:req.student.studentId });
      const editingId = recordId(req.path);
      const duplicate = existing.find(item => String(item.id) !== String(editingId || '') && canonicalSubmissionKey(type,item) === key);
      if (duplicate) {
        return res.status(409).json({ success:false, error:{ code:'DUPLICATE_SUBMISSION', message:`This ${type} appears to be a duplicate of an existing record. Duplicate records cannot earn Profile Points.` } });
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
