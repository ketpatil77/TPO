'use strict';

const db = require('../config/database');

const RULE_VERSION = '2026-27 v3.1';
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
  const status = item?.verification_status || 'pending';
  return status === 'approved' ? 'verified' : status;
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function emptyExplanationSet() {
  return { academics: [], certificates: [], projects: [], research: [], competitions: [], internships: [], skills: [], profile: [] };
}

function statusCounts(rows) {
  return (rows || []).reduce((acc, item) => {
    const state = statusOf(item);
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, { pending: 0, verified: 0, rejected: 0 });
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

  earned.academics = cgpaPoints(profile.cgpa_overall);
  explanations.academics.push({
    label: `CGPA ${Number(profile.cgpa_overall || 0).toFixed(2)}`,
    points: earned.academics,
    status: 'auto-counted',
    reason: 'Profile CGPA counts automatically from the published CGPA band; no verification step is required.'
  });

  const certificateSort = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
  const verifiedCertificates = all.certificates.filter(item => statusOf(item) === 'verified').sort(certificateSort);
  const pendingCertificates = all.certificates.filter(item => statusOf(item) === 'pending').sort(certificateSort);

  verifiedCertificates.forEach((item, index) => {
    const points = certificatePointAt(index);
    earned.certificates += points;
    explanations.certificates.push({
      label: item.name || 'Certificate', points, status: 'verified',
      reason: `${item.issuer || 'Issuer'} · verified certificate #${index + 1}.`
    });
  });

  pendingCertificates.forEach((item, index) => {
    const points = certificatePointAt(verifiedCertificates.length + index);
    pending.certificates += points;
    pendingExplanations.certificates.push({
      label: item.name || 'Certificate', points, status: 'pending',
      reason: `${item.issuer || 'Issuer'} · no points until TPO/TPC verification is completed.`
    });
  });

  all.projects.forEach(item => {
    const repoBonus = isHttpsUrl(item.repository_url) ? 2 : 0;
    const liveBonus = isHttpsUrl(item.project_url) ? 2 : 0;
    const points = 4 + repoBonus + liveBonus;
    earned.projects += points;
    explanations.projects.push({
      label: item.title || 'Project', points, status: 'auto-counted',
      reason: `4 base${repoBonus ? ' + 2 repository' : ''}${liveBonus ? ' + 2 live project' : ''}`,
      links: [item.repository_url, item.project_url].filter(isHttpsUrl)
    });
  });

  all.research.forEach(item => {
    const doiBonus = isDoiUrl(item.doi_url) ? 2 : 0;
    const paperBonus = isHttpsUrl(item.paper_url) ? 1 : 0;
    const points = 8 + doiBonus + paperBonus;
    earned.research += points;
    explanations.research.push({
      label: item.title || 'Research paper', points, status: 'auto-counted',
      reason: `8 publication${doiBonus ? ' + 2 valid DOI' : ''}${paperBonus ? ' + 1 paper link' : ''}`,
      links: [item.doi_url, item.paper_url].filter(isHttpsUrl)
    });
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
    if (statusOf(item) === 'verified') {
      earned.competitions += points;
      explanations.competitions.push(detail);
    } else if (statusOf(item) === 'pending') {
      pending.competitions += points;
      pendingExplanations.competitions.push(detail);
    }
  });

  all.internships.forEach(item => {
    earned.internships += 6;
    explanations.internships.push({
      label: `${item.company || 'Internship'}${item.role ? ` · ${item.role}` : ''}`,
      points: 6, status: 'auto-counted', reason: 'Internship record = 6 points.'
    });
  });

  const skills = [...all.skills].sort((a, b) => String(a.skill || '').localeCompare(String(b.skill || '')));
  skills.forEach((item, index) => {
    const points = index < 20 ? 0.5 : 0;
    earned.skills += points;
    explanations.skills.push({
      label: item.skill || 'Skill', points, status: 'auto-counted',
      reason: points ? 'Skill = 0.5 point; maximum 20 scored skills.' : 'Recorded, but the 20-skill scoring cap has been reached.'
    });
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

  const certificateCounts = statusCounts(all.certificates);
  const competitionCounts = statusCounts(all.competitions);
  const evidenceCounts = {
    pending: certificateCounts.pending + competitionCounts.pending,
    verified: certificateCounts.verified + competitionCounts.verified,
    rejected: certificateCounts.rejected + competitionCounts.rejected
  };

  return {
    points,
    pending_points: pendingPoints,
    potential_points: potentialPoints,
    breakdown: earned,
    pending_breakdown: pending,
    explanations,
    pending_explanations: pendingExplanations,
    evidence_counts: evidenceCounts,
    certificate_counts: certificateCounts,
    competition_counts: competitionCounts,
    counts: {
      internships: all.internships.length,
      certificates: all.certificates.length,
      projects: all.projects.length,
      research: all.research.length,
      competitions: all.competitions.length,
      skills: all.skills.length
    }
  };
}

async function signedAvatarMap(cohort) {
  if (db.isLocal()) return new Map();
  const withAvatar = cohort.filter(item => item.avatar_path);
  if (!withAvatar.length) return new Map();
  try {
    const paths = withAvatar.map(item => item.avatar_path);
    const { data, error } = await db.supabaseClient().storage.from('avatars').createSignedUrls(paths, 3600);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((item, index) => {
      if (item?.signedUrl) map.set(withAvatar[index].id, item.signedUrl);
    });
    return map;
  } catch (error) {
    console.warn('Leaderboard avatar signing failed:', error.message);
    return new Map();
  }
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
  const avatars = await signedAvatarMap(cohort);

  const rows = cohort.map(profile => ({
    student_id: profile.id,
    name: profile.name || 'Student',
    prn: profile.prn,
    branch: profile.branch,
    year: profile.year,
    avatar_url: avatars.get(profile.id) || null,
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
      note: 'Certificate and competition points are verification-gated. Pending or rejected evidence earns zero points. Verified evidence is counted immediately on the next ranking calculation.',
      academics: 'Profile CGPA: <5 = 0, 5–5.99 = 5, 6–6.99 = 10, 7–7.99 = 15, 8–8.99 = 20, 9+ = 25. No verification step.',
      certificates: 'Verified certificates only: first 5 verified certificates = 2 points each, next 5 = 1.5 each, later verified certificates = 0.75 each. Pending/rejected certificates = 0.',
      projects: 'Project = 4 base + 2 repository + 2 live project URL.',
      research: 'Publication = 8 + 2 valid DOI + 1 paper link.',
      competitions: 'Competition points count only after TPO/TPC verification: published level points + result points.',
      internships: 'Internship = 6 points.',
      skills: 'Skill = 0.5 point, maximum 20 scored skills.',
      profile: 'Resume = 3; complete required profile fields = 2.'
    }
  };
}

module.exports = {
  RULE_VERSION,
  LEVEL_POINTS,
  RESULT_POINTS,
  cgpaPoints,
  certificatePointAt,
  scoreStudent,
  buildLeaderboard
};
