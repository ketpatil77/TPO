'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const kvCache = require('../utils/kvCache');
const { authenticateAdmin, JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
const { normalizeBranch } = require('../config/branches');
const { createStudentNotification } = require('../services/incompleteProfilePush');
const { evaluate, duplicateIds, markDuplicate, githubOwner } = require('../services/submissionRisk');

const router = express.Router();
router.use(authenticateAdmin);

const TYPE_MAP = {
  project: { table: 'student_projects', riskType: 'project', label: 'project' },
  research: { table: 'research_papers', riskType: 'research', label: 'research paper' },
  internship: { table: 'internships', riskType: 'internship', label: 'internship', evidenceBucket: 'certificate-evidence' },
  certificate: { table: 'certificates', riskType: 'certificate', label: 'certificate', evidenceBucket: 'certificate-evidence' }
};

async function clearCaches() {
  await Promise.all([kvCache.clearPattern('students_list'),kvCache.clearPattern('profile_ranking'),kvCache.clearPattern('leaderboard')]).catch(() => {});
}
async function cleanupEvidence(config, existing) {
  if (!config.evidenceBucket || !existing?.evidence_path || db.isLocal()) return;
  const storage = db.supabaseClient()?.storage?.from(config.evidenceBucket);
  if (!storage) return;
  const { error } = await storage.remove([existing.evidence_path]);
  if (error) console.warn('Moderation evidence cleanup failed:', error.message);
}
function moderationSummary(groups) {
  const rows = groups.flat();
  const low = rows.filter(item => item.moderation.level === 'low').length;
  const medium = rows.filter(item => item.moderation.level === 'medium').length;
  const high = rows.filter(item => item.moderation.level === 'high').length;
  const total = rows.length;
  const trustScore = total ? Math.max(0, Math.round(100 - (high * 25 + medium * 10) / total * 2)) : 100;
  return { total, low, medium, high, flagged: medium + high, trust_score: trustScore };
}
function deletionReason(value) {
  const reason = String(value || '').trim().replace(/\s+/g, ' ');
  return reason.length >= 5 && reason.length <= 300 ? reason : null;
}
function reviewNote(value) { return String(value || '').trim().replace(/\s+/g,' ').slice(0,500); }
async function notifyDeletedSubmission({ studentId, config, existing, reason }) {
  const title = existing.title || existing.name || existing.company || config.label;
  try {
    return await createStudentNotification({
      student_id: studentId, audience: 'student',
      title: `${config.label.charAt(0).toUpperCase() + config.label.slice(1)} removed by TPO`,
      message: `Your ${config.label} “${title}” was removed from your profile. Reason: ${reason}`,
      priority: 'important', action_url: '/dashboard?tab=edit-profile'
    });
  } catch (error) { console.error('Moderation deletion notification failed:', error.message); return null; }
}
async function notifyReview({ studentId, config, existing, status, note }) {
  const title = existing.title || existing.name || existing.company || config.label;
  const approved = status === 'approved';
  try {
    return await createStudentNotification({
      student_id:studentId, audience:'student',
      title:`${config.label.charAt(0).toUpperCase() + config.label.slice(1)} ${approved ? 'verified' : 'rejected'}`,
      message: approved
        ? `Your ${config.label} “${title}” was verified by TPO and its eligible Profile Points are active.${note ? ` Note: ${note}` : ''}`
        : `Your ${config.label} “${title}” was rejected and earns 0 Profile Points. Reason: ${note || 'Failed verification.'}`,
      priority:'important', action_url:'/dashboard?tab=edit-profile'
    });
  } catch (error) { console.error('Moderation review notification failed:', error.message); return null; }
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
        prn: rosterEntry.prn, name: rosterEntry.name, email: null, phone: null,
        branch: normalizeBranch(rosterEntry.branch) || rosterEntry.branch,
        class: rosterEntry.class || null, year: rosterEntry.year || null,
        cgpa_overall: 0, cgpa_semesterwise: {}, backlogs_semesterwise: {}, activities: '',
        lateral_entry: false, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    }
    const token = jwt.sign({
      role:'student', studentId:student.id, prn:student.prn, name:student.name,
      branch:student.branch, class:student.class, year:student.year,
      adminImpersonation:true, impersonatedBy:req.admin.adminId, sessionVersion:SESSION_VERSION
    }, JWT_SECRET, { expiresIn:'2h' });
    await db.logAudit('impersonate_student', 'students', student.id, { prn:student.prn, admin_id:req.admin.adminId, mode:'support_preview' });
    return res.json({ success:true, token, impersonation:true });
  } catch (error) {
    console.error('Admin impersonation failed:', error);
    return res.status(500).json({ success:false, error:'Unable to open student profile.' });
  }
});

router.get('/:studentId/moderation', async (req, res) => {
  try {
    const student = await db.selectOne('students', { id:req.params.studentId });
    if (!student) return res.status(404).json({ success:false, error:'Student not found.' });
    const [projects,research,internships,certificates] = await Promise.all([
      db.select('student_projects', { student_id:student.id }), db.select('research_papers', { student_id:student.id }),
      db.select('internships', { student_id:student.id }), db.select('certificates', { student_id:student.id })
    ]);
    const decorate = (type, rows) => {
      const dupes = duplicateIds(type, rows);
      return rows.map(item => {
        let moderation = evaluate(type,item,{ enforceOwnership:type === 'project', profileGithubUsername:githubOwner(student.github_url) });
        if (dupes.has(String(item.id))) moderation = markDuplicate(moderation);
        return { ...item, moderation };
      });
    };
    const groups = {
      projects:decorate('project',projects), research:decorate('research',research),
      internships:decorate('internship',internships), certificates:decorate('certificate',certificates)
    };
    res.json({ success:true, data:{ ...groups, summary:moderationSummary(Object.values(groups)) } });
  } catch (error) {
    console.error('Moderation scan failed:', error);
    res.status(500).json({ success:false, error:'Unable to scan student submissions.' });
  }
});

router.post('/:studentId/moderation/:type/:id/review', async (req, res) => {
  try {
    const config = TYPE_MAP[req.params.type];
    if (!config) return res.status(400).json({ success:false, error:'Unsupported record type.' });
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved','rejected','pending'].includes(status)) return res.status(400).json({ success:false, error:'Review status must be approved, rejected, or pending.' });
    const note = reviewNote(req.body?.note);
    if (status === 'rejected' && note.length < 5) return res.status(400).json({ success:false, error:'Give a clear rejection reason of at least 5 characters.' });
    const existing = await db.selectOne(config.table, { id:req.params.id, student_id:req.params.studentId });
    if (!existing) return res.status(404).json({ success:false, error:`${config.label} not found.` });
    const stored = status === 'approved' ? 'verified' : status;
    const now = new Date().toISOString();
    const updated = await db.update(config.table, { id:existing.id, student_id:req.params.studentId }, {
      verification_status:stored, verification_note:note || null,
      verified_at:status === 'pending' ? null : now,
      verified_by:status === 'pending' ? null : req.admin.adminId,
      verified_role:status === 'pending' ? null : 'tpo'
    });
    await db.logAudit('review_student_submission', config.table, existing.id, {
      student_id:req.params.studentId, type:req.params.type, status, note, reviewed_by:req.admin.adminId, reviewed_at:now
    });
    if (status !== 'pending') await notifyReview({ studentId:req.params.studentId, config, existing, status, note });
    await clearCaches();
    return res.json({ success:true, data:updated, message:`${config.label} ${status}.` });
  } catch (error) {
    console.error('Moderation review failed:', error.message);
    return res.status(500).json({ success:false, error:'Unable to save moderation review.' });
  }
});

router.delete('/:studentId/moderation/:type/:id', async (req, res) => {
  try {
    const config = TYPE_MAP[req.params.type];
    if (!config) return res.status(400).json({ success:false, error:'Unsupported record type.' });
    const reason = deletionReason(req.body?.reason);
    if (!reason) return res.status(400).json({ success:false, error:'Deletion reason is required and must be 5 to 300 characters.' });
    const existing = await db.selectOne(config.table, { id:req.params.id, student_id:req.params.studentId });
    if (!existing) return res.status(404).json({ success:false, error:`${config.label} not found.` });
    const risk = evaluate(config.riskType, existing);
    await db.delete(config.table, { id:existing.id, student_id:req.params.studentId });
    await cleanupEvidence(config, existing);
    await db.logAudit('delete_student_submission', config.table, existing.id, {
      student_id:req.params.studentId, type:req.params.type,
      title:existing.title || existing.name || existing.company || null,
      risk_score:risk.score, risk_level:risk.level, automated_reasons:risk.reasons,
      deletion_reason:reason, deleted_by:req.admin.adminId
    });
    const notification = await notifyDeletedSubmission({ studentId:req.params.studentId, config, existing, reason });
    await clearCaches();
    res.json({ success:true, message:`${config.label} deleted.`, data:{ risk, reason, notification_sent:Boolean(notification) } });
  } catch (error) {
    console.error('Delete student submission failed:', error);
    res.status(500).json({ success:false, error:'Unable to delete student submission.' });
  }
});

module.exports = router;
