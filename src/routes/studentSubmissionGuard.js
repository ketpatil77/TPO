'use strict';

const express = require('express');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { evaluate, duplicateConflict, githubOwner, normalizedUrl, checkReachableUrls } = require('../services/submissionRisk');

const router = express.Router();
router.use(authenticateStudent);

const TABLES = { project:'student_projects', research:'research_papers', internship:'internships', certificate:'certificates' };

function evidenceType(path) {
  if (/^\/certificate-evidence\/[^/]+$/.test(path)) return 'certificate';
  if (/^\/internship-evidence\/[^/]+$/.test(path)) return 'internship';
  return null;
}
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
function candidateLinks(type, body = {}) {
  if (type === 'project') return [body.project_url, body.repository_url].filter(Boolean);
  if (type === 'research') return [body.doi_url, body.paper_url].filter(Boolean);
  return [];
}
function hasReusedLink(type, body, existing, editingId) {
  if (!['project','research'].includes(type)) return false;
  const candidate = new Set(candidateLinks(type, body).map(normalizedUrl).filter(Boolean));
  if (!candidate.size) return false;
  return (existing || []).some(row => {
    if (editingId && String(row.id) === String(editingId)) return false;
    return candidateLinks(type, row).map(normalizedUrl).filter(Boolean).some(url => candidate.has(url));
  });
}
function obviousJunk(risk = {}) {
  return (risk.reasons || []).some(reason => /placeholder text|looks like junk text|repeated placeholder content/i.test(String(reason)));
}

function installEvidenceVerificationInterceptor(req, res, type, id) {
  const originalJson = res.json.bind(res);
  let used = false;
  res.json = function evidenceJson(payload) {
    if (used) return originalJson(payload);
    used = true;
    const record = type === 'certificate' ? payload?.data?.certificate : payload?.data?.internship;
    if (!payload?.success || !record?.id) return originalJson(payload);
    const risk = evaluate(type, record, { ignoreStoredStatus:true });
    const status = risk.auto_approved ? 'verified' : 'pending';
    const now = new Date().toISOString();
    const statusPatch = {
      verification_status:status,
      verification_note:risk.reasons.length ? risk.reasons.join(' ') : 'Auto-verified after unique proof and metadata checks.',
      verified_at:status === 'verified' ? now : null,
      verified_by:null,
      verified_role:status === 'verified' ? 'system' : null
    };
    Promise.resolve(db.update(TABLES[type], { id:id || record.id, student_id:req.student.studentId }, statusPatch)).then(() => {
      // Preserve the evidence route's full response shape (mime, bytes, path, hash, etc.).
      // Only overlay verification fields so a moderation enhancement cannot erase proof metadata.
      if (type === 'certificate') payload.data.certificate = { ...record, ...statusPatch };
      else payload.data.internship = { ...record, ...statusPatch };
      payload.moderation = { ...risk, verification_status:status };
      return originalJson(payload);
    }).catch(error => {
      console.error('Evidence auto-verification persistence failed:', error.message);
      return originalJson(payload);
    });
    return res;
  };
}

function resultRecord(type, payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (type === 'project') return payload.project || null;
  if (type === 'research') return payload.research_paper || null;
  if (type === 'internship') return payload.internship || null;
  if (type === 'certificate') return payload.certificate || null;
  return null;
}
function installAutoStatusInterceptor(req, res, type, risk) {
  if (!['project','research'].includes(type)) return;
  const originalJson = res.json.bind(res);
  let used = false;
  res.json = function integrityJson(payload) {
    if (used) return originalJson(payload);
    used = true;
    const record = resultRecord(type, payload);
    if (!payload?.success || !record?.id) return originalJson(payload);
    const status = risk.auto_approved ? 'verified' : 'pending';
    const now = new Date().toISOString();
    const statusPatch = {
      verification_status:status,
      verification_note:risk.reasons.length ? risk.reasons.join(' ') : 'Auto-verified by submission integrity checks.',
      verified_at:status === 'verified' ? now : null,
      verified_by:null,
      verified_role:status === 'verified' ? 'system' : null
    };
    Promise.resolve(db.update(TABLES[type], { id:record.id, student_id:req.student.studentId }, statusPatch)).then(() => {
      if (type === 'project') payload.project = { ...record, ...statusPatch };
      else payload.research_paper = { ...record, ...statusPatch };
      payload.moderation = { ...risk, verification_status:status };
      return originalJson(payload);
    }).catch(error => {
      console.error('Auto-verification persistence failed:', error.message);
      payload.moderation = { ...risk, verification_status:'pending', persistence_failed:true };
      return originalJson(payload);
    });
    return res;
  };
}

router.use(async (req, res, next) => {
  try {
    if (req.method === 'POST') {
      const proofType = evidenceType(req.path);
      if (proofType) {
        installEvidenceVerificationInterceptor(req, res, proofType, recordId(req.path));
        return next();
      }
    }
    if (!['POST','PUT'].includes(req.method)) return next();
    const type = submissionType(req.path);
    if (!type || !hasBaseShape(type, req.body || {})) return next();

    const studentId = req.student.studentId;
    const editingId = recordId(req.path);
    const [student, existing] = await Promise.all([
      db.selectOne('students', { id:studentId }),
      db.select(TABLES[type], { student_id:studentId })
    ]);

    const duplicate = duplicateConflict(type, req.body || {}, existing, editingId);
    if (duplicate || hasReusedLink(type, req.body || {}, existing, editingId)) {
      return res.status(409).json({ success:false, error:{
        code:'DUPLICATE_SUBMISSION',
        message:'Duplicate entry declined. No cheating: the same link, proof identity, or record is already used in another entry.'
      }});
    }

    // Network ownership/reachability checks are production-only. Local/test mode has no
    // reliable Internet and must remain deterministic, while production still applies them.
    const productionIntegrity = !db.isLocal();
    const links = candidateLinks(type, req.body || {});
    const linkStatus = productionIntegrity && links.length ? await checkReachableUrls(links) : {};
    const context = {
      enforceOwnership:productionIntegrity && type === 'project',
      enforceReachability:productionIntegrity && ['project','research'].includes(type),
      profileGithubUsername:githubOwner(student?.github_url),
      linkStatus,
      reusedLink:false
    };
    const risk = evaluate(type, req.body || {}, context);

    // Missing/dead links, ownership mismatch and thin metadata are flags for TPO/TPC review,
    // not destructive auto-rejections. Only obvious junk is blocked here; exact duplicates
    // are already declined above. This keeps the algorithm conservative when uncertain.
    if (obviousJunk(risk)) {
      return res.status(422).json({ success:false, error:{
        code:'SUBMISSION_QUALITY_FAILED',
        message:`This ${type} entry contains obvious placeholder or junk information. Fix it before saving.`,
        reasons:risk.reasons,
        risk_score:risk.score
      }});
    }

    req.submissionRisk = risk;
    installAutoStatusInterceptor(req, res, type, risk);
    return next();
  } catch (error) {
    console.warn('Submission integrity pre-check could not complete safely:', error.message);
    return res.status(503).json({ success:false, error:{ code:'INTEGRITY_CHECK_UNAVAILABLE', message:'Automatic integrity checks are temporarily unavailable. Please retry instead of saving an unverified record.' } });
  }
});

module.exports = router;
