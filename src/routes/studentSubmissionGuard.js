'use strict';

const express = require('express');
const { authenticateStudent } = require('../middleware/auth');
const { evaluate } = require('../services/submissionRisk');

const router = express.Router();
router.use(authenticateStudent);

function submissionType(path) {
  if (/^\/projects(?:\/[^/]+)?$/.test(path)) return 'project';
  if (/^\/research-papers(?:\/[^/]+)?$/.test(path)) return 'research';
  if (/^\/internships(?:\/[^/]+)?$/.test(path)) return 'internship';
  if (/^\/certificates(?:\/[^/]+)?$/.test(path)) return 'certificate';
  return null;
}

function hasBaseShape(type, body = {}) {
  if (type === 'project') return Boolean(String(body.title || '').trim() && String(body.summary || '').trim());
  if (type === 'research') return Boolean(String(body.title || '').trim() && String(body.publication || '').trim() && String(body.abstract || '').trim());
  if (type === 'internship') return Boolean(String(body.company || '').trim() && String(body.role || '').trim());
  if (type === 'certificate') return Boolean(String(body.name || '').trim() && String(body.issuer || '').trim());
  return false;
}

router.use((req, res, next) => {
  if (!['POST','PUT'].includes(req.method)) return next();
  const type = submissionType(req.path);
  if (!type) return next();
  // Let the existing Zod/schema route return its normal 400 response for missing
  // required fields. The integrity layer only judges structurally valid payloads.
  if (!hasBaseShape(type, req.body || {})) return next();
  const risk = evaluate(type, req.body || {});
  // Medium-risk records are allowed but receive zero Profile Points until the
  // evidence/metadata becomes credible. High-risk obvious junk is stopped here.
  if (risk.level === 'high') {
    return res.status(422).json({
      success: false,
      error: {
        code: 'SUBMISSION_QUALITY_FAILED',
        message: `This ${type} entry looks incomplete or invalid. Fix the highlighted information before saving.`,
        reasons: risk.reasons,
        risk_score: risk.score
      }
    });
  }
  req.submissionRisk = risk;
  return next();
});

module.exports = router;
