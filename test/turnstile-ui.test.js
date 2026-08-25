const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('login page uses explicit Turnstile rendering', () => {
    const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    assert.match(html, /api\.js\?onload=initTurnstile&amp;render=explicit|api\.js\?onload=initTurnstile&render=explicit/);
    assert.match(html, /id="studentTurnstile"/);
    assert.doesNotMatch(html, /class="cf-turnstile"/);
});

test('login cannot submit until active widget returns token', () => {
    const script = fs.readFileSync(path.join(root, 'public', 'js', 'portal.js'), 'utf8');
    assert.match(script, /turnstileState\[role\]\.token/);
    assert.match(script, /Complete security verification before signing in\./);
    assert.match(script, /turnstile\.reset\(state\.widgetId\)/);
});

test('Turnstile timeout and Chrome load failures always expose recovery', () => {
    const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'public', 'js', 'portal.js'), 'utf8');
    assert.match(html, /data-turnstile-retry="student"/);
    assert.match(html, /data-turnstile-retry="admin"/);
    assert.match(html, /data-turnstile-retry="observer"/);
    assert.match(html, /data-turnstile-retry="correction"/);
    assert.match(script, /retry: 'auto'/);
    assert.match(script, /'refresh-timeout': 'auto'/);
    assert.match(script, /'refresh-expired': 'auto'/);
    assert.match(script, /recoverTurnstile\(role/);
    assert.match(script, /target\.querySelector\('iframe'\)/);
    assert.match(script, /window\.turnstile\.remove/);
});

test('mobile login errors move the alert into the current viewport', () => {
    const script = fs.readFileSync(path.join(root, 'public', 'js', 'portal.js'), 'utf8');
    assert.match(script, /box\.scrollIntoView/);
    assert.match(script, /box\.focus/);
});

test('avatar UI waits for image load and recovers from broken signed URLs', () => {
    const staffScript = fs.readFileSync(path.join(root, 'public', 'js', 'avatar-control.js'), 'utf8');
    const studentScript = fs.readFileSync(path.join(root, 'public', 'js', 'dashboard.js'), 'utf8');
    assert.match(staffScript, /image\.onload/);
    assert.match(staffScript, /image\.onerror/);
    assert.match(staffScript, /button\.classList\.remove\('has-image'\)/);
    assert.match(studentScript, /probe\.onload/);
    assert.match(studentScript, /probe\.onerror/);
    assert.match(studentScript, /preview\.removeAttribute\('src'\)/);
});
