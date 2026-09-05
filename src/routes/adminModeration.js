'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const kvCache = require('../utils/kvCache');
const { authenticateAdmin, JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
const { normalizeBranch } = require('../config/branches');
const { createStudentNotification } = require('../services/incompleteProfilePush');
const { evaluate, duplicateIds, markDuplicate, validHttps, doiLike } = require('../services/submissionRisk');

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

function cleanReason(value) {
  const reason = String(value || '').trim().replace(/\s+/g, ' ');
  return reason.length >= 5 && reason.length <= 300 ? reason : null;
}

function storedStatus(item) {
  const value = String(item?.verification_status || 'pending').toLowerCase();
  return value === 'approved' ? 'verified' : value;
}

function basePoints(type, item, moderation) {
  if (!moderation?.auto_approved || moderation?.duplicate || moderation?.staff_rejected) return 0;
  if (type === 'project') return 4 + (validHttps(item.repository_url) ? 2 : 0) + (validHttps(item.project_url) ? 2 : 0);
  if (type === 'research') return 8 + (doiLike(item.doi_url) ? 2 : 0) + (validHttps(item.paper_url) ? 1 : 0);
  if (type === 'internship') return 6;
  return 0;
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

async function notifyDecision({ studentId, config, existing, decision, reason }) {
  const label = existing.title || existing.name || existing.company || config.label;
  const approved = decision === 'approve';
  try {
    return await createStudentNotification({
      student_id: studentId,
      audience: 'student',
      title: `${config.label.charAt(0).toUpperCase() + config.label.slice(1)} ${approved ? 'approved' : 'rejected'}`,
      message: approved
        ? `Your ${config.label} “${label}” was reviewed and approved by TPO. Eligible Profile Points now count.`
        : `Your ${config.label} “${label}” was rejected by TPO. Reason: ${reason}`,
      priority: 'important',
      action_url: '/dashboard?tab=edit-profile'
    });
  } catch (error) {
    console.error('Moderation decision notification failed:', error.message);
    return null;
  }
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
      db.select('student_projects', { student_id:student.id }),
      db.select('research_papers', { student_id:student.id }),
      db.select('internships', { student_id:student.id }),
      db.select('certificates', { student_id:student.id })
    ]);
    const decorate = (type, rows) => {
      const dupes = duplicateIds(type, rows);
      return rows.map(item => {
        let moderation = evaluate(type,item,{ github_url:student.github_url || '' });
        if (dupes.has(String(item.id))) moderation = markDuplicate(moderation);
        return { ...item, moderation, profile_points:basePoints(type,item,moderation), moderation_status:storedStatus(item) };
      });
    };
    const groups = {
      projects:decorate('project',projects), research:decorate('research',research),
      internships:decorate('internship',internships), certificates:decorate('certificate',certificates)
    };
    const verifiedCertificates = groups.certificates.filter(item => storedStatus(item) === 'verified' && !item.moderation.duplicate);
    verifiedCertificates.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach((item,index) => { item.profile_points = index < 10 ? 2 : 1.5; });
    groups.certificates.filter(item => storedStatus(item) !== 'verified').forEach(item => { item.profile_points = 0; });
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
    const decision = String(req.body?.decision || '').toLowerCase();
    if (!['approve','reject'].includes(decision)) return res.status(400).json({ success:false, error:'Decision must be approve or reject.' });
    const reason = decision === 'reject' ? cleanReason(req.body?.reason) : String(req.body?.reason || '').trim().slice(0,300);
    if (decision === 'reject' && !reason) return res.status(400).json({ success:false, error:'Rejection reason is required and must be 5 to 300 characters.' });
    const existing = await db.selectOne(config.table, { id:req.params.id, student_id:req.params.studentId });
    if (!existing) return res.status(404).json({ success:false, error:`${config.label} not found.` });
    if ((req.params.type === 'certificate' || req.params.type === 'internship') && decision === 'approve' && !existing.evidence_path) {
      return res.status(400).json({ success:false, error:'Proof is required before approval.' });
    }
    const student = await db.selectOne('students', { id:req.params.studentId });
    const now = new Date().toISOString();
    const newStatus = decision === 'approve' ? 'verified' : 'rejected';
    const updated = await db.update(config.table, { id:existing.id, student_id:req.params.studentId }, {
      verification_status:newStatus,
      verification_note:decision === 'reject' ? reason : (reason || null),
      verified_at:now,
      verified_by:req.admin.adminId,
      verified_role:'tpo'
    });
    if (!updated) throw new Error('Moderation update matched no record.');
    await db.logAudit('student_submission_review', config.table, existing.id, {
      student_id:req.params.studentId, type:req.params.type, decision,
      reason:decision === 'reject' ? reason : (reason || ''), reviewed_by:req.admin.adminId, reviewed_at:now
    });
    const notification = await notifyDecision({ studentId:req.params.studentId, config, existing, decision, reason });
    await clearCaches();
    let moderation = evaluate(config.riskType,{ ...existing, ...updated },{ github_url:student?.github_url || '' });
    res.json({ success:true, message:`${config.label} ${decision === 'approve' ? 'approved' : 'rejected'}.`, data:{ status:newStatus, moderation, notification_sent:Boolean(notification) } });
  } catch (error) {
    console.error('Review student submission failed:', error);
    res.status(500).json({ success:false, error:'Unable to save moderation decision.' });
  }
});

module.exports = router;
