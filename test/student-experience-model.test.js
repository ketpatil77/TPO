const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/utils/studentExperienceModel');

function strongBundle() {
  return {
    student: {
      name: 'Student Example', email: 'student@example.com', phone: '9999999999', avatar_path: 'avatar.png',
      branch: 'CT', year: 'Final Year', ssc_marks: 82, hsc_marks: 78, cgpa_overall: 8.4,
      cgpa_semesterwise: { sem1: 8, sem2: 8.2 }, resume_url: 'resume.pdf',
      github_url: 'https://github.com/student', portfolio_url: 'https://portfolio.example'
    },
    skills: Array.from({ length: 10 }, (_, i) => ({ skill: `Skill ${i + 1}` })),
    internships: [{ company: 'A' }, { company: 'B' }],
    projects: [
      { title:'One', project_url:'https://one.example', repository_url:'https://github.com/student/one' },
      { title:'Two', project_url:'https://two.example', repository_url:'https://github.com/student/two' },
      { title:'Three', project_url:'https://three.example', repository_url:'https://github.com/student/three' }
    ],
    certificates: Array.from({ length: 5 }, (_, i) => ({ name:`Cert ${i}`, verification_status:'verified' })),
    competitions: [], research_papers: [],
    links: { github_url:'https://github.com/student', portfolio_url:'https://portfolio.example' }
  };
}

test('career readiness is a strict 100 point model', () => {
  const result = model.calculateReadiness(strongBundle());
  assert.equal(result.score, 100);
  assert.equal(Object.values(result.breakdown).reduce((sum, row) => sum + row.max, 0), 100);
});

test('empty profile does not receive fake readiness', () => {
  const result = model.calculateReadiness({ student:{}, skills:[], internships:[], projects:[], certificates:[], competitions:[] });
  assert.equal(result.score, 0);
});

test('next best action gives staff corrections priority over gamification', () => {
  const action = model.nextBestAction({ bundle: strongBundle(), corrections: [{ status:'open', field_name:'Resume', message:'Upload the corrected resume.' }], opportunities: [] });
  assert.equal(action.kind, 'correction');
  assert.equal(action.tab, 'opportunities');
});

test('achievement engine rewards verified and ranked outcomes', () => {
  const bundle = strongBundle();
  const ready = model.calculateReadiness(bundle);
  const rows = model.achievements({ bundle, readiness: ready, ranking: { rank:2, cohort_size:80 } });
  const keys = new Set(rows.map(row => row.key));
  assert.ok(keys.has('placement-ready'));
  assert.ok(keys.has('top-3'));
  assert.ok(keys.has('five-verified-certificates'));
  assert.ok(keys.has('project-builder'));
});

test('profile strength map always exposes navigable categories', () => {
  const rows = model.strengthMap(strongBundle());
  assert.deepEqual(rows.map(row => row.key), ['academics','resume','skills','experience','projects','credentials','presence']);
  assert.ok(rows.every(row => row.tab && ['strong','partial','missing'].includes(row.state)));
});

test('notification classifier separates placement and verification traffic', () => {
  assert.equal(model.classifyNotification({ title:'Certificate verified' }), 'Verification');
  assert.equal(model.classifyNotification({ title:'New placement drive' }), 'Placements');
  assert.equal(model.classifyNotification({ title:'Rank increased' }), 'Ranking');
});
