const express = require('express');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateStudent);

const RULE_VERSION = '2026-27 v2.1';
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

function certificatePointAt(index) {
  if (index < 5) return 2;
  if (index < 10) return 1.5;
  return 0.75;
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

function groupByStudent(rows) {
  return (rows || []).reduce((map, row) => {
    const list = map.get(row.student_id) || [];
    list.push(row);
    map.set(row.student_id, list);
    return map;
  }, new Map());
}

function statusOf(item) {
  return item?.verification_status || 'pending';
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function emptyExplanationSet() {
  return { academics: [], certificates: [], projects: [], research: [], competitions: [], internships: [], skills: [], profile: [] };
}

function scoreStudent(profile, related) {
  const all = {
    internships: related.internships.get(profile.id) || [],
    certificates: related.certificates.get(profile.id) || [],
    projects: related.projects.get(profile.id) || [],
    research: related.research.get(profile.id) || [],
    competitions: related.competitions.get(profile.id) || [],
    skills: related.skills.get(profile.id) || []
  };

  const earned = { academics: 0, certificates: 0, projects: 0, research: 0, competitions: 0, internships: 0, skills: 0, profile: 0 };
  const pending = { academics: 0, certificates: 0, projects: 0, research: 0, competitions: 0, internships: 0, skills: 0, profile: 0 };
  const explanations = emptyExplanationSet();
  const pendingExplanations = emptyExplanationSet();

  // College academics are authoritative. They are never part of staff evidence verification.
  earned.academics = cgpaPoints(profile.cgpa_overall);
  explanations.academics.push({
    label: `CGPA ${Number(profile.cgpa_overall || 0).toFixed(2)}`,
    points: earned.academics,
    status: 'college-record',
    reason: 'College-supplied CGPA automatically receives points from the published CGPA band.'
  });

  const verifiedCertificates = all.certificates.filter(item => statusOf(item) === 'verified').sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const pendingCertificates = all.certificates.filter(item => statusOf(item) === 'pending').sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  verifiedCertificates.forEach((item, index) => {
    const points = certificatePointAt(index);
    earned.certificates += points;
    explanations.certificates.push({ label: item.name || 'Certificate', points, status: 'verified', reason: `${item.issuer || 'Issuer'} · verified certificate #${index + 1}` });
  });
  pendingCertificates.forEach((item, index) => {
    const points = certificatePointAt(verifiedCertificates.length + index);
    pending.certificates += points;
    pendingExplanations.certificates.push({ label: item.name || 'Certificate', points, status: 'pending', reason: `${item.issuer || 'Issuer'} · adds ${points} point${points === 1 ? '' : 's'} after verification.` });
  });

  all.projects.forEach(item => {
    const repoBonus = isHttpsUrl(item.repository_url) ? 2 : 0;
    const liveBonus = isHttpsUrl(item.project_url) ? 2 : 0;
    const points = 4 + repoBonus + liveBonus;
    const detail = {
      label: item.title || 'Project', points, status: statusOf(item),
      reason: `4 base${repoBonus ? ' + 2 repository' : ''}${liveBonus ? ' + 2 live project' : ''}`,
      links: [item.repository_url, item.project_url].filter(isHttpsUrl)
    };
    if (statusOf(item) === 'verified') { earned.projects += points; explanations.projects.push(detail); }
    else if (statusOf(item) === 'pending') { pending.projects += points; pendingExplanations.projects.push(detail); }
  });

  all.research.forEach(item => {
    const doiBonus = isDoiUrl(item.doi_url) ? 2 : 0;
    const paperBonus = isHttpsUrl(item.paper_url) ? 1 : 0;
    const points = 8 + doiBonus + paperBonus;
    const detail = {
      label: item.title || 'Research paper', points, status: statusOf(item),
      reason: `8 publication${doiBonus ? ' + 2 valid DOI' : ''}${paperBonus ? ' + 1 paper link' : ''}`,
      links: [item.doi_url, item.paper_url].filter(isHttpsUrl)
    };
    if (statusOf(item) === 'verified') { earned.research += points; explanations.research.push(detail); }
    else if (statusOf(item) === 'pending') { pending.research += points; pendingExplanations.research.push(detail); }
  });

  all.competitions.forEach(item => {
    const level = LEVEL_POINTS[item.level] || 0;
    const result = RESULT_POINTS[item.result_status] || 0;
    const points = level + result;
    const detail = {
      label: item.title || 'Competition', points, status: statusOf(item),
      reason: `${item.level || 'Level'} ${level} + ${item.result_status || 'Result'} ${result}`,
      links: [item.source_url, item.proof_url].filter(isHttpsUrl)
    };
    if (statusOf(item) === 'verified') { earned.competitions += points; explanations.competitions.push(detail); }
    else if (statusOf(item) === 'pending') { pending.competitions += points; pendingExplanations.competitions.push(detail); }
  });

  all.internships.forEach(item => {
    const detail = { label: `${item.company || 'Internship'}${item.role ? ` · ${item.role}` : ''}`, points: 6, status: statusOf(item), reason: 'Verified internship = 6 points.' };
    if (statusOf(item) === 'verified') { earned.internships += 6; explanations.internships.push(detail); }
    else if (statusOf(item) === 'pending') { pending.internships += 6; pendingExplanations.internships.push(detail); }
  });

  const verifiedSkills = all.skills.filter(item => statusOf(item) === 'verified').sort((a, b) => String(a.skill || '').localeCompare(String(b.skill || '')));
  const pendingSkills = all.skills.filter(item => statusOf(item) === 'pending').sort((a, b) => String(a.skill || '').localeCompare(String(b.skill || '')));
  verifiedSkills.forEach((item, index) => {
    const points = index < 20 ? 0.5 : 0;
    earned.skills += points;
    explanations.skills.push({ label: item.skill || 'Skill', points, status: 'verified', reason: points ? 'Verified skill = 0.5 point; maximum 20 scored skills.' : 'Verified, but the 20-skill scoring cap has been reached.' });
  });
  let pendingSkillSlots = Math.max(0, 20 - verifiedSkills.length);
  pendingSkills.forEach((item, index) => {
    const points = index < pendingSkillSlots ? 0.5 : 0;
    pending.skills += points;
    if (points || index === pendingSkillSlots) {
      pendingExplanations.skills.push({
        label: item.skill || 'Skill', points, status: 'pending',
        reason: points ? 'Would add 0.5 point after verification.' : `${pendingSkills.length - pendingSkillSlots} additional pending skill${pendingSkills.length - pendingSkillSlots === 1 ? '' : 's'} are beyond the 20-skill scoring cap.`
      });
    }
  });

  const resumePoints = profile.resume_url ? 3 : 0;
  const completionPoints = profileComplete(profile) ? 2 : 0;
  earned.profile = resumePoints + completionPoints;
  explanations.profile.push({ label: 'Resume uploaded', points: resumePoints, status: profile.resume_url ? 'system-checked' : 'missing', reason: 'Resume presence is checked by the server.' });
  explanations.profile.push({ label: 'Required profile fields complete', points: completionPoints, status: completionPoints ? 'system-checked' : 'incomplete', reason: 'Picture, contact details, branch/year, SSC and HSC/Diploma fields are complete.' });

  Object.keys(earned).forEach(key => { earned[key] = money(earned[key]); pending[key] = money(pending[key]); });
  const points = money(Object.values(earned).reduce((sum, value) => sum + value, 0));
  const pendingPoints = money(Object.values(pending).reduce((sum, value) => sum + value, 0));
  const potentialPoints = money(points + pendingPoints);

  const evidenceCounts = Object.values(all).flat().reduce((acc, item) => {
    const status = statusOf(item);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { pending: 0, verified: 0, rejected: 0 });

  return {
    points,
    pending_points: pendingPoints,
    potential_points: potentialPoints,
    breakdown: earned,
    pending_breakdown: pending,
    explanations,
    pending_explanations: pendingExplanations,
    evidence_counts: evidenceCounts
  };
}

async function buildLeaderboard(currentStudentId, branchQuery, yearQuery) {
  const [students, internships, certificates, projects, research, competitions, skills] = await Promise.all([
    db.select('students'), db.select('internships'), db.select('certificates'), db.select('student_projects'),
    db.select('research_papers'), db.select('student_competitions'), db.select('student_skills')
  ]);
  const currentProfile = students.find(item => item.id === currentStudentId);
  if (!currentProfile) throw new Error('Student profile not found.');

  const branch = branchQuery || currentProfile.branch || 'all';
  const year = yearQuery || currentProfile.year || 'all';
  const related = {
    internships: groupByStudent(internships), certificates: groupByStudent(certificates), projects: groupByStudent(projects),
    research: groupByStudent(research), competitions: groupByStudent(competitions), skills: groupByStudent(skills)
  };

  let cohort = students.filter(item => item.status !== 'inactive');
  if (branch !== 'all') cohort = cohort.filter(item => String(item.branch || '').toUpperCase() === String(branch).toUpperCase());
  if (year !== 'all') cohort = cohort.filter(item => String(item.year || '').toLowerCase() === String(year).toLowerCase());

  const rows = cohort.map(profile => ({
    student_id: profile.id,
    name: profile.name || 'Student',
    prn: profile.prn,
    branch: profile.branch,
    year: profile.year,
    is_me: profile.id === currentStudentId,
    ...scoreStudent(profile, related)
  })).sort((a, b) => b.points - a.points || b.potential_points - a.potential_points || String(a.name).localeCompare(String(b.name)));

  let lastScore = null;
  let lastRank = 0;
  rows.forEach((row, index) => {
    if (lastScore === null || row.points !== lastScore) lastRank = index + 1;
    row.rank = lastRank;
    lastScore = row.points;
  });

  return {
    filters: { branch, year },
    rows,
    current: rows.find(row => row.student_id === currentStudentId) || null,
    rules: {
      version: RULE_VERSION,
      note: 'Rank uses earned points only. Pending potential is shown for transparency but does not affect rank until TPO/TPC verifies the evidence.',
      academics: 'College CGPA: <5 = 0, 5–5.99 = 5, 6–6.99 = 10, 7–7.99 = 15, 8–8.99 = 20, 9+ = 25.',
      certificates: 'Verified certificates: first 5 = 2 each, next 5 = 1.5 each, later certificates = 0.75 each.',
      projects: 'Verified project = 4 base + 2 repository + 2 live project URL.',
      research: 'Verified publication = 8 + 2 valid DOI + 1 paper link.',
      competitions: 'Verified competition = published level points + result points.',
      internships: 'Verified internship = 6 points.',
      skills: 'Verified skill = 0.5 point, maximum 20 scored skills.',
      profile: 'Resume = 3; complete required profile fields = 2.'
    }
  };
}

router.get('/profile', async (req, res) => {
  try {
    const branch = typeof req.query.branch === 'string' ? req.query.branch : '';
    const year = typeof req.query.year === 'string' ? req.query.year : '';
    const data = await buildLeaderboard(req.student.studentId, branch, year);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Transparent ranking view failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'RANKING_FAILED', message: 'Unable to calculate Profile Points.' } });
  }
});

module.exports = router;
