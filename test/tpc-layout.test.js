process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'tpc-layout-v2.css'), 'utf8');
const page12Css = fs.readFileSync(path.join(root, 'public', 'css', 'tpc-directory-12.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'js', 'tpc-layout-v2.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public', 'js', 'portal-responsive.js'), 'utf8');

test('TPC desktop navigation keeps all six workspace tools on one row', () => {
    assert.match(css, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)\s*!important/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.observer-shell \.dashboard-wrapper \.observer-tabs/);
});

test('TPC roster keeps viewport fitting while student directory uses natural paginated height', () => {
    assert.match(css, /#observerTab-roster\.active/);
    assert.match(css, /height:\s*var\(--tpc-active-section-height\)\s*!important/);
    assert.match(js, /section\.id === 'observerTab-students'/);
    assert.match(js, /twelve-row-natural/);
    assert.match(js, /visualViewport\?\.height \|\| window\.innerHeight/);
    assert.match(page12Css, /#observerTab-students\.active[\s\S]*height:\s*auto\s*!important/);
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

test('TPC Student Profiles is exactly 12 records per page with no nested vertical table scroll', () => {
    assert.match(js, /const STUDENT_PAGE_SIZE = 12/);
    assert.match(js, /pageSize:\s*STUDENT_PAGE_SIZE/);
    assert.match(js, /enhancedLoadStudents\(\{ returnToTop: true \}\)/);
    assert.match(page12Css, /#observerTab-students \.table-shell[\s\S]*overflow:\s*visible\s*!important/);
    assert.match(page12Css, /#observerTab-students \.tpc-directory-row td[\s\S]*padding:\s*7px 10px\s*!important/);
    assert.match(page12Css, /tpc-directory-focus \.observer-hero/);
});

test('TPC final layout layers are loaded only for observer workspace with current cache version', () => {
    const observerBlock = loader.slice(loader.indexOf("if (document.body.classList.contains('observer-shell'))"), loader.indexOf("if (document.body.classList.contains('admin-dashboard-page') || document.body.classList.contains('observer-shell'))"));
    assert.match(observerBlock, /tpc-layout-v2\.css\?v=20260902-4/);
    assert.match(observerBlock, /tpc-directory-12\.css\?v=20260902-1/);
    assert.match(observerBlock, /tpc-layout-v2\.js\?v=20260902-5/);
});
