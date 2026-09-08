const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAtsProfile, scoreAtsText } = require('../src/utils/pdfSkillExtractor');

test('ATS resolves common software developer labels to software profile', () => {
    assert.equal(resolveAtsProfile('SW Developer'), 'software');
    assert.equal(resolveAtsProfile('software developer'), 'software');
    assert.equal(resolveAtsProfile('Data Scientist'), 'data');
});

test('ATS uses boundary-aware matching for short technology terms', () => {
    const result = scoreAtsText('I built a JavaScript web application using React and SQL.', 'software');
    assert.ok(result.matched.includes('javascript'));
    assert.ok(!result.matched.includes('python'));
    assert.ok(!result.matched.includes('java'));
});

test('ATS score changes with the selected role', () => {
    const resume = 'Python SQL pandas numpy statistics data analysis machine learning Tableau';
    const dataResult = scoreAtsText(resume, 'data');
    const softwareResult = scoreAtsText(resume, 'software');
    assert.ok(dataResult.score > softwareResult.score);
    assert.equal(dataResult.role, 'Data Scientist / Analyst');
    assert.equal(softwareResult.role, 'Software Engineer');
});

test('ATS does not give a generic GitHub bonus in text scoring', () => {
    const withoutGitHub = scoreAtsText('GitHub profile only.', 'software');
    const withGitHubWord = scoreAtsText('GitHub GitHub GitHub.', 'software');
    assert.equal(withoutGitHub.score, withGitHubWord.score);
});
