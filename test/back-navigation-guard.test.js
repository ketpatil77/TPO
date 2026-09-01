const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const guard = fs.readFileSync(path.join(root, 'public/js/portal-back-guard.js'), 'utf8');
const responsive = fs.readFileSync(path.join(root, 'public/js/portal-responsive.js'), 'utf8');

function includesAll(source, values) {
    values.forEach(value => assert.ok(source.includes(value), `Expected source to include: ${value}`));
}

test('authenticated workspaces use guarded browser back navigation instead of direct logout', () => {
    includesAll(guard, [
        'student-dashboard-page',
        'admin-dashboard-page',
        'observer-shell',
        'tab-overview',
        'tab-analytics',
        'data-tab="students"',
        "window.addEventListener('popstate', handleBack)",
        'history.pushState',
        'goHome();',
        'Press back again to sign out',
        'Do you want to sign out?',
        'No, stay',
        'Yes, sign out'
    ]);
});

test('back confirmation delegates to the existing role logout buttons only after explicit Yes', () => {
    includesAll(guard, [
        "document.getElementById('logoutBtn')",
        "document.getElementById('adminLogoutBtn')",
        "document.getElementById('observerLogout')",
        'leavingByChoice = true;',
        'if (button) button.click();'
    ]);
    assert.ok(!guard.includes("localStorage.removeItem('tpo_token')"));
    assert.ok(!guard.includes("localStorage.removeItem('tpo_admin_token')"));
});

test('shared responsive loader installs the back guard on every authenticated workspace', () => {
    includesAll(responsive, [
        "loadStylesheet('/css/portal-back-guard.css?v=20260901-1'",
        "loadScript('/js/portal-back-guard.js?v=20260901-1'",
        "document.body.classList.contains('student-dashboard-page')",
        "document.body.classList.contains('admin-dashboard-page')",
        "document.body.classList.contains('observer-shell')"
    ]);
});
