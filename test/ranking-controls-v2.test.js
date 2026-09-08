const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname,'../public/js/ranking-pro-polish.js'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'../public/css/ranking-pro-polish.css'),'utf8');
const quick = fs.readFileSync(path.join(__dirname,'../src/services/rankingQuickV4.js'),'utf8');

test('ranking controls expose a real CGPA sort and recompute displayed ranks', () => {
  assert.match(js, /state\.sort==='cgpa'/);
  assert.match(js, /cgpa\(b\)-cgpa\(a\)/);
  assert.match(js, /return \{\.\.\.row,rank\}/);
  assert.match(quick, /cgpa: num\(row\.cgpa\)/);
});

test('leaderboard controls keep the descriptive subtext above the search field', () => {
  assert.match(css, /ranking-pro-toolbar-head[^}]*position:relative/);
  assert.match(css, /ranking-pro-toolbar-copy[^}]*z-index:3/);
  assert.match(css, /ranking-pro-hint[^}]*margin:10px 0 0/);
  assert.match(css, /ranking-pro-hint[^}]*visibility:visible/);
});

test('ranking filters use the existing dark card and gold accent tokens', () => {
  assert.match(css, /#tab-ranking \.leaderboard-scope/);
  assert.match(css, /var\(--surface-card/);
  assert.match(css, /var\(--student-gold/);
  assert.match(css, /#rankingBranch/);
  assert.match(css, /#rankingYear/);
  assert.match(css, /#rankingRefresh/);
});

test('rank history stat values have explicit readable contrast in both themes', () => {
  assert.match(css, /ranking-history-item>span[^}]*color:var\(--text-primary/);
  assert.match(css, /ranking-history-item strong[^}]*color:var\(--text-primary/);
  assert.match(css, /ranking-history-item small[^}]*color:var\(--text-muted/);
  assert.match(css, /data-theme="light"/);
  assert.match(css, /rank-chaos-muted[^}]*color:var\(--text-muted/);
});
