process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-thirty-two-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreStudent } = require('../src/routes/profileRanking');
const { statusForDatabase, normalizeStoredStatus } = require('../src/routes/proofReview');

function related({ internships = [], certificates = [] } = {}) {
    return {
        internships: new Map([['student-1', internships]]),
        certificates: new Map([['student-1', certificates]]),
        projects: new Map(),
        research: new Map(),
        competitions: new Map(),
        skills: new Map()
    };
}

const profile = {
    id: 'student-1',
    cgpa_overall: 0,
    academic_verification_status: 'pending',
    avatar_path: null,
    email: null,
    phone: null,
    branch: 'CT',
    year: 'Third Year',
    ssc_marks: null,
    hsc_marks: null,
    resume_url: null,
    activities: ''
};

test('certificate and internship points are zero until proof is verified', () => {
    const result = scoreStudent(profile, related({
        internships: [{ student_id: 'student-1', company: 'Pending Co', verification_status: 'pending' }],
        certificates: [{ student_id: 'student-1', name: 'Pending Cert', verification_status: 'pending' }]
    }));
    assert.equal(result.breakdown.internships, 0);
    assert.equal(result.breakdown.certificates, 0);
});

test('verified certificate and internship earn their configured points', () => {
    const result = scoreStudent(profile, related({
        internships: [{ student_id: 'student-1', company: 'Verified Co', verification_status: 'verified' }],
        certificates: [{ student_id: 'student-1', name: 'Verified Cert', verification_status: 'verified' }]
    }));
    assert.equal(result.breakdown.internships, 6);
    assert.equal(result.breakdown.certificates, 2);
});

test('TPO/TPC approve action persists as verified for both proof types', () => {
    assert.equal(statusForDatabase('internship', 'approved'), 'verified');
    assert.equal(statusForDatabase('certificate', 'approved'), 'verified');
    assert.equal(normalizeStoredStatus('internship', 'verified'), 'approved');
    assert.equal(normalizeStoredStatus('certificate', 'verified'), 'approved');
});
