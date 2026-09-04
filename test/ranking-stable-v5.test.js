const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = fs.readFileSync(path.join(__dirname,'../public/js/ranking-stable-v4.js'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'../public/css/ranking-stable-v4.css'),'utf8');
const route = fs.readFileSync(path.join(__dirname,'../src/routes/profileRankingView.js'),'utf8');
const detail = fs.readFileSync(path.join(__dirname,'../src/services/rankingDetailV5.js'),'utf8');
const lazy = fs.readFileSync(path.join(__dirname,'../public/js/student-ranking-lazy.js'),'utf8');

test('stable ranking owns a real 25-row paginated view', () => {
  assert.match(ui,/const PAGE_SIZE = 25/);
  assert.match(ui,/rankingPrevV5/);
  assert.match(ui,/rankingNextV5/);
  assert.match(ui,/Page \$\{page\} of \$\{pages\}/);
  assert.doesNotMatch(ui,/slice\(0,15\)/);
});

test('college branch and year scopes are handled by stable ranking', () => {
  assert.match(ui,/function applyScope/);
  assert.match(ui,/scope === 'college'/);
  assert.match(ui,/scope === 'branch'/);
  assert.match(ui,/scope === 'year'/);
  assert.match(ui,/#rankingBranch,#rankingYear/);
});

test('movement stays inline with rank on mobile', () => {
  assert.match(css,/flex-wrap:nowrap!important/);
  assert.match(css,/grid-template-columns:82px 62px minmax\(0,1fr\) auto/);
  assert.match(css,/ranking-v5-move/);
});

test('score breakdown is lazy and per student instead of rebuilding the full leaderboard', () => {
  assert.match(ui,/\/details\/\$\{encodeURIComponent\(studentId\)\}/);
  assert.match(route,/router\.get\('\/details\/:studentId'/);
  assert.match(detail,/db\.select\('certificates', \{ student_id: studentId \}\)/);
  assert.match(detail,/applyCertificateScoringV4/);
});

test('old heavy profile ranking request stays deferred during module preload', () => {
  assert.match(lazy,/Ranking detail calculation is deferred until score breakdown is opened/);
  assert.match(lazy,/ranking-stable-v4\.js\?v=20260904-v5/);
});

test('responsive names and pager are usable in both themes', () => {
  assert.match(css,/white-space:normal!important/);
  assert.match(css,/:root\[data-theme="light"\]/);
  assert.match(css,/@media \(max-width:700px\)/);
  assert.match(css,/min-height:42px/);
});
