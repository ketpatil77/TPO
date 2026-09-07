const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Worker retains a queue handler while certificate-fraud consumer binding exists', () => {
    const worker = read('worker/index.mjs');
    assert.match(worker, /async queue\(batch, env, context\)/);
    assert.match(worker, /certificate-fraud processing has been removed/);
});

test('TPO/TPC proof review offers internship and certificate review', () => {
    const ui = read('public/js/proof-review-ui.js');
    const loader = read('public/js/portal-responsive.js');
    assert.match(ui, /option value="internship"/);
    assert.match(ui, /option value="certificate"/);
    assert.match(loader, /proof-review-ui\.js/);
});

test('proof-review backend accepts both internship and certificate review types', () => {
    const route = read('src/routes/proofReview.js');
    assert.match(route, /if \(type === 'certificate'\) return 'certificates'/);
});
