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

test('TPC student and roster tables use remaining viewport and remove old max-height cap', () => {
    assert.match(css, /#observerTab-students \.table-shell/);
    assert.match(css, /#observerTab-roster \.table-shell/);
    assert.match(css, /max-height:\s*none\s*!important/);
    assert.match(js, /visualViewport\?\.height \|\| window\.innerHeight/);
    assert.match(js, /paginationHeight\(section\)/);
    assert.match(js, /dataset\.tpcViewportFill/);
});

test('TPC final layout layer is loaded only for observer workspace', () => {
    const observerBlock = loader.slice(loader.indexOf("if (document.body.classList.contains('observer-shell'))"), loader.indexOf("if (document.body.classList.contains('admin-dashboard-page') || document.body.classList.contains('observer-shell'))"));
    assert.match(observerBlock, /tpc-layout-v2\.css\?v=20260902-1/);
    assert.match(observerBlock, /tpc-layout-v2\.js\?v=20260902-1/);
});
