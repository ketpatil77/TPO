const express = require('express');
const db = require('../config/database');
const { authenticateStudent, authenticateAdmin, authenticateObserver } = require('../middleware/auth');

const student = express.Router();
const admin = express.Router();
const observer = express.Router();
student.use(authenticateStudent);
admin.use(authenticateAdmin);
observer.use(authenticateObserver);

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

function cgpaPoints(value) {
    const cgpa = Number(value) || 0;
    if (cgpa >= 9) return 25;
    if (cgpa >= 8) return 20;
    if (cgpa >= 7) return 15;
    if (cgpa >= 6) return 10;
    if (cgpa >= 5) return 5;
    return 0;
}

function certificatePoints(count) {
    const n = Math.max(0, Number(count) || 0);
    const first = Math.min(n, 5) * 2;
    const second = Math.min(Math.max(n - 5, 0), 5) * 1.5;
    const later = Math.max(n - 10, 0) * 0.75;
    return first + second + later;
}

function groupByStudent(rows) {
    return (rows || []).reduce((map, row) => {
        const list = map.get(row.student_id) || [];
        list.push(row);
        map.set(row.student_id, list);
        return map;
    }, new Map());
}

function scoreStudent(profile, related) {
    const internships = related.internships.get(profile.id) || [];
    const certificates = related.certificates.get(profile.id) || [];
    const projects = related.projects.get(profile.id) || [];
    const research = related.research.get(profile.id) || [];
    const competitions = (related.competitions.get(profile.id) || []).filter(item => item.verification_status === 'verified');
    const skills = related.skills.get(profile.id) || [];

    const academics = cgpaPoints(profile.cgpa_overall);
    const certificateScore = certificatePoints(certificates.length);
    const projectScore = projects.reduce((sum, project) => sum + 4 + (project.repository_url ? 2 : 0) + (project.project_url ? 2 : 0), 0);
    const researchScore = research.reduce((sum, paper) => sum + 8 + (paper.doi_url ? 2 : 0) + (paper.paper_url ? 1 : 0), 0);
    const competitionScore = competitions.reduce((sum, item) => sum + (LEVEL_POINTS[item.level] || 0) + (RESULT_POINTS[item.result_status] || 0), 0);
    const internshipScore = internships.length * 6;
    const skillScore = Math.min(skills.length, 20) * 0.5;
    const profileScore = (profile.resume_url ? 3 : 0) + (profile.complete_profile ? 2 : 0) + (String(profile.activities || '').trim() ? 2 : 0);

    const breakdown = {
        academics,
        certificates: Number(certificateScore.toFixed(2)),
        projects: Number(projectScore.toFixed(2)),
        research: Number(researchScore.toFixed(2)),
        competitions: Number(competitionScore.toFixed(2)),
        internships: Number(internshipScore.toFixed(2)),
        skills: Number(skillScore.toFixed(2)),
        profile: Number(profileScore.toFixed(2))
    };
    const total = Number(Object.values(breakdown).reduce((sum, value) => sum + value, 0).toFixed(2));
    return { total, breakdown, counts: { internships: internships.length, certificates: certificates.length, projects: projects.length, research: research.length, verifiedCompetitions: competitions.length, skills: skills.length } };
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
        status: 'beta',
        note: 'Profile Points v1 is transparent and provisional. Competition points count only after TPO/TPC verification; other evidence categories will gain verification controls in later scoring revisions.',
        academics: 'CGPA: 5–5.99 = 5, 6–6.99 = 10, 7–7.99 = 15, 8–8.99 = 20, 9+ = 25.',
        certificates: 'First 5 certificates = 2 points each, next 5 = 1.5 each, later certificates = 0.75 each.',
        projects: '4 points each, +2 for repository link, +2 for live project link.',
        research: '8 points each, +2 for DOI, +1 for paper link.',
        competitions: 'Verified competition level points + result points. Higher levels and results earn more.',
        internships: '6 points per recorded internship.',
        skills: '0.5 point per skill, up to 10 points.',
        profile: 'Resume 3, completed profile 2, activities recorded 2.'
    };
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

module.exports = { student, admin, observer, scoreStudent };
