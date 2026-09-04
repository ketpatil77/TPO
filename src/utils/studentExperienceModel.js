'use strict';

const CATEGORY_WEIGHTS = Object.freeze({
  academics: 20,
  resume: 15,
  skills: 20,
  experience: 15,
  projects: 15,
  credentials: 10,
  presence: 5
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function statusOf(item) {
  const value = String(item?.verification_status || '').toLowerCase();
  if (value === 'approved') return 'verified';
  return value || 'pending';
}

function semesterValues(student) {
  const values = Object.values(student?.cgpa_semesterwise || {}).map(number).filter(value => value > 0);
  return values;
}

function calculateReadiness(bundle = {}) {
  const student = bundle.student || {};
  const internships = list(bundle.internships);
  const certificates = list(bundle.certificates);
  const competitions = list(bundle.competitions);
  const projects = list(bundle.projects);
  const skills = list(bundle.skills);
  const links = bundle.links || { github_url: student.github_url || '', portfolio_url: student.portfolio_url || '' };

  const academicSignals = [
    number(student.cgpa_overall) > 0,
    number(student.ssc_marks) > 0,
    number(student.hsc_marks) > 0,
    semesterValues(student).length > 0
  ];
  const academics = Math.round(CATEGORY_WEIGHTS.academics * academicSignals.filter(Boolean).length / academicSignals.length);
  const resume = student.resume_url ? CATEGORY_WEIGHTS.resume : 0;
  const skillsScore = Math.round(CATEGORY_WEIGHTS.skills * clamp(skills.length / 10, 0, 1));
  const experience = Math.round(CATEGORY_WEIGHTS.experience * clamp(internships.length / 2, 0, 1));
  const projectQuality = projects.reduce((sum, item) => {
    const linksCount = [item?.project_url, item?.repository_url].filter(Boolean).length;
    return sum + 1 + Math.min(linksCount, 2) * 0.25;
  }, 0);
  const projectsScore = Math.round(CATEGORY_WEIGHTS.projects * clamp(projectQuality / 3, 0, 1));
  const verifiedCertificates = certificates.filter(item => statusOf(item) === 'verified').length;
  const verifiedCompetitions = competitions.filter(item => statusOf(item) === 'verified').length;
  const credentials = Math.round(CATEGORY_WEIGHTS.credentials * clamp((verifiedCertificates + verifiedCompetitions * 1.5) / 5, 0, 1));
  const presence = (links.github_url ? 3 : 0) + (links.portfolio_url ? 2 : 0);

  const breakdown = {
    academics: { label: 'Academics', score: academics, max: CATEGORY_WEIGHTS.academics },
    resume: { label: 'Resume', score: resume, max: CATEGORY_WEIGHTS.resume },
    skills: { label: 'Skills', score: skillsScore, max: CATEGORY_WEIGHTS.skills },
    experience: { label: 'Experience', score: experience, max: CATEGORY_WEIGHTS.experience },
    projects: { label: 'Projects', score: projectsScore, max: CATEGORY_WEIGHTS.projects },
    credentials: { label: 'Verified credentials', score: credentials, max: CATEGORY_WEIGHTS.credentials },
    presence: { label: 'Professional presence', score: presence, max: CATEGORY_WEIGHTS.presence }
  };
  const score = Object.values(breakdown).reduce((sum, row) => sum + row.score, 0);
  return { score: clamp(score), breakdown };
}

function profileCompletion(bundle = {}) {
  const student = bundle.student || {};
  const checks = [
    student.name,
    student.email,
    student.phone,
    student.avatar_path,
    student.branch,
    student.year,
    number(student.ssc_marks) > 0,
    number(student.hsc_marks) > 0,
    number(student.cgpa_overall) > 0,
    student.resume_url,
    list(bundle.skills).length > 0
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function strengthMap(bundle = {}) {
  const ready = calculateReadiness(bundle);
  const categories = [
    { key: 'academics', label: 'Academics', tab: 'edit-profile' },
    { key: 'resume', label: 'Resume', tab: 'edit-profile' },
    { key: 'skills', label: 'Skills', tab: 'edit-profile' },
    { key: 'experience', label: 'Experience', tab: 'internships' },
    { key: 'projects', label: 'Projects', tab: 'projects' },
    { key: 'credentials', label: 'Credentials', tab: 'certificates' },
    { key: 'presence', label: 'Links', tab: 'edit-profile' }
  ];
  return categories.map(item => {
    const row = ready.breakdown[item.key];
    const ratio = row.max ? row.score / row.max : 0;
    return {
      ...item,
      score: row.score,
      max: row.max,
      state: ratio >= 0.95 ? 'strong' : ratio >= 0.5 ? 'partial' : 'missing'
    };
  });
}

function nextBestAction({ bundle = {}, corrections = [], opportunities = [] } = {}) {
  const student = bundle.student || {};
  const links = bundle.links || {};
  const openCorrection = list(corrections).find(item => item.status === 'open');
  if (openCorrection) {
    return { priority: 100, title: `Fix ${openCorrection.field_name || 'profile correction'}`, detail: openCorrection.message || 'Placement staff requested an update.', tab: 'opportunities', kind: 'correction' };
  }
  if (!student.avatar_path) return { priority: 95, title: 'Add your profile picture', detail: 'Complete the identity section recruiters and placement staff see first.', tab: 'edit-profile', kind: 'profile' };
  if (!student.resume_url) return { priority: 92, title: 'Upload your resume', detail: 'Unlock resume review and strengthen placement readiness.', tab: 'edit-profile', kind: 'resume' };
  if (list(bundle.skills).length < 5) return { priority: 88, title: 'Add your strongest skills', detail: 'Add at least 5 relevant skills to improve opportunity matching.', tab: 'edit-profile', kind: 'skills' };
  if (!number(student.cgpa_overall)) return { priority: 86, title: 'Complete semester CGPA', detail: 'Academic readiness and eligibility depend on accurate results.', tab: 'edit-profile', kind: 'academics' };
  if (!list(bundle.internships).length) return { priority: 78, title: 'Add internship experience', detail: 'Practical experience raises profile strength and recruiter confidence.', tab: 'internships', kind: 'experience' };
  if (!list(bundle.projects).length) return { priority: 74, title: 'Add your best project', detail: 'Show practical work with a repository or live link.', tab: 'projects', kind: 'projects' };

  const pending = [...list(bundle.certificates), ...list(bundle.competitions)].filter(item => statusOf(item) === 'pending');
  if (pending.length) return { priority: 70, title: `${pending.length} verification item${pending.length === 1 ? '' : 's'} pending`, detail: 'Keep evidence ready. Verified records can improve your standing.', tab: 'certificates', kind: 'verification' };
  if (!links.github_url) return { priority: 65, title: 'Connect your GitHub profile', detail: 'Give recruiters a direct path to your technical work.', tab: 'edit-profile', kind: 'presence' };

  const best = list(opportunities).filter(item => item?.status === 'open' && item?.eligibility?.eligible && !item?.application).sort((a, b) => number(b.eligibility?.score) - number(a.eligibility?.score))[0];
  if (best) return { priority: 60, title: `Review ${best.company || 'your best'} opportunity`, detail: `${number(best.eligibility?.score)}% profile match${best.role ? ` for ${best.role}` : ''}.`, tab: 'opportunities', kind: 'opportunity', opportunity_id: best.id };

  return { priority: 10, title: 'Your profile is in strong shape', detail: 'Keep achievements, projects, and results current as they change.', tab: 'overview', kind: 'maintain' };
}

function achievements({ bundle = {}, ranking = null, readiness = null } = {}) {
  const student = bundle.student || {};
  const ready = readiness || calculateReadiness(bundle);
  const rows = [];
  const add = (key, label, detail, tier = 'standard') => rows.push({ key, label, detail, tier });

  if (profileCompletion(bundle) >= 100) add('profile-complete', 'Profile Complete', 'All essential profile signals are present.', 'verified');
  if (ready.score >= 80) add('placement-ready', 'Placement Ready', `Career readiness reached ${ready.score}/100.`, 'verified');
  if (student.resume_url) add('resume-ready', 'Resume Ready', 'A resume is available for placement workflows.');
  const rank = number(ranking?.rank);
  const cohort = number(ranking?.cohort_size);
  if (rank > 0 && rank <= 3) add('top-3', 'Top 3', `Current placement profile rank #${rank}.`, 'elite');
  else if (rank > 0 && cohort > 0 && rank / cohort <= 0.1) add('top-10-percent', 'Top 10%', `Rank #${rank} of ${cohort}.`, 'elite');

  const verifiedCertificates = list(bundle.certificates).filter(item => statusOf(item) === 'verified').length;
  if (verifiedCertificates >= 5) add('five-verified-certificates', '5 Verified Certificates', `${verifiedCertificates} certificates are verified.`, 'verified');
  else if (verifiedCertificates >= 1) add('first-verified-certificate', 'Verified Credential', 'Your first certificate is verified.', 'verified');
  if (list(bundle.internships).length) add('internship-builder', 'Experience Builder', `${list(bundle.internships).length} internship record${list(bundle.internships).length === 1 ? '' : 's'} added.`);
  if (list(bundle.projects).length >= 3) add('project-builder', 'Project Builder', `${list(bundle.projects).length} projects in your portfolio.`, 'elite');
  else if (list(bundle.projects).length) add('first-project', 'Project Published', 'Practical work is visible on your profile.');
  if (list(bundle.research_papers).length) add('research-contributor', 'Research Contributor', `${list(bundle.research_papers).length} research record${list(bundle.research_papers).length === 1 ? '' : 's'} added.`, 'verified');
  if (list(bundle.skills).length >= 10) add('skill-builder', 'Skill Builder', `${list(bundle.skills).length} professional skills recorded.`);
  return rows.slice(0, 8);
}

function classifyNotification(item = {}) {
  const text = `${item.title || ''} ${item.message || ''}`.toLowerCase();
  if (/verify|verified|certificate|proof|evidence/.test(text)) return 'Verification';
  if (/drive|placement|job|application|interview|offer|company/.test(text)) return 'Placements';
  if (/rank|point|leaderboard/.test(text)) return 'Ranking';
  if (/profile|resume|skill|correction/.test(text)) return 'Profile';
  return item.priority === 'important' ? 'Important' : 'General';
}

module.exports = {
  CATEGORY_WEIGHTS,
  calculateReadiness,
  profileCompletion,
  strengthMap,
  nextBestAction,
  achievements,
  classifyNotification,
  statusOf
};
