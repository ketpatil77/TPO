'use strict';

const db = require('../config/database');
const { scoreStudent } = require('./profileRankingEngine');
const { applyCertificateScoringV4 } = require('./rankingScoreV4');

function singletonMap(studentId, rows) {
  return new Map([[studentId, rows || []]]);
}

async function readRankingScoreDetails(studentId) {
  const [profile, internships, certificates, projects, research, competitions, skills] = await Promise.all([
    db.selectOne('students', { id: studentId }),
    db.select('internships', { student_id: studentId }),
    db.select('certificates', { student_id: studentId }),
    db.select('student_projects', { student_id: studentId }),
    db.select('research_papers', { student_id: studentId }),
    db.select('student_competitions', { student_id: studentId }),
    db.select('student_skills', { student_id: studentId })
  ]);

  if (!profile || profile.status === 'inactive') return null;

  const related = {
    internships: singletonMap(studentId, internships),
    certificates: singletonMap(studentId, certificates),
    projects: singletonMap(studentId, projects),
    research: singletonMap(studentId, research),
    competitions: singletonMap(studentId, competitions),
    skills: singletonMap(studentId, skills)
  };

  const scored = {
    student_id: profile.id,
    name: profile.name || 'Student',
    branch: profile.branch || '',
    year: profile.year || '',
    ...scoreStudent(profile, related)
  };

  const adjusted = applyCertificateScoringV4({
    rows: [scored],
    current: scored,
    rules: {}
  });

  return adjusted.rows[0] || null;
}

module.exports = { readRankingScoreDetails };