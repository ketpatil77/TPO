'use strict';
const fs=require('node:fs');
function replace(path,from,to){const s=fs.readFileSync(path,'utf8');if(s.includes(to))return;if(!s.includes(from))throw new Error(`Pattern missing in ${path}`);fs.writeFileSync(path,s.replace(from,to));}

replace('public/js/student-experience-v1.js',
"    applyFrame(avatar, context);\n    avatar.dataset.rankReveal = 'true';",
"    applyFrame(avatar, context);\n    // The rank frame shares the avatar element with the signed background image.\n    // Re-run the existing loader after decorating so mobile Chromium never leaves the blank fallback painted.\n    if (typeof window.loadStudentAvatar === 'function') window.loadStudentAvatar();\n    avatar.dataset.rankReveal = 'true';");

replace('public/js/student-experience-v1.js',
"    let card = document.getElementById('sinceLastVisitCard');\n    if (!card) { card = document.createElement('section'); card.id = 'sinceLastVisitCard'; card.className = 'glass-card since-last-card'; overview.prepend(card); }\n    const visitedLabel = lastVisit ? `Since ${lastVisit.toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}` : 'First visit snapshot';\n    card.innerHTML = `<div><span class=\"eyebrow\">Since you last visited</span><h3>${lastVisit ? 'Here is what changed' : 'Your baseline is ready'}</h3><p>${esc(visitedLabel)}</p></div><div class=\"readiness-chip\">Live snapshot</div><div class=\"since-last-grid\"><div class=\"since-last-item\"><strong>${newMatches}</strong><span>new placement/JD updates</span></div><div class=\"since-last-item\"><strong>${movement === 0 ? '—' : movement > 0 ? `↑ ${movement}` : `↓ ${Math.abs(movement)}`}</strong><span>rank movement</span></div><div class=\"since-last-item\"><strong>${verificationChanges}</strong><span>verification changes</span></div></div>`;",
"    let card = document.getElementById('sinceLastVisitCard');\n    if (!card) { card = document.createElement('section'); card.id = 'sinceLastVisitCard'; card.className = 'glass-card since-last-card'; overview.prepend(card); }\n    const visitedLabel = lastVisit ? `Since ${lastVisit.toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}` : 'First visit snapshot';\n    const hasChanges = newMatches > 0 || movement !== 0 || verificationChanges > 0;\n    card.classList.toggle('is-quiet', !hasChanges);\n    if (!hasChanges) {\n      card.innerHTML = `<div class=\"since-last-summary\"><span class=\"eyebrow\">Since you last visited</span><h3>Nothing new since your last visit</h3><p>${esc(visitedLabel)} · Your placement, rank and verification snapshot is unchanged.</p></div>`;\n    } else {\n      card.innerHTML = `<div><span class=\"eyebrow\">Since you last visited</span><h3>Here is what changed</h3><p>${esc(visitedLabel)}</p></div><div class=\"readiness-chip\">Live snapshot</div><div class=\"since-last-grid\"><div class=\"since-last-item\"><strong>${newMatches}</strong><span>new placement/JD updates</span></div><div class=\"since-last-item\"><strong>${movement === 0 ? '—' : movement > 0 ? `↑ ${movement}` : `↓ ${Math.abs(movement)}`}</strong><span>rank movement</span></div><div class=\"since-last-item\"><strong>${verificationChanges}</strong><span>verification changes</span></div></div>`;\n    }");

replace('public/css/student-experience-v1.css',
".student-avatar.rank-frame-triple,\n.candidate-rank-avatar.rank-frame-triple { border-color: transparent; }\n.student-avatar.rank-frame-triple::before,\n.candidate-rank-avatar.rank-frame-triple::before { content:\"\"; position:absolute; inset:-4px; z-index:-1; border-radius:inherit; background: conic-gradient(from 0turn, var(--experience-gold), var(--accent), var(--experience-gold)); animation: rank-frame-shimmer 2.4s linear infinite; }\n.student-avatar.rank-frame-triple::after,\n.candidate-rank-avatar.rank-frame-triple::after { content:\"\"; position:absolute; inset:-1px; z-index:-1; border-radius:inherit; background:var(--bg-card); }",
".student-avatar.rank-frame-triple,\n.candidate-rank-avatar.rank-frame-triple { border-color: transparent; }\n.student-avatar.rank-frame-triple::before,\n.candidate-rank-avatar.rank-frame-triple::before { content:\"\"; position:absolute; inset:0; z-index:4; padding:3px; border-radius:inherit; pointer-events:none; background:conic-gradient(from 0turn, var(--experience-gold), var(--accent), var(--experience-gold)); -webkit-mask:linear-gradient(var(--text-heading) 0 0) content-box,linear-gradient(var(--text-heading) 0 0); -webkit-mask-composite:xor; mask-composite:exclude; animation:rank-frame-shimmer 2.4s linear infinite; }");

replace('public/css/student-experience-v1.css',
".since-last-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:var(--space-md); align-items:start; margin-bottom:var(--space-md); border-left:4px solid var(--experience-accent); }",
".since-last-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:var(--space-md); align-items:start; margin-bottom:var(--space-md); padding:var(--space-lg); border-left:4px solid var(--experience-accent); }\n.since-last-card.is-quiet { display:block; padding:var(--space-md) var(--space-lg); }\n.since-last-summary h3 { margin:.1rem 0 .2rem; font-size:1rem; }\n.since-last-summary p { font-size:.8rem; }");

replace('public/css/student-experience-v1.css',
"@media (max-width:768px) {\n  .since-last-card { grid-template-columns:1fr; }\n  .since-last-grid { grid-template-columns:1fr; }",
"@media (max-width:768px) {\n  .since-last-card { grid-template-columns:1fr; padding:var(--space-md); }\n  .since-last-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }\n  .since-last-item { padding:var(--space-sm); }\n  .since-last-item strong { font-size:1rem; }\n  .since-last-item span { font-size:.68rem; line-height:1.25; }");

replace('public/css/student-experience-v1.css',
"@media (max-width:414px) {\n  .since-last-card { padding:var(--space-md); }",
"@media (max-width:414px) {\n  .student-meta { align-items:flex-start; }\n  .student-avatar { flex:0 0 64px; }\n  .experience-greeting { font-size:.78rem; line-height:1.35; }");

replace('test/student-engagement-features.test.js',
"  assert.match(candidate,/decorateCandidateProfile/);",
"  assert.match(candidate,/decorateCandidateProfile/);\n  assert.match(js,/typeof window\\.loadStudentAvatar === 'function'/);\n  assert.match(js,/Nothing new since your last visit/);");

replace('test/student-engagement-features.test.js',
"  assert.match(css,/rank-frame-triple/);",
"  assert.match(css,/rank-frame-triple/);\n  assert.match(css,/-webkit-mask-composite:xor/);\n  assert.doesNotMatch(css,/rank-frame-triple::after/);\n  assert.match(css,/since-last-card\\.is-quiet/);\n  assert.match(css,/since-last-grid \\{ grid-template-columns:repeat\\(3/);");

console.log('Applied mobile engagement hotfix.');
