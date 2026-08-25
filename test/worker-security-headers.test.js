const test = require('node:test');
const assert = require('node:assert/strict');

test('dashboard CSP permits only configured Supabase project images', async () => {
    const { contentSecurityPolicy } = await import('../worker/security-headers.mjs');
    const csp = contentSecurityPolicy({ SUPABASE_URL: 'https://project-ref.supabase.co' });

    assert.match(csp, /img-src 'self' data: blob: https:\/\/project-ref\.supabase\.co/);
    assert.doesNotMatch(csp, /https:\/\/\*\.supabase\.co/);
});
