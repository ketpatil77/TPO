process.env.NODE_ENV='test';
process.env.SUPABASE_URL='';
process.env.SUPABASE_KEY='';
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret-at-least-thirty-two-characters';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {rankWithin,selectFrame}=require('../src/services/engagementRankContext');

const js=fs.readFileSync(path.join(__dirname,'../public/js/student-experience-v1.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/css/student-experience-v1.css'),'utf8');
const candidate=fs.readFileSync(path.join(__dirname,'../public/js/candidate-profile-v2.js'),'utf8');
const pages=['index.html','dashboard.html','admin-dashboard.html','observer-dashboard.html'].map(name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8'));

const rows=[
  {student_id:'a',name:'A',branch:'CT',class:'BE-A',year:'Final Year',points:100,potential_points:100},
  {student_id:'b',name:'B',branch:'CT',class:'BE-A',year:'Final Year',points:90,potential_points:95},
  {student_id:'c',name:'C',branch:'EE',class:'BE-A',year:'Final Year',points:90,potential_points:90}
];

test('rank frame context reuses point ordering and handles college/branch/class precedence',()=>{
  assert.deepEqual(rankWithin(rows,'b',row=>row.branch==='CT'),{rank:2,cohort_size:2});
  assert.equal(selectFrame({college_rank:1,branch_rank:1,class_year_rank:1}),'triple');
  assert.equal(selectFrame({college_rank:8,branch_rank:1,class_year_rank:1}),'gold');
  assert.equal(selectFrame({college_rank:15,branch_rank:1,class_year_rank:2}),'silver');
  assert.equal(selectFrame({college_rank:15,branch_rank:2,class_year_rank:1}),'bronze');
});

test('engagement UI covers all requested interactions without list/table frame rendering',()=>{
  assert.match(js,/Good morning/); assert.match(js,/Good afternoon/); assert.match(js,/Good evening/);
  assert.match(js,/since-last-card|sinceLastVisitCard/); assert.match(js,/verification-snapshot/); assert.match(js,/rank_movement/);
  assert.match(js,/AudioContext/); assert.match(js,/navigator\.vibrate/); assert.match(js,/experienceMuteToggle/);
  assert.match(js,/friendly-empty/); assert.match(js,/rank-photo-reveal/); assert.match(js,/login-ambient/);
  assert.doesNotMatch(js,/querySelectorAll\([^\n]*table[^\n]*rank-frame/i);
  assert.match(candidate,/decorateCandidateProfile/);
  assert.match(js,/typeof window\.loadStudentAvatar === 'function'/);
  assert.match(js,/Nothing new since your last visit/);
});

test('engagement CSS uses tokens, touch targets, reduced motion and bounded transitions',()=>{
  assert.doesNotMatch(css,/#[0-9a-fA-F]{3,8}\b/);
  assert.match(css,/min-width:44px/); assert.match(css,/min-height:44px/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/240ms/); assert.doesNotMatch(css,/transition[^;]*(?:[5-9]\d\d|\d{4,})ms/);
  assert.match(css,/focus-visible/);
  assert.match(css,/rank-frame-triple/);
  assert.match(css,/-webkit-mask-composite:xor/);
  assert.doesNotMatch(css,/rank-frame-triple::after/);
  assert.match(css,/since-last-card\.is-quiet/);
  assert.match(css,/since-last-grid \{ grid-template-columns:repeat\(3/);
});

test('versioned engagement assets load on login, student, TPO and TPC pages',()=>{
  for(const page of pages){ assert.match(page,/student-experience-v1\.css\?v=20260906-engagement1/); assert.match(page,/student-experience-v1\.js\?v=20260906-engagement1/); }
});
