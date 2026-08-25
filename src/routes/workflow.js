const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin, authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { scoreCandidate } = require('../utils/matching');
const { BRANCHES } = require('../config/branches');

const admin = express.Router();
const student = express.Router();
admin.use(authenticateAdmin);
student.use(authenticateStudent);

async function candidate(studentRow) {
    const [internships, certificates, projects, researchPapers, skills] = await Promise.all([
        db.select('internships', { student_id: studentRow.id }), db.select('certificates', { student_id: studentRow.id }), db.select('student_projects', { student_id: studentRow.id }), db.select('research_papers', { student_id: studentRow.id }), db.select('student_skills', { student_id: studentRow.id })
    ]);
    return { ...studentRow, internships, certificates, projects, research_papers: researchPapers, skills };
}

function missingFields(row) {
    const fields = [];
    if (!row.name) fields.push('Name');
    if (!row.branch) fields.push('Branch');
    if (!row.class) fields.push('Class');
    if (!row.year) fields.push('Year');
    if (!Number(row.cgpa_overall)) fields.push('CGPA');
    if (!row.resume_url) fields.push('Resume');
    if (!row.activities) fields.push('Activities');
    return fields;
}

admin.get('/readiness', async (_req, res) => {
    const [roster, students, corrections] = await Promise.all([db.select('roster'), db.select('students'), db.select('correction_requests')]);
    const studentByPrn = new Map(students.map(row => [row.prn, row]));
    const rows = roster.map(person => {
        const profile = studentByPrn.get(person.prn);
        const missing = profile ? missingFields(profile) : ['Profile'];
        return { ...person, student_id: profile?.id || null, missing, completion: Math.round(((7 - missing.length) / 7) * 100) };
    });
    res.json({ success: true, data: { rows, totals: { roster: rows.length, incomplete: rows.filter(row => row.missing.length).length, noProfile: rows.filter(row => !row.student_id).length, openCorrections: corrections.filter(row => row.status === 'open').length } } });
});

const correctionSchema = z.object({ student_id: z.uuid(), field_name: z.string().trim().min(1).max(80), message: z.string().trim().min(3).max(1000) }).strict();
admin.post('/corrections', validate(correctionSchema), async (req, res) => {
    const row = await db.insert('correction_requests', { ...req.body, status: 'open', created_by: req.admin.adminId, created_at: new Date().toISOString() });
    await db.insert('notifications', { student_id: req.body.student_id, audience: 'student', title: `Correction needed: ${req.body.field_name}`, message: req.body.message, priority: 'important', created_at: new Date().toISOString() });
    res.status(201).json({ success: true, data: row });
});
admin.get('/corrections', async (_req, res) => res.json({ success: true, data: await db.select('correction_requests') }));

const statusSchema = z.object({ status: z.enum(['applied','eligible','test','interview','selected','rejected','withdrawn']) }).strict();
admin.put('/applications/:id/status', validate(statusSchema), async (req, res) => {
    const application = await db.update('drive_applications', { id: req.params.id }, { status: req.body.status, updated_at: new Date().toISOString() });
    if (!application) return res.status(404).json({ success: false, error: 'Application not found.' });
    await db.insert('notifications', { student_id: application.student_id, audience: 'student', title: 'Application status updated', message: `New status: ${req.body.status}.`, priority: 'important', created_at: new Date().toISOString() });
    res.json({ success: true, data: application });
});
admin.get('/applications', async (_req, res) => {
    const [applications, students, drives] = await Promise.all([db.select('drive_applications'), db.select('students'), db.select('placement_drives')]);
    res.json({ success: true, data: applications.map(item => { const person=students.find(row=>row.id===item.student_id)||{}; const drive=drives.find(row=>row.id===item.drive_id)||{}; return {...item,student_name:person.name,prn:person.prn,email:person.email,phone:person.phone,branch:person.branch,company:drive.company,role:drive.role}; }) });
});

const noticeSchema = z.object({
    title: z.string().trim().min(2, 'Title must contain at least 2 characters.').max(120),
    message: z.string().trim().min(3, 'Message must contain at least 3 characters.').max(2000),
    priority: z.enum(['normal','important']).default('normal'),
    expires_at: z.iso.datetime({ offset: true }).nullable().default(null),
    action_url: z.string().trim().max(500).refine(value => !value || /^(\/(?!\/)|https?:\/\/)/i.test(value), 'Action URL must start with /, http://, or https://.').nullable().default(null)
    ,branches: z.array(z.enum(BRANCHES.map(branch => branch.code))).max(BRANCHES.length).default([]).transform(values => [...new Set(values)])
}).strict().superRefine((value, context) => {
    if (value.expires_at && new Date(value.expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
        context.addIssue({ code: 'custom', path: ['expires_at'], message: 'Expiry must be at least 5 minutes from now. Leave it blank for no expiry.' });
    }
});
admin.post('/notifications', validate(noticeSchema), async (req, res) => {
    const row = await db.insert('notifications', { ...req.body, action_url: req.body.action_url || null, student_id: null, audience: req.body.branches.length ? 'branches' : 'all', created_at: new Date().toISOString() });
    res.status(201).json({ success: true, data: row });
});
admin.get('/notifications', async (_req, res) => {
    const [notifications, reads, students] = await Promise.all([db.select('notifications'), db.select('notification_reads'), db.select('students')]);
    const data = notifications.filter(item => ['all','branches'].includes(item.audience)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50).map(item => ({
        ...item,
        read_count: new Set(reads.filter(read => read.notification_id === item.id).map(read => read.student_id)).size,
        recipient_count: item.audience === 'all' ? students.length : students.filter(student => (item.branches || []).includes(student.branch)).length,
        expired: Boolean(item.expires_at && new Date(item.expires_at).getTime() <= Date.now()),
        lifetime_seconds: item.expires_at ? Math.max(0, Math.round((new Date(item.expires_at).getTime() - new Date(item.created_at).getTime()) / 1000)) : null
    }));
    res.json({ success: true, data });
});
admin.delete('/notifications/:id', async (req, res) => {
    const item = await db.selectOne('notifications', { id: req.params.id });
    if (item && !['all','branches'].includes(item.audience)) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found.' } });
    if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found.' } });
    await db.delete('notifications', { id: item.id });
    await db.logAudit('notification_delete', 'notifications', item.id, { title: item.title });
    res.json({ success: true, message: 'Notification deleted.' });
});

student.get('/opportunities', async (req, res) => {
    const profile = await db.selectOne('students', { id: req.student.studentId });
    const [drives, criteria, applications] = await Promise.all([db.select('placement_drives'), db.select('drive_criteria'), db.select('drive_applications', { student_id: req.student.studentId })]);
    const fullCandidate = await candidate(profile);
    const data = drives.filter(drive => drive.status !== 'draft').map(drive => {
        const rule = criteria.find(item => item.drive_id === drive.id);
        const eligibility = rule ? scoreCandidate(fullCandidate, rule) : { eligible: false, reasons: ['Criteria not confirmed.'], score: 0 };
        return { ...drive, criteria: rule || null, eligibility, application: applications.find(item => item.drive_id === drive.id) || null };
    });
    res.json({ success: true, data });
});
student.post('/opportunities/:id/apply', async (req, res) => {
    const [drive, criteria, profile] = await Promise.all([db.selectOne('placement_drives', { id: req.params.id }), db.selectOne('drive_criteria', { drive_id: req.params.id }), db.selectOne('students', { id: req.student.studentId })]);
    if (!drive || drive.status !== 'open' || !criteria) return res.status(400).json({ success: false, error: 'Drive is not open for applications.' });
    const eligibility = scoreCandidate(await candidate(profile), criteria);
    if (!eligibility.eligible) return res.status(403).json({ success: false, error: { code: 'NOT_ELIGIBLE', message: eligibility.reasons.join(' ') } });
    const row = await db.upsert('drive_applications', { id: crypto.randomUUID(), key: `${drive.id}:${profile.id}`, drive_id: drive.id, student_id: profile.id, status: 'applied', eligibility, applied_at: new Date().toISOString(), updated_at: new Date().toISOString() }, 'key');
    res.status(201).json({ success: true, data: row });
});
student.get('/corrections', async (req, res) => res.json({ success: true, data: await db.select('correction_requests', { student_id: req.student.studentId }) }));
student.put('/corrections/:id/resolve', async (req, res) => {
    const existing = await db.selectOne('correction_requests', { id: req.params.id, student_id: req.student.studentId });
    if (!existing) return res.status(404).json({ success: false, error: 'Correction request not found.' });
    res.json({ success: true, data: await db.update('correction_requests', { id: existing.id }, { status: 'resolved', resolved_at: new Date().toISOString() }) });
});
student.get('/notifications', async (req, res) => {
    const [all,reads,profile] = await Promise.all([db.select('notifications'),db.select('notification_reads',{student_id:req.student.studentId}),db.selectOne('students',{id:req.student.studentId})]);
    const readIds=new Set(reads.map(row=>row.notification_id)); const now=Date.now();
    const data=all.filter(row => notificationVisible(row, profile, req.student.studentId) && (!row.expires_at||new Date(row.expires_at).getTime()>now)).map(row=>({...row,read:readIds.has(row.id)})).sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json({ success: true, data, unread:data.filter(row=>!row.read).length });
});
student.put('/notifications/:id/read', async (req, res) => {
    const [item, profile] = await Promise.all([db.selectOne('notifications', { id: req.params.id }), db.selectOne('students', { id: req.student.studentId })]);
    if (!item || !notificationVisible(item, profile, req.student.studentId)) return res.status(404).json({ success: false, error: 'Notification not found.' });
    res.json({ success: true, data: await db.upsert('notification_reads',{key:`${item.id}:${req.student.studentId}`,notification_id:item.id,student_id:req.student.studentId,read_at:new Date().toISOString()},'key') });
});
student.put('/notifications/read-all', async (req, res) => {
    const [all, profile] = await Promise.all([db.select('notifications'), db.selectOne('students', { id: req.student.studentId })]);
    const now = Date.now();
    const visible = all.filter(item => notificationVisible(item, profile, req.student.studentId) && (!item.expires_at || new Date(item.expires_at).getTime() > now));
    await Promise.all(visible.map(item => db.upsert('notification_reads', { key: `${item.id}:${req.student.studentId}`, notification_id: item.id, student_id: req.student.studentId, read_at: new Date().toISOString() }, 'key')));
    res.json({ success: true, updated: visible.length });
});

function notificationVisible(item, profile, studentId) {
    return item.audience === 'all' || item.student_id === studentId || (item.audience === 'branches' && (item.branches || []).includes(profile?.branch));
}

module.exports = { admin, student };
