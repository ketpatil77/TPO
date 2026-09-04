const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wrangler = fs.readFileSync(path.join(__dirname, '../wrangler.jsonc'), 'utf8');
const budget = fs.readFileSync(path.join(__dirname, '../public/js/request-budget.js'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../worker/index.mjs'), 'utf8');

test('static JS and CSS bypass Worker billing path', () => {
  assert.doesNotMatch(wrangler, /"\/js\/\*"/);
  assert.doesNotMatch(wrangler, /"\/css\/\*"/);
  assert.match(wrangler, /"\/api\/\*"/);
});

test('profile reminder cron does not wake Worker every five minutes', () => {
  assert.match(wrangler, /"PUSH_REMINDER_CRON": "0 4 \*\/3 \* \*"/);
  assert.doesNotMatch(wrangler, /"\*\/5 \* \* \* \*"/);
});

test('dashboard request budget reduces fallback polling and coalesces duplicate reads', () => {
  assert.match(budget, /5 \* 60 \* 1000/);
  assert.match(budget, /60 \* 1000/);
  assert.match(budget, /inflight/);
  assert.match(budget, /\/api\/student\/push\/config/);
  assert.match(worker, /request-budget\.js\?v=20260904-free-tier1/);
});
