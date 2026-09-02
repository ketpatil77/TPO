process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'tpc-layout-v2.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'js', 'tpc-layout-v2.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public', 'js', 'portal-responsive.js'), 'utf8');

test('TPC desktop navigation keeps all six workspace tools on one row', () => {
    assert.match(css, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)\s*!important/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.observer-shell \.dashboard-wrapper \.observer-tabs/);
});

test('TPC student and roster panels own the remaining desktop viewport', () => {
    assert.match(css, /#observerTab-students\.active/);
    assert.match(css, /#observerTab-roster\.active/);
    assert.match(css, /height:\s*var\(--tpc-active-section-height\)\s*!important/);
    assert.match(js, /visualViewport\?\.height \|\| window\.innerHeight/);
    assert.match(js, /dataset\.tpcViewportFit/);
});

test('TPC readiness directory exposes completion, readable evidence and unified actions', () => {
    assert.match(js, /Profile completion/);
    assert.match(js, /profile_completion/);
    assert.match(js, /tpc-completion-track/);
    assert.match(js, /evidenceItem\('IN'/);
    assert.match(js, /evidenceItem\('COMP'/);
    assert.match(js, /tpc-action-profile/);
    assert.match(css, /\.tpc-readiness-table/);
    assert.match(css, /\.tpc-evidence-strip/);
    assert.match(css, /\.tpc-completion-state\.is-complete/);
});

test('TPC final layout layer is loaded only for observer workspace with current cache version', () => {
    const observerBlock = loader.slice(loader.indexOf("if (document.body.classList.contains('observer-shell'))"), loader.indexOf("if (document.body.classList.contains('admin-dashboard-page') || document.body.classList.contains('observer-shell'))"));
    assert.match(observerBlock, /tpc-layout-v2\.css\?v=20260902-3/);
    assert.match(observerBlock, /tpc-layout-v2\.js\?v=20260902-3/);
});
