'use strict';

const express = require('express');
const db = require('../config/database');
const kvCache = require('../utils/kvCache');
const { authenticateStudent } = require('../middleware/auth');
const { evaluate, submissionFingerprints, evidenceFingerprints } = require('../services/submissionRisk');
const { probeSubmissionUrls } = require('../services/evidenceUrl');

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
function addFlag(risk, reason) {
  if (!reason) return risk;
  const reasons = [...new Set([...(risk.reasons || []), reason])];
  return { ...risk, score:Math.max(45, Number(risk.score)||0), level:(Number(risk.score)||0)>=60?'high':'medium', auto_approved:false, needs_review:true, hard_reject:false, reasons };
}
function autoFlagNote(risk) {
  if (!risk?.needs_review) return null;
  return `AUTO_FLAG: ${(risk.reasons || ['Automatic review required.']).join(' | ')}`.slice(0, 500);
}
async function clearRankingCaches(){
  await Promise.all([kvCache.clearPattern('profile_ranking'),kvCache.clearPattern('leaderboard')]).catch(()=>{});
}
function installPersistence(req,res,type,risk){
  if (!['project','research'].includes(type)) return;
  const originalJson = res.json.bind(res);
  let sent = false;
  res.json = function(payload){
    if (sent) return res;
    if (res.statusCode < 200 || res.statusCode >= 300) { sent = true; return originalJson(payload); }
    const record = type === 'project' ? payload?.project : payload?.research_paper;
    if (!record?.id) { sent = true; return originalJson(payload); }
    const note = autoFlagNote(risk);
    Promise.resolve(db.update(TABLES[type], { id:record.id, student_id:req.student.studentId }, {
      verification_status:'pending', verification_note:note, verified_at:null, verified_by:null, verified_role:null
    })).then(updated => {
      if (updated) {
        if (type === 'project') payload.project = { ...record, ...updated };
        else payload.research_paper = { ...record, ...updated };
      }
      return clearRankingCaches();
    }).catch(error => {
      console.error('Submission moderation state persistence failed:', error.message);
    }).finally(() => { sent = true; originalJson(payload); });
    return res;
  };
}

router.use(async (req, res, next) => {
  try {
    if (!['POST','PUT'].includes(req.method)) return next();
    const type = submissionType(req.path);
    if (!type || !hasBaseShape(type, req.body || {})) return next();

    const student = await db.selectOne('students', { id:req.student.studentId });
    let risk = evaluate(type, req.body || {}, { github_url:student?.github_url || '' });
    if (risk.hard_reject) {
      return res.status(422).json({ success:false, error:{ code:'SUBMISSION_QUALITY_FAILED', message:`This ${type} entry contains invalid or placeholder information. Fix it before saving.`, reasons:risk.reasons, risk_score:risk.score } });
    }

    const incoming = new Set(submissionFingerprints(type, req.body || {}));
    const existing = await db.select(TABLES[type], { student_id:req.student.studentId });
    const editingId = recordId(req.path);
    const duplicate = existing.find(item => {
      if (String(item.id) === String(editingId || '')) return false;
      return submissionFingerprints(type,item).some(fp => incoming.has(fp));
    });
    if (duplicate) {
      return res.status(409).json({ success:false, error:{ code:'DUPLICATE_SUBMISSION', message:`Duplicate ${type} entry detected. The same title or unique evidence is already saved in your profile. No cheating.` } });
    }

    if (type === 'project' || type === 'research') {
      const evidence = new Set(evidenceFingerprints(type, req.body || {}));
      if (evidence.size) {
        const allRows = await db.select(TABLES[type]);
        const shared = allRows.find(item => String(item.student_id) !== String(req.student.studentId) && evidenceFingerprints(type,item).some(fp => evidence.has(fp)));
        if (shared) risk = addFlag(risk, 'This evidence URL is also used by another student. Collaboration/co-authorship must be checked by TPO/TPC.');
      }

      const probes = await probeSubmissionUrls(type, req.body || {});
      const invalid = probes.find(item => item.hard_invalid);
      if (invalid) {
        return res.status(422).json({ success:false, error:{ code:'INVALID_EVIDENCE_URL', message:`${invalid.label} URL is invalid.`, reasons:[invalid.reason] } });
      }
      for (const probe of probes) {
        if (!probe.ok) risk = addFlag(risk, `${probe.label} URL could not be verified: ${probe.reason}`);
      }
    }

    req.submissionRisk = risk;
    installPersistence(req,res,type,risk);
    return next();
  } catch (error) {
    console.warn('Submission integrity pre-check failed open:', error.message);
    return next();
  }
});

module.exports = router;
