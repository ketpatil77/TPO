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

router.use((req, res, next) => {
  if (!['POST','PUT'].includes(req.method)) return next();
  const type = submissionType(req.path);
  if (!type) return next();
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
