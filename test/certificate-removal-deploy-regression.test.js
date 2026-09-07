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

test('TPO/TPC proof review no longer offers certificate review and cache-busts the removal', () => {
    const ui = read('public/js/proof-review-ui.js');
    const loader = read('public/js/portal-responsive.js');
    assert.match(ui, /option value=\\"internship\\"/);
    assert.doesNotMatch(ui, /option value=\\"certificate\\"/);
    assert.doesNotMatch(ui, /certificate verification/i);
    assert.match(loader, /proof-review-ui\.js\?v=20260907-cert-removal1/);
});

test('proof-review backend rejects certificate review type explicitly', () => {
    const route = read('src/routes/proofReview.js');
    assert.match(route, /return type === 'internship' \? 'internships' : null/);
    assert.match(route, /Only internship proofs can be reviewed/);
    assert.doesNotMatch(route, /return 'certificates'/);
});
