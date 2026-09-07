const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('certificate verification is included in the TPO proof-review frontend', () => {
    const js = read('public/js/proof-review-ui.js');
    assert.match(js, /certificate/i);
    assert.match(js, /option value="certificate"/);
});

test('certificate verification is accepted by the proof-review backend', () => {
    const route = read('src/routes/proofReview.js');
    assert.match(route, /if \(type === 'certificate'\) return 'certificates'/);
});

test('legacy dedicated TPO certificate-review assets remain removed', () => {
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'public/js/tpo-certificate-review.js')), false);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'public/css/tpo-certificate-review.css')), false);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'test/certificate-fraud-ui.test.js')), false);
});
