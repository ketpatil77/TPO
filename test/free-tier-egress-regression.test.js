const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rankingSource = fs.readFileSync(path.join(__dirname, '../src/services/profileRankingEngine.js'), 'utf8');
const avatarSource = fs.readFileSync(path.join(__dirname, '../src/utils/avatar.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');

test('leaderboard never bulk-signs Supabase avatar URLs', () => {
  assert.doesNotMatch(rankingSource, /createSignedUrls\s*\(/);
  assert.doesNotMatch(rankingSource, /storage\.from\(['"]avatars['"]\)/);
  assert.match(rankingSource, /\/api\/student\/student-avatars\/\$\{encodeURIComponent\(profile\.id\)\}/);
});

test('stable leaderboard avatar route remains authenticated', () => {
  assert.match(serverSource, /app\.use\('\/api\/student\/student-avatars',\s*createStudentAvatarDirectory\(authenticateStudent\)\)/);
});

test('avatar redirect cache expires before its signed Supabase target', () => {
  const signed = Number((avatarSource.match(/AVATAR_REDIRECT_SIGNED_SECONDS\s*=\s*(\d+)/) || [])[1]);
  const cached = Number((avatarSource.match(/AVATAR_REDIRECT_CACHE_SECONDS\s*=\s*(\d+)/) || [])[1]);
  assert.ok(Number.isFinite(signed) && Number.isFinite(cached));
  assert.ok(cached > 300, 'redirect should be cached materially longer than the old 5 minutes');
  assert.ok(cached < signed, 'browser redirect cache must expire before signed URL');
  assert.match(avatarSource, /Cache-Control[^\n]*private/);
});
