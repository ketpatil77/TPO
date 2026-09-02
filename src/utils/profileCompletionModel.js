const OPTIONALS = [
  ['certificates', 'Certifications', 'no_certificates'],
  ['projects', 'Projects', 'no_projects'],
  ['research_papers', 'Research papers', 'no_research'],
  ['internships', 'Internships', 'no_internships'],
  ['competitions', 'Competitions', 'no_competitions']
];

function semesterComplete(student = {}, diploma = null) {
  const semesters = student.cgpa_semesterwise || {};
  const start = (student.lateral_entry || diploma) ? 3 : 1;
  const entered = [];
  for (let i = start; i <= 8; i += 1) {
    if (Number(semesters[`sem${i}`]) > 0) entered.push(i);
  }
  if (!entered.length) return false;
  const highest = Math.max(...entered);
  for (let i = start; i <= highest; i += 1) {
    if (!(Number(semesters[`sem${i}`]) > 0)) return false;
  }
  return true;
}

function nameComplete(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).length >= 3;
}

function calculateProfileCompletion(input = {}) {
  const student = input.student || {};
  const declarations = input.declarations || {};
  const core = [
    ['Full name', nameComplete(student.name)],
    ['Email', Boolean(String(student.email || '').trim())],
    ['Phone', Boolean(String(student.phone || '').trim())],
    ['Profile photo', Boolean(student.avatar_path)],
    ['SSC marks', Number(student.ssc_marks) > 0],
    ['HSC / Diploma marks', Number(student.hsc_marks) > 0],
    ['Semester CGPA', semesterComplete(student, input.diploma)],
    ['Resume', Boolean(student.resume_url)]
  ];
  const skillsComplete = Array.isArray(input.skills) && input.skills.length > 0;
  const optional = OPTIONALS.map(([key, label, declarationKey]) => {
    const records = Array.isArray(input[key]) ? input[key] : [];
    const declared = records.length === 0 && Boolean(declarations[declarationKey]);
    return { key, label, declarationKey, records: records.length, declared, resolved: records.length > 0 || declared };
  });
  const missingCore = core.filter(([, complete]) => !complete).map(([label]) => label);
  const missing = [
    ...missingCore,
    ...(skillsComplete ? [] : ['Skills']),
    ...optional.filter(item => !item.resolved).map(item => item.label)
  ];
  const weightedDone = core.filter(([, complete]) => complete).length * 2
    + (skillsComplete ? 1 : 0)
    + optional.filter(item => item.resolved).length;
  const weightedTotal = core.length * 2 + 1 + OPTIONALS.length;
  const percent = Math.round((weightedDone / weightedTotal) * 100);
  const state = percent === 100 ? 'complete' : percent >= 80 ? 'strong' : percent >= 50 ? 'building' : 'attention';
  return {
    percent,
    state,
    missing,
    missing_count: missing.length,
    missing_core: missingCore,
    skills_complete: skillsComplete,
    core_complete: missingCore.length === 0,
    optional
  };
}

module.exports = { calculateProfileCompletion, semesterComplete, nameComplete, OPTIONALS };
