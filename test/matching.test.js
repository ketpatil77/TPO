const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTerm, scoreCandidate } = require('../src/utils/matching');

test('normalizes common skill aliases', () => {
    assert.equal(normalizeTerm('JS'), 'javascript');
    assert.equal(normalizeTerm('Postgres'), 'postgresql');
});

test('hard criteria reject ineligible student', () => {
    const result = scoreCandidate({ branch: 'Civil', year: '2026', cgpa_overall: 6, skills: [] }, {
        branches: ['Computer Engineering'], min_cgpa: 7, graduation_year: '2026', required_skills: ['JavaScript'], preferred_skills: [], keywords: []
    });
    assert.equal(result.eligible, false);
    assert.equal(result.score, 0);
    assert.ok(result.reasons.length >= 2);
});

test('eligible student receives explainable weighted score', () => {
    const result = scoreCandidate({
        branch: 'Computer Engineering', year: 'Final Year', cgpa_overall: 8.5,
        skills: [{ skill: 'JS' }, { skill: 'SQL' }],
        internships: [{ company: 'Acme', role: 'Backend API Intern' }],
        certificates: [{ name: 'Cloud API', issuer: 'AWS' }], activities: 'Built backend API'
    }, {
        branches: ['Computer Engineering'], min_cgpa: 7, graduation_year: null,
        required_skills: ['javascript'], preferred_skills: ['sql'], keywords: ['backend', 'api']
    });
    assert.equal(result.eligible, true);
    assert.equal(result.score, 95);
    assert.deepEqual(result.missing_required, []);
});
