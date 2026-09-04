const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../public/js/operation-feedback.js'), 'utf8');

test('background push sync never presents itself as a user save operation', () => {
    assert.match(source, /\/api\\\/student\\\/push/);
    assert.match(source, /Push subscription sync is background housekeeping/);
    const pushGuard = source.indexOf("/^\\/api\\/student\\/push");
    const genericPost = source.indexOf("if (method === 'POST') return /export|backup/i.test(path) ? 'Preparing request…' : 'Saving…';");
    assert.ok(pushGuard >= 0 && genericPost > pushGuard, 'push exclusion must run before generic POST feedback');
});

test('stalled background push fetch is aborted and cannot leave a permanent Saving indicator', () => {
    assert.match(source, /BACKGROUND_PUSH_TIMEOUT_MS = 13000/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /controller\.abort\(\)/);
    assert.match(source, /FEEDBACK_FAILSAFE_MS = 20000/);
    assert.match(source, /setTimeout\(forceHide, FEEDBACK_FAILSAFE_MS\)/);
});
