const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('certificate verification is absent from the TPO proof-review frontend', () => {
    const js = read('public/js/proof-review-ui.js');
    assert.doesNotMatch(js, /Certificate/i);
    assert.doesNotMatch(js, /certificate/i);
    assert.match(js, /Review uploaded internship proofs\./);
    assert.match(js, /type: 'internship'/);
});

test('certificate verification is rejected by the proof-review backend', () => {
    const route = read('src/routes/proofReview.js');
    assert.doesNotMatch(route, /type === ['"]certificate['"]/);
    assert.match(route, /Only internship proofs can be reviewed\./);
});

test('legacy dedicated TPO certificate-review assets remain removed', () => {
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'public/js/tpo-certificate-review.js')), false);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'public/css/tpo-certificate-review.css')), false);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'test/certificate-fraud-ui.test.js')), false);
});
