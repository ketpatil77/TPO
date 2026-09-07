process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
const test = require('node:test');
const assert = require('node:assert/strict');
const fraud = require('../src/services/certificateFraudDetection');

function bmpFixture() {
  const w=1200,h=800,raw=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;const v=235+((x+y)%12);raw[i]=raw[i+1]=raw[i+2]=v;raw[i+3]=255;}
  for(let y=160;y<170;y++)for(let x=180;x<1020;x++){const i=(y*w+x)*4;raw[i]=raw[i+1]=raw[i+2]=30;raw[i+3]=255;}
  return fraud.encodeBmp(raw,w,h);
}

test('issuer omission of middle name matches first and last names but not surname alone', () => {
  assert.equal(fraud.analyzeNameMatch('Ketan Patil','Ketan Vilas Patil').flagged,false);
  assert.equal(fraud.analyzeNameMatch('Vikas Patil','Ketan Vilas Patil').flagged,true);
});

test('OCR request uses a compact JPEG copy of uploaded proof bytes', async () => {
  const proof = bmpFixture();
  const prepared = await fraud.prepareOcrImage(proof);
  assert.equal(prepared.mime, 'image/jpeg');
  assert.ok(prepared.bytes.length > 0);
  assert.ok(prepared.bytes.length < proof.length);
});

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
    assert.match(await fraud.runOcr(bmpFixture()), /RAHUL SHARMA/);
    assert.equal(called, true);
  } finally { globalThis.cloudflareEnv = old; }
});

test('missing OCR binding fails explicitly instead of spawning an unsupported Worker', async () => {
  const old = globalThis.cloudflareEnv;
  globalThis.cloudflareEnv = {};
  try { await assert.rejects(fraud.runOcr(Buffer.from([255,216,255])), /CERTIFICATE_OCR_NOT_CONFIGURED/); }
  finally { globalThis.cloudflareEnv = old; }
});
