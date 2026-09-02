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

test('TPC desktop chrome is compact instead of consuming the working viewport', () => {
    assert.match(css, /\.observer-shell \.observer-hero[\s\S]*min-height:\s*58px\s*!important/);
    assert.match(css, /\.observer-shell \.observer-hero \.eyebrow,[\s\S]*\.observer-shell \.observer-hero p,[\s\S]*display:\s*none\s*!important/);
    assert.match(css, /\.observer-shell \.observer-overview-disclosure > summary[\s\S]*min-height:\s*38px\s*!important/);
    assert.match(css, /\.observer-shell \.observer-tabs \.tab-btn[\s\S]*min-height:\s*38px\s*!important/);
});

test('TPC student and roster panels own the remaining viewport with internal table scroll', () => {
    assert.match(css, /#observerTab-students\.active,[\s\S]*#observerTab-roster\.active[\s\S]*height:\s*var\(--tpc-active-section-height\)\s*!important/);
    assert.match(css, /#observerTab-students \.table-shell,[\s\S]*#observerTab-roster \.table-shell[\s\S]*height:\s*100%\s*!important/);
    assert.match(css, /overflow:\s*auto\s*!important/);
    assert.match(js, /window\.visualViewport\?\.height \|\| window\.innerHeight/);
    assert.match(js, /const available = Math\.floor\(viewport - Math\.max\(0, rect\.top\) - bottomGap\)/);
    assert.match(js, /dataset\.tpcViewportFit/);
});

test('TPC final layout layer is cache-busted and loaded only for observer workspace', () => {
    const observerBlock = loader.slice(loader.indexOf("if (document.body.classList.contains('observer-shell'))"), loader.indexOf("if (document.body.classList.contains('admin-dashboard-page') || document.body.classList.contains('observer-shell'))"));
    assert.match(observerBlock, /tpc-layout-v2\.css\?v=20260902-2/);
    assert.match(observerBlock, /tpc-layout-v2\.js\?v=20260902-2/);
});
