const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('all portal shells load final responsive CSS and accessible section navigation', () => {
    for (const page of ['index','dashboard','admin-dashboard','observer-dashboard']) {
        const html=read(`public/${page}.html`);
        assert.match(html,/portal-responsive\.css/);
        assert.match(html,/portal-responsive\.js/);
        assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
    }
});
test('Worker uses one authoritative dashboard boot path without injecting a second ranking module', () => {
    const worker=read('worker/index.mjs');
    const loader=read('public/js/portal-responsive.js');
    assert.match(worker,/portal-responsive\.js\?v=20260904-interaction1/);
    assert.doesNotMatch(worker,/data-ranking-authoritative-v3|rankingV3Patch|script\.src = '\/js\/profile-ranking\.js/);
    assert.match(loader,/dashboard-density\.css\?v=20260903-global1/);
    assert.match(loader,/portal-integrity\.js\?v=20260903-global1/);
    assert.match(loader,/operation-feedback\.js\?v=20260903-global2/);
});
test('responsive rules prevent clipped tabs, narrow semester fields and sticky form overlap', () => {
    const css=read('public/css/portal-responsive.css');
    assert.match(css,/display:grid !important; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(css,/\.profile-save-bar \{ position:static !important/);
    assert.match(css,/100dvh/);
    assert.match(css,/min-height:44px/);
    assert.match(css,/canvas \{ max-width:100%/);
    assert.doesNotMatch(css,/overflow-x:hidden/);
    assert.doesNotMatch(read('public/js/portal-responsive.js'),/Go to section|portalSectionSelect|portal-section-jump/);
    assert.match(read('public/css/styles.css'),/\.student-dashboard-page \.tabs-nav \.tab-btn\.active[^}]+--student-gold/s);
    assert.match(read('public/css/styles.css'),/#studentName[^}]+color: var\(--student-gold\)/s);
    assert.match(read('public/admin-dashboard.html'),/<body class="admin-dashboard-page">/);
    assert.match(read('public/css/styles.css'),/\.admin-dashboard-page[^}]+--workspace-accent:#0f766e/s);
});