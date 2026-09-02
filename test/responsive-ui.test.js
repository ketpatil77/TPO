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
    assert.match(read('public/css/styles.css'),/\.observer-shell \.observer-tabs \.tab-btn\.active/);
});
test('notification gate has an escape route and small Turnstile slots use compact size', () => {
    assert.match(read('public/dashboard.html'),/id="notificationGateSignOut"/);
    assert.match(read('public/js/portal-responsive.js'),/getElementById\('logoutBtn'\)\?\.click/);
    assert.match(read('public/js/portal.js'),/width < 300 \? 'compact' : 'flexible'/);
});
test('responsive table enhancement initializes only once despite legacy duplicate script tags', () => {
    assert.match(read('public/js/responsive-tables.js'),/if \(window.portalTablesInitialized\) return/);
});

test('desktop navigation uses stable tracks and charts have readable two and three column layouts', () => {
    const css=read('public/css/portal-responsive.css');
    assert.match(css,/repeat\(auto-fit,minmax\(160px,1fr\)\)/);
    assert.match(css,/\.analytics-charts-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)/);
    assert.match(css,/\.analytics-charts-grid > \.glass-card \{ grid-column:span 2/);
    assert.match(css,/max-width:1600px !important/);
    assert.match(css,/\.header-split \{ display:flex/);
    assert.match(css,/\.section-title,.brand-title,.tab-btn,th \{ font-family:[^\n]+!important/);
});

test('analytics theme refresh updates labels, axes and bounded chart sizing without fetching data', () => {
    const vm=require('node:vm');
    const source=read('public/js/admin-dashboard.js');
    const helper=source.slice(source.indexOf('function refreshAnalyticsTheme()'),source.indexOf('new MutationObserver(refreshAnalyticsTheme)'));
    let updates=0;
    const chart={options:{plugins:{title:{},legend:{labels:{}}},scales:{y:{ticks:{},grid:{}}}},data:{datasets:[{},{}]},resize(){},update(){updates++;}};
    const context={analyticsCharts:{placement:chart},document:{documentElement:{}},getComputedStyle:()=>({getPropertyValue:name=>({'--text-muted':'#475569','--text-heading':'#0f172a','--border-color':'#cbd5e1'}[name])})};
    vm.runInNewContext(helper+';refreshAnalyticsTheme();',context);
    assert.equal(chart.options.maintainAspectRatio,false);
    assert.equal(chart.options.plugins.title.color,'#0f172a');
    assert.equal(chart.options.scales.y.ticks.color,'#475569');
    assert.equal(updates,1);
});

test('login roles expose distinct workspace accents and update the active role', () => {
    const html=read('public/index.html');
    const css=read('public/css/styles.css');
    const script=read('public/js/portal.js');
    assert.match(html,/data-active-role="student"/);
    assert.match(script,/document\.body\.dataset\.activeRole = role/);
    assert.match(css,/\.unified-auth-shell\[data-active-role="admin"\][^}]+--login-role-accent:#0f766e/s);
    assert.match(css,/\.unified-auth-shell\[data-active-role="observer"\][^}]+--login-role-accent:#1d5fa7/s);
    assert.match(css,/:root\[data-theme="dark"\] \.unified-auth-shell[^}]+--login-role-accent:#f3c969/s);
});

test('dark theme exposes readable muted, secondary and border tokens', () => {
    const css=read('public/css/styles.css');
    assert.match(css,/:root\[data-theme="dark"\][^}]+--text-muted: #94a3b8/s);
    assert.match(css,/:root\[data-theme="dark"\][^}]+--text-secondary: #a8b4c5/s);
    assert.match(css,/:root\[data-theme="dark"\][^}]+--border-color: rgba\(148, 163, 184, 0\.28\)/s);
});

test('motion polish stays lightweight, responsive and reduced-motion safe', () => {
    const css=read('public/css/styles.css');
    assert.match(css,/@keyframes portal-enter/);
    assert.match(css,/@media \(hover:hover\) and \(pointer:fine\)/);
    assert.match(css,/@media \(prefers-reduced-motion:reduce\)[^}]+/s);
    assert.match(css,/transition-property:transform,opacity,color,background-color,border-color,box-shadow/);
    assert.doesNotMatch(css,/animation[^;{]*:\s*[^;]*(?:width|height|margin|left|top)/);
    for (const page of ['index','dashboard','admin-dashboard','observer-dashboard']) {
        assert.match(read(`public/${page}.html`),/styles\.css\?v=20260901-motion1/);
    }
});
