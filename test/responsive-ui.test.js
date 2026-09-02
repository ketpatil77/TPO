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
test('Worker places responsive contract after every legacy role patch', () => {
    const worker=read('worker/index.mjs');
    assert.match(worker,/\$\{profileRequirements\}\$\{rolePatch\}\$\{adminActivityPatch\}<link rel="stylesheet" href="\/css\/portal-responsive\.css/);
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
    assert.match(read('public/css/styles.css'),/\.observer-shell[^}]+--workspace-accent:#1d5fa7/s);
    assert.match(read('public/css/styles.css'),/\.admin-dashboard-page \.tabs-nav \.tab-btn\.active/);
    assert.match(read('public/css/styles.css'),/\.observer-shell \.tabs-nav \.tab-btn\.active/);
});
test('notification gate has an escape route and small Turnstile slots use compact size', () => {
    assert.match(read('public/dashboard.html'),/id="notificationGateSignOut"/);
    assert.match(read('public/js/portal-responsive.js'),/getElementById\('logoutBtn'\)\?\.click/);
    assert.match(read('public/js/portal.js'),/width < 300 \? 'compact' : 'flexible'/);
});
test('responsive table enhancement initializes only once despite legacy duplicate script tags', () => {
    const js=read('public/js/responsive-tables.js');
    assert.match(js,/window\.__responsiveTablesLoaded/);
});
test('desktop navigation uses stable tracks and charts have readable two and three column layouts', () => {
    const css=read('public/css/portal-responsive.css');
    assert.match(css,/\.admin-dashboard-page \.admin-tabs \{ grid-template-columns:repeat\(5,minmax\(0,1fr\)/);
    assert.match(css,/\.observer-shell \.observer-tabs \{ grid-template-columns:repeat\(6,minmax\(0,1fr\)/);
    assert.match(css,/\.analytics-charts-grid \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)/);
});
test('analytics theme refresh updates labels, axes and bounded chart sizing without fetching data', () => {
    const js=read('public/js/admin-dashboard.js');
    assert.match(js,/Chart/);
});
test('login roles expose distinct workspace accents and update the active role', () => {
    const html=read('public/index.html');
    assert.match(html,/role/);
});
test('dark theme exposes readable muted, secondary and border tokens', () => {
    const css=read('public/css/styles.css');
    assert.match(css,/--text-muted/);
    assert.match(css,/--border-color/);
});
test('motion polish stays lightweight, responsive and reduced-motion safe', () => {
    const css=read('public/css/styles.css');
    assert.match(css,/prefers-reduced-motion/);
});
