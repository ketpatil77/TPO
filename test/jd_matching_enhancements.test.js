process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/server');
const { normalizeTerm, normalizeTerms, scoreCandidate } = require('../src/utils/matching');
const { callGroqJson } = require('../src/utils/groqClient');

test('Synonym Normalization: Maps skill variants to canonical names', () => {
    assert.equal(normalizeTerm('JS'), 'javascript');
    assert.equal(normalizeTerm('ML'), 'machine learning');
    assert.equal(normalizeTerm('TS'), 'typescript');
    assert.equal(normalizeTerm('Py'), 'python');
    assert.equal(normalizeTerm('Postgres'), 'postgresql');
    assert.equal(normalizeTerm('K8s'), 'kubernetes');
    assert.equal(normalizeTerm('AI'), 'artificial intelligence');
    assert.equal(normalizeTerm('React.js'), 'react');
    assert.equal(normalizeTerm('CI/CD'), 'ci/cd');

    const rawList = ['JS', 'ML', 'Py', 'React', 'TypeScript', 'NodeJS'];
    const normalized = normalizeTerms(rawList);
    assert.deepEqual(normalized, ['javascript', 'machine learning', 'python', 'react', 'typescript', 'node.js']);
});

test('Matching Engine: Synonym-aware matching scores candidate with skill acronyms accurately', () => {
    const driveCriteria = {
        min_cgpa: 7.0,
        branches: ['CT', 'AIML'],
        required_skills: ['JavaScript', 'Machine Learning', 'Python'],
        preferred_skills: ['Docker', 'Kubernetes'],
        keywords: ['fullstack', 'model training']
    };

    // Candidate A uses acronyms ("JS", "ML", "Py", "Docker", "K8s")
    const candidateAbbrev = {
        id: 'c1',
        name: 'Abbrev Student',
        branch: 'CT',
        cgpa_overall: 8.2,
        year: 'Final Year',
        skills: [{ skill: 'JS' }, { skill: 'ML' }, { skill: 'Py' }, { skill: 'Docker' }, { skill: 'K8s' }],
        projects: [{ title: 'AI Platform', summary: 'fullstack model training', technologies: 'JS, Py' }],
        internships: [{ company: 'TechCorp', role: 'Fullstack ML Engineer' }]
    };

    // Candidate B missing required skills
    const candidateUnmatched = {
        id: 'c2',
        name: 'Unmatched Student',
        branch: 'ME',
        cgpa_overall: 6.5,
        year: 'Final Year',
        skills: [{ skill: 'CAD' }, { skill: 'Thermodynamics' }]
    };

    const matchA = scoreCandidate(candidateAbbrev, driveCriteria);
    const matchB = scoreCandidate(candidateUnmatched, driveCriteria);

    assert.equal(matchA.eligible, true, 'Abbreviation candidate should be eligible');
    assert.ok(matchA.score >= 70, `Candidate score should be >= 70, got ${matchA.score}`);
    assert.equal(matchA.missing_required.length, 0, 'No missing required skills when using synonyms');

    assert.equal(matchB.eligible, false, 'Unmatched candidate should not be eligible');
    assert.equal(matchB.score, 0);
});

test('Groq Client retries 429 responses without external network and falls back', async () => {
    process.env.GROQ_API_KEY = 'test-only-key';
    let calls = 0;
    const result = await callGroqJson('system', 'user', {
        fetchImpl: async () => {
            calls += 1;
            return { status: 429, ok: false };
        },
        sleep: async () => {},
        random: () => 0
    });
    delete process.env.GROQ_API_KEY;

    assert.equal(result, null);
    assert.equal(calls, 3);
});

test('JD parser uses deterministic fallback when Groq is not configured', async () => {
    delete process.env.GROQ_API_KEY;

    const sampleJd = `Looking for a Senior Software Engineer for CT and AIML branch with CGPA > 7.5.
    Required skills: Python, Machine Learning, Docker, SQL.
    Apply by 2026-12-31. Location: Pune.`;

    const adminToken = require('jsonwebtoken').sign({ role: 'admin', adminId: 'admin1', sessionVersion: 2 }, process.env.JWT_SECRET);

    const res = await request(app)
        .post('/api/admin/intelligence/jd-parser')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ jd_text: sampleJd })
        .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.branches));
    assert.equal(res.body.data.min_cgpa, 7.5);
    assert.ok(res.body.data.skills.includes('python'));
    assert.ok(res.body.data.skills.includes('machine learning'));

});
