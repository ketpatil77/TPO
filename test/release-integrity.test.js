const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('every public login route uses the unified Turnstile portal', () => {
    const worker = read('worker/index.mjs');
    assert.match(worker, /\['\/login', '\/index\.html'\]/);
    assert.match(worker, /\['\/observer', '\/index\.html'\]/);
    assert.match(worker, /\['\/observer\/login', '\/index\.html'\]/);
    assert.doesNotMatch(worker, /\/login\.html|\/observer-login\.html/);
});

test('public assets contain no demo student credentials or legacy login pages', () => {
    const html = read('public/index.html');
    assert.doesNotMatch(html, /Sample Credentials|24053651251515|24053651251516/);
    assert.equal(fs.existsSync(path.join(root, 'public', 'login.html')), false);
    assert.equal(fs.existsSync(path.join(root, 'public', 'observer-login.html')), false);
});

test('default test command discovers the complete test directory', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.scripts.test, /^node --test --test-concurrency=1$/);
});

test('student dashboard loads the extracted skill catalog before its logic', () => {
    const html = read('public/dashboard.html');
    const catalog = html.indexOf('/js/student-skill-catalog.js');
    const dashboard = html.indexOf('/js/dashboard.js');
    assert.ok(catalog >= 0 && dashboard > catalog);
    assert.match(read('public/js/dashboard.js'), /window\.ENGINEERING_SKILLS \|\| \[\]/);
});

test('local credential artifacts and generated output are ignored', () => {
    const ignore = read('.gitignore');
    for (const entry of ['cj.txt', 'testlogin.json', 'tmp/', 'output/']) {
        assert.match(ignore, new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    }
});
