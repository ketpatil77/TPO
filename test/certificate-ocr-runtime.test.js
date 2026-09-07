process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
const test = require('node:test');
const assert = require('node:assert/strict');
const fraud = require('../src/services/certificateFraudDetection');

test('production OCR uses AI binding without browser Worker or supplied recognizer', async () => {
  const old = globalThis.cloudflareEnv;
  let called = false;
  globalThis.cloudflareEnv = { AI: { async run(model, input) {
    called = true;
    assert.equal(model, '@cf/moondream/moondream3.1-9B-A2B');
    assert.equal(input.stream, false);
    assert.match(input.image, /^data:image\/jpeg;base64,/);
    assert.ok(!input.question.includes('Rahul'));
    return { result: { answer: 'PRESENTED TO\nRAHUL SHARMA', finish_reason: 'stop' }, usage: { total_tokens: 20 } };
  } } };
  try {
    assert.match(await fraud.runOcr(Buffer.from([255,216,255,0])), /RAHUL SHARMA/);
    assert.equal(called, true);
  } finally { globalThis.cloudflareEnv = old; }
});

test('missing OCR binding fails explicitly instead of spawning an unsupported Worker', async () => {
  const old = globalThis.cloudflareEnv;
  globalThis.cloudflareEnv = {};
  try { await assert.rejects(fraud.runOcr(Buffer.from([255,216,255])), /CERTIFICATE_OCR_NOT_CONFIGURED/); }
  finally { globalThis.cloudflareEnv = old; }
});
