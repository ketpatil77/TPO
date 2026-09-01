const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent, authenticateAdmin, authenticateObserver } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { createStudentNotification } = require('../services/incompleteProfilePush');

const student = express.Router();
const admin = express.Router();
const observer = express.Router();
student.use(authenticateStudent);
admin.use(authenticateAdmin);
observer.use(authenticateObserver);

const RULE_VERSION = '2026-27 v2.0';
const LEVEL_POINTS = {
    'Department': 1,
    'Institute / College': 2,
    'Inter-College': 3,
    'District': 4,
    'Zonal': 5,
    'University': 6,
    'Inter-University': 7,
    'Regional': 8,
    'State': 10,
    'National': 12,
    'International': 15,
    'Open / Online': 4
};
const RESULT_POINTS = {
    'Participated': 0,
    'Shortlisted / Selected': 2,
    'Finalist': 4,
    'Rank / Position': 6,
    'Runner-up': 7,
    'Winner': 10,
    'Special Award': 8
};

const EVIDENCE_KINDS = {
    academics: { table: 'students', statusField: 'academic_verification_status', actorField: 'academic_verified_by', roleField: 'academic_verified_role', atField: 'academic_verified_at', noteField: 'academic_verification_note' },
    internships: { table: 'internships' },
    certificates: { table: 'certificates' },
    projects: { table: 'student_projects' },
    research: { table: 'research_papers' },
    skills: { table: 'student_skills' }
};

const decisionSchema = z.object({
    status: z.enum(['verified', 'rejected']),
    note: z.union([z.string().trim().max(1000), z.null()]).optional().transform(value => value || null)
}).strict().superRefine((value, ctx) => {
    if (value.status === 'rejected' && (!value.note || value.note.length < 3)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Add a short reason when rejecting evidence.' });
    }
});

function cgpaPoints(value) {
    const cgpa = Number(value) || 0;
    if (cgpa >= 9) return 25;
    if (cgpa >= 8) return 20;
    if (cgpa >= 7) return 15;
    if (cgpa >= 6) return 10;
    if (cgpa >= 5) return 5;
    return 0;
}

function certificatePointAt(index) {
    if (index < 5) return 2;
    if (index < 10) return 1.5;
    return 0.75;
}

function groupByStudent(rows) {
    return (rows || []).reduce((map, row) => {
        const list = map.get(row.student_id) || [];
        list.push(row);
        map.set(row.student_id, list);
        return map;
    }, new Map());
}

function isHttpsUrl(value) {
    try { return new URL(String(value || '')).protocol === 'https:'; }
    catch (_) { return false; }
}

function isDoiUrl(value) {
    try {
        const url = new URL(String(value || ''));
        const host = url.hostname.toLowerCase();
        return url.protocol === 'https:' && (host === 'doi.org' || host === 'dx.doi.org');
    } catch (_) { return false; }
}

function profileComplete(profile) {
    return Boolean(
        profile.avatar_path && profile.email && profile.phone && profile.branch && profile.year &&
        profile.ssc_marks !== null && profile.ssc_marks !== undefined &&
        profile.hsc_marks !== null && profile.hsc_marks !== undefined
    );
}

function statusOf(item) {
    return item?.verification_status || 'pending';
}

function scoreStudent(profile, related) {
    const allInternships = related.internships.get(profile.id) || [];
    const allCertificates = related.certificates.get(profile.id) || [];
    const allProjects = related.projects.get(profile.id) || [];
    const allResearch = related.research.get(profile.id) || [];
    const allCompetitions = related.competitions.get(profile.id) || [];
    const allSkills = related.skills.get(profile.id) || [];

    const internships = allInternships.filter(item => statusOf(item) === 'verified');
    const certificates = allCertificates.filter(item => statusOf(item) === 'verified').sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const projects = allProjects.filter(item => statusOf(item) === 'verified');
    const research = allResearch.filter(item => statusOf(item) === 'verified');
    const competitions = allCompetitions.filter(item => statusOf(item) === 'verified');
    const skills = allSkills.filter(item => statusOf(item) === 'verified').sort((a, b) => String(a.skill || '').localeCompare(String(b.skill || '')));

    const explanations = {
        academics: [], certificates: [], projects: [], research: [], competitions: [], internships: [], skills: [], profile: []
    };

    const academicVerified = profile.academic_verification_status === 'verified';
    const rawAcademicPoints = cgpaPoints(profile.cgpa_overall);
    const academics = academicVerified ? rawAcademicPoints : 0;
    explanations.academics.push({
        label: `CGPA ${Number(profile.cgpa_overall || 0).toFixed(2)}`,
        points: academics,
        status: profile.academic_verification_status || 'pending',
        reason: academicVerified ? 'Verified academic record matched the published CGPA band.' : 'Academic record must be verified by TPO/TPC before CGPA points count.'
    });

    let certificateScore = 0;
    certificates.forEach((item, index) => {
        const points = certificatePointAt(index);
        certificateScore += points;
        explanations.certificates.push({ label: item.name || 'Certificate', points, status: 'verified', reason: `${item.issuer || 'Verified issuer'} · verified certificate #${index + 1}` });
    });

    let projectScore = 0;
    projects.forEach(item => {
        const repoBonus = isHttpsUrl(item.repository_url) ? 2 : 0;
        const liveBonus = isHttpsUrl(item.project_url) ? 2 : 0;
        const points = 4 + repoBonus + liveBonus;
        projectScore += points;
        explanations.projects.push({
            label: item.title || 'Project', points, status: 'verified',
            reason: `4 base${repoBonus ? ' + 2 repository' : ''}${liveBonus ? ' + 2 live project' : ''}`,
            links: [item.repository_url, item.project_url].filter(isHttpsUrl)
        });
    });

    let researchScore = 0;
    research.forEach(item => {
        const doiBonus = isDoiUrl(item.doi_url) ? 2 : 0;
        const paperBonus = isHttpsUrl(item.paper_url) ? 1 : 0;
        const points = 8 + doiBonus + paperBonus;
        researchScore += points;
        explanations.research.push({
            label: item.title || 'Research paper', points, status: 'verified',
            reason: `8 verified publication${doiBonus ? ' + 2 valid DOI' : ''}${paperBonus ? ' + 1 paper link' : ''}`,
            links: [item.doi_url, item.paper_url].filter(isHttpsUrl)
        });
    });

    let competitionScore = 0;
    competitions.forEach(item => {
        const levelPoints = LEVEL_POINTS[item.level] || 0;
        const resultPoints = RESULT_POINTS[item.result_status] || 0;
        const points = levelPoints + resultPoints;
        competitionScore += points;
        explanations.competitions.push({
            label: item.title || 'Competition', points, status: 'verified',
            reason: `${item.level || 'Level'} ${levelPoints} + ${item.result_status || 'Result'} ${resultPoints}`,
            links: [item.source_url, item.proof_url].filter(isHttpsUrl)
        });
    });

    const internshipScore = internships.length * 6;
    internships.forEach(item => explanations.internships.push({
        label: `${item.company || 'Internship'}${item.role ? ` · ${item.role}` : ''}`,
        points: 6, status: 'verified', reason: 'Verified internship = 6 points.'
    }));

    let skillScore = 0;
    skills.forEach((item, index) => {
        const points = index < 20 ? 0.5 : 0;
        skillScore += points;
        explanations.skills.push({
            label: item.skill || 'Skill', points, status: 'verified',
            reason: index < 20 ? 'Verified skill = 0.5 point; maximum 20 scored skills.' : 'Verified, but the 20-skill scoring cap has been reached.'
        });
    });

    const resumePoints = profile.resume_url ? 3 : 0;
    const completionPoints = profileComplete(profile) ? 2 : 0;
    const profileScore = resumePoints + completionPoints;
    explanations.profile.push({ label: 'Resume uploaded', points: resumePoints, status: profile.resume_url ? 'system-verified' : 'missing', reason: 'Resume presence is checked by the server.' });
    explanations.profile.push({ label: 'Required profile fields complete', points: completionPoints, status: completionPoints ? 'system-verified' : 'incomplete', reason: 'Picture, contact, branch/year, SSC and HSC/Diploma fields must be present.' });
    if (String(profile.activities || '').trim()) explanations.profile.push({ label: 'Activities recorded', points: 0, status: 'not-scored', reason: 'Free-text activities do not earn points until structured activity verification is available.' });

    const breakdown = {
        academics: Number(academics.toFixed(2)),
        certificates: Number(certificateScore.toFixed(2)),
        projects: Number(projectScore.toFixed(2)),
        research: Number(researchScore.toFixed(2)),
        competitions: Number(competitionScore.toFixed(2)),
        internships: Number(internshipScore.toFixed(2)),
        skills: Number(skillScore.toFixed(2)),
        profile: Number(profileScore.toFixed(2))
    };
    const total = Number(Object.values(breakdown).reduce((sum, value) => sum + value, 0).toFixed(2));

    const evidenceSets = [allInternships, allCertificates, allProjects, allResearch, allCompetitions, allSkills];
    const evidenceCounts = evidenceSets.flat().reduce((acc, item) => {
        const status = statusOf(item);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { pending: 0, verified: 0, rejected: 0 });
    if ((profile.academic_verification_status || 'pending') === 'verified') evidenceCounts.verified += 1;
    else if (profile.academic_verification_status === 'rejected') evidenceCounts.rejected += 1;
    else evidenceCounts.pending += 1;

    return {
        total,
        breakdown,
        explanations,
        evidenceCounts,
        counts: {
            internships: allInternships.length,
            certificates: allCertificates.length,
            projects: allProjects.length,
            research: allResearch.length,
            competitions: allCompetitions.length,
            skills: allSkills.length
        }
    };
}

async function buildLeaderboard({ branch = 'all', year = 'all', currentStudentId = null }) {
    const [students, internships, certificates, projects, research, competitions, skills] = await Promise.all([
        db.select('students'), db.select('internships'), db.select('certificates'), db.select('student_projects'),
        db.select('research_papers'), db.select('student_competitions'), db.select('student_skills')
    ]);
    const related = {
        internships: groupByStudent(internships), certificates: groupByStudent(certificates), projects: groupByStudent(projects),
        research: groupByStudent(research), competitions: groupByStudent(competitions), skills: groupByStudent(skills)
    };
    let filtered = students.filter(item => item.status !== 'inactive');
    if (branch && branch !== 'all') filtered = filtered.filter(item => String(item.branch || '').toUpperCase() === String(branch).toUpperCase());
    if (year && year !== 'all') filtered = filtered.filter(item => String(item.year || '').toLowerCase() === String(year).toLowerCase());

    const scored = filtered.map(profile => {
        const score = scoreStudent(profile, related);
        return {
            student_id: profile.id,
            name: profile.name,
            branch: profile.branch,
            year: profile.year,
            points: score.total,
            breakdown: score.breakdown,
            explanations: score.explanations,
            evidence_counts: score.evidenceCounts,
            counts: score.counts,
            is_me: profile.id === currentStudentId
        };
    }).sort((a, b) => b.points - a.points || String(a.name || '').localeCompare(String(b.name || '')));

    let previousPoints = null;
    let previousRank = 0;
    scored.forEach((item, index) => {
        if (previousPoints === null || item.points !== previousPoints) previousRank = index + 1;
        item.rank = previousRank;
        previousPoints = item.points;
    });

    const current = currentStudentId ? scored.find(item => item.student_id === currentStudentId) || null : null;
    const safeRows = scored.map(({ student_id, ...item }) => item);
    return { rows: safeRows, current: current ? (({ student_id, ...item }) => item)(current) : null };
}

function rules() {
    return {
        version: RULE_VERSION,
        status: 'verified-evidence',
        note: 'Ranks are calculated automatically from fixed published rules. TPO/TPC verify evidence; they do not choose points or ranks. Editing scored evidence resets it to Pending.',
        academics: 'Verified CGPA only: 5–5.99 = 5, 6–6.99 = 10, 7–7.99 = 15, 8–8.99 = 20, 9+ = 25.',
        certificates: 'Verified certificates only. First 5 = 2 points each, next 5 = 1.5 each, later = 0.75 each.',
        projects: 'Verified projects only: 4 base, +2 for a valid HTTPS repository link, +2 for a valid HTTPS live-project link.',
        research: 'Verified papers only: 8 base, +2 only for a real doi.org DOI URL, +1 for an HTTPS paper link.',
        competitions: 'Verified competitions only: published level points + result points.',
        internships: 'Verified internships only: 6 points each.',
        skills: 'Verified skills only: 0.5 each, maximum 20 scored skills (10 points).',
        profile: 'Server-checked resume = 3; required profile fields complete = 2. Free-text activities currently earn 0 to prevent gaming.',
        manual_adjustments: 'Disabled. There is no endpoint to manually set a student score or rank.'
    };
}

function safeEvidenceStatus(value) {
    return ['pending', 'verified', 'rejected', 'all'].includes(value) ? value : 'pending';
}

function evidenceTitle(kind, row) {
    if (kind === 'academics') return `Academic record · CGPA ${Number(row.cgpa_overall || 0).toFixed(2)}`;
    if (kind === 'internships') return `${row.company || 'Internship'}${row.role ? ` · ${row.role}` : ''}`;
    if (kind === 'certificates') return `${row.name || 'Certificate'}${row.issuer ? ` · ${row.issuer}` : ''}`;
    if (kind === 'projects') return row.title || 'Project';
    if (kind === 'research') return row.title || 'Research paper';
    if (kind === 'skills') return row.skill || 'Skill';
    return 'Evidence';
}

function evidenceLinks(kind, row) {
    if (kind === 'projects') return [row.repository_url, row.project_url].filter(isHttpsUrl);
    if (kind === 'research') return [row.doi_url, row.paper_url].filter(isHttpsUrl);
    return [];
}

async function listEvidence({ status = 'pending', kind = 'all', branch = 'all' }) {
    const allowedKinds = Object.keys(EVIDENCE_KINDS);
    const kinds = kind === 'all' ? allowedKinds : allowedKinds.includes(kind) ? [kind] : allowedKinds;
    const students = await db.select('students');
    const people = new Map(students.map(person => [person.id, person]));
    const normalizedStatus = safeEvidenceStatus(status);
    const rows = [];

    for (const currentKind of kinds) {
        if (currentKind === 'academics') {
            students.forEach(person => {
                const rowStatus = person.academic_verification_status || 'pending';
                if (normalizedStatus !== 'all' && rowStatus !== normalizedStatus) return;
                if (branch !== 'all' && String(person.branch || '').toUpperCase() !== String(branch).toUpperCase()) return;
                rows.push({ id: person.id, kind: currentKind, title: evidenceTitle(currentKind, person), status: rowStatus, links: [], student: { id: person.id, name: person.name, prn: person.prn, branch: person.branch, class: person.class, year: person.year } });
            });
            continue;
        }
        const config = EVIDENCE_KINDS[currentKind];
        const items = await db.select(config.table);
        items.forEach(item => {
            const person = people.get(item.student_id);
            if (!person) return;
            const rowStatus = item.verification_status || 'pending';
            if (normalizedStatus !== 'all' && rowStatus !== normalizedStatus) return;
            if (branch !== 'all' && String(person.branch || '').toUpperCase() !== String(branch).toUpperCase()) return;
            rows.push({ id: item.id, kind: currentKind, title: evidenceTitle(currentKind, item), status: rowStatus, links: evidenceLinks(currentKind, item), student: { id: person.id, name: person.name, prn: person.prn, branch: person.branch, class: person.class, year: person.year } });
        });
    }
    return rows.sort((a, b) => String(a.student.name || '').localeCompare(String(b.student.name || '')) || a.kind.localeCompare(b.kind)).slice(0, 1000);
}

async function applyEvidenceDecision({ kind, id, status, note, actorId, actorRole, department = null }) {
    const config = EVIDENCE_KINDS[kind];
    if (!config) return { error: { status: 400, code: 'INVALID_KIND', message: 'Unknown evidence type.' } };
    const row = await db.selectOne(config.table, { id });
    if (!row) return { error: { status: 404, code: 'NOT_FOUND', message: 'Evidence record not found.' } };
    const studentId = kind === 'academics' ? row.id : row.student_id;
    const person = await db.selectOne('students', { id: studentId });
    if (!person) return { error: { status: 404, code: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' } };
    if (department && String(person.branch || '').toUpperCase() !== String(department).toUpperCase()) {
        return { error: { status: 403, code: 'DEPARTMENT_SCOPE', message: 'TPC can verify evidence only for students in their own department.' } };
    }

    const now = new Date().toISOString();
    let updated;
    if (kind === 'academics') {
        updated = await db.update('students', { id: person.id }, {
            academic_verification_status: status,
            academic_verification_note: note,
            academic_verified_by: actorId,
            academic_verified_role: actorRole,
            academic_verified_at: now
        });
    } else {
        updated = await db.update(config.table, { id: row.id }, {
            verification_status: status,
            verification_note: note,
            verified_by: actorId,
            verified_role: actorRole,
            verified_at: now
        });
    }

    await db.logAudit(`profile_evidence_${status}`, config.table, id, {
        evidence_kind: kind,
        student_id: person.id,
        student_prn: person.prn,
        branch: person.branch,
        verifier_id: actorId,
        verifier_role: actorRole,
        note,
        scoring_rule_version: RULE_VERSION
    });

    try {
        await createStudentNotification({
            student_id: person.id,
            audience: 'student', branches: [],
            title: status === 'verified' ? 'Profile evidence verified' : 'Profile evidence needs correction',
            message: status === 'verified' ? `${evidenceTitle(kind, row)} is verified and can now contribute to Profile Points.` : `${evidenceTitle(kind, row)} was rejected. ${note || 'Please correct the record.'}`,
            priority: status === 'rejected' ? 'important' : 'normal',
            action_url: '/dashboard?tab=ranking'
        });
    } catch (error) {
        console.error('Evidence verification notification failed:', error.message);
    }
    return { updated, student: person };
}

student.get('/profile', async (req, res) => {
    try {
        const me = await db.selectOne('students', { id: req.student.studentId });
        if (!me) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } });
        const branch = req.query.branch || me.branch || 'all';
        const year = req.query.year || me.year || 'all';
        const data = await buildLeaderboard({ branch, year, currentStudentId: me.id });
        res.json({ success: true, data: { ...data, filters: { branch, year }, rules: rules() } });
    } catch (error) {
        console.error('Student profile ranking failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'PROFILE_RANKING_FAILED', message: 'Unable to calculate profile ranking.' } });
    }
});

admin.get('/profile', async (req, res) => {
    try {
        const data = await buildLeaderboard({ branch: req.query.branch || 'all', year: req.query.year || 'all' });
        res.json({ success: true, data: { ...data, filters: { branch: req.query.branch || 'all', year: req.query.year || 'all' }, rules: rules() } });
    } catch (error) {
        res.status(500).json({ success: false, error: { code: 'PROFILE_RANKING_FAILED', message: 'Unable to calculate profile ranking.' } });
    }
});

observer.get('/profile', async (req, res) => {
    try {
        const data = await buildLeaderboard({ branch: req.observer.department, year: req.query.year || 'all' });
        res.json({ success: true, data: { ...data, filters: { branch: req.observer.department, year: req.query.year || 'all' }, rules: rules() } });
    } catch (error) {
        res.status(500).json({ success: false, error: { code: 'PROFILE_RANKING_FAILED', message: 'Unable to calculate department profile ranking.' } });
    }
});

admin.get('/evidence', async (req, res) => {
    try {
        const data = await listEvidence({ status: req.query.status, kind: req.query.kind || 'all', branch: req.query.branch || 'all' });
        res.json({ success: true, data, rules_version: RULE_VERSION });
    } catch (error) {
        console.error('Admin evidence queue failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'EVIDENCE_LIST_FAILED', message: 'Unable to load profile evidence queue.' } });
    }
});

admin.put('/evidence/:kind/:id/verification', validate(decisionSchema), async (req, res) => {
    try {
        const result = await applyEvidenceDecision({ kind: req.params.kind, id: req.params.id, status: req.body.status, note: req.body.note, actorId: req.admin.adminId, actorRole: 'TPO' });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        res.json({ success: true, data: result.updated });
    } catch (error) {
        console.error('Admin evidence decision failed:', error.message);
        res.status(500).json({ success: false, error: { code: 'EVIDENCE_VERIFY_FAILED', message: 'Unable to update evidence verification.' } });
    }
});

observer.get('/evidence', async (req, res) => {
    try {
        const data = await listEvidence({ status: req.query.status, kind: req.query.kind || 'all', branch: req.observer.department });
        res.json({ success: true, data, scope: req.observer.department, rules_version: RULE_VERSION });
    } catch (error) {
        res.status(500).json({ success: false, error: { code: 'EVIDENCE_LIST_FAILED', message: 'Unable to load department evidence queue.' } });
    }
});

observer.put('/evidence/:kind/:id/verification', validate(decisionSchema), async (req, res) => {
    try {
        const result = await applyEvidenceDecision({ kind: req.params.kind, id: req.params.id, status: req.body.status, note: req.body.note, actorId: req.observer.observerId, actorRole: 'TPC', department: req.observer.department });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        res.json({ success: true, data: result.updated });
    } catch (error) {
        res.status(500).json({ success: false, error: { code: 'EVIDENCE_VERIFY_FAILED', message: 'Unable to update evidence verification.' } });
    }
});

module.exports = { student, admin, observer, scoreStudent };
