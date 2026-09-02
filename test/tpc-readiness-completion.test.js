process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProfileCompletion, semesterComplete } = require('../src/utils/profileCompletionModel');

function baseStudent(overrides = {}) {
  return {
    name: 'Ketan Vilas Patil',
    email: 'ketan@example.com',
    phone: '9876543210',
    avatar_path: 'avatars/ketan.jpg',
    ssc_marks: 82,
    hsc_marks: 76,
    resume_url: 'resumes/ketan.pdf',
    cgpa_semesterwise: { sem1: 7.1, sem2: 7.4, sem3: 7.8, sem4: 8.0, sem5: 8.2 },
    ...overrides
  };
}

function completeInput(overrides = {}) {
  return {
    student: baseStudent(),
    skills: ['JavaScript'],
    internships: [{ id: 'i1' }],
    certificates: [{ id: 'c1' }],
    projects: [{ id: 'p1' }],
    research_papers: [{ id: 'r1' }],
    competitions: [{ id: 'x1' }],
    declarations: {},
    ...overrides
  };
}

test('TPC completion mirrors student weighted readiness and reaches 100 percent', () => {
  const result = calculateProfileCompletion(completeInput());
  assert.equal(result.percent, 100);
  assert.equal(result.state, 'complete');
  assert.deepEqual(result.missing, []);
});

test('none declarations resolve optional sections without awarding fake records', () => {
  const result = calculateProfileCompletion(completeInput({
    certificates: [], projects: [], research_papers: [], internships: [], competitions: [],
    declarations: {
      no_certificates: true,
      no_projects: true,
      no_research: true,
      no_internships: true,
      no_competitions: true
    }
  }));
  assert.equal(result.percent, 100);
  assert.equal(result.optional.every(item => item.resolved), true);
  assert.equal(result.optional.every(item => item.records === 0), true);
});

test('pending future semester does not reduce completion but a gap does', () => {
  assert.equal(semesterComplete(baseStudent({ lateral_entry: true, cgpa_semesterwise: { sem3: 7.2, sem4: 7.4, sem5: 7.8 } }), { percentage_or_cgpa: 78 }), true);
  assert.equal(semesterComplete(baseStudent({ lateral_entry: true, cgpa_semesterwise: { sem3: 7.2, sem5: 7.8 } }), { percentage_or_cgpa: 78 }), false);
});

test('missing core data and unresolved optional sections are reported for TPC', () => {
  const result = calculateProfileCompletion(completeInput({
    student: baseStudent({ phone: '', resume_url: null }),
    projects: [],
    declarations: {}
  }));
  assert.ok(result.percent < 100);
  assert.ok(result.missing.includes('Phone'));
  assert.ok(result.missing.includes('Resume'));
  assert.ok(result.missing.includes('Projects'));
  assert.equal(result.missing_count, result.missing.length);
});
