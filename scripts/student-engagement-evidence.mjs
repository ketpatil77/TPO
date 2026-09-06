import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('ui-evidence',{recursive:true});
const browser=await chromium.launch({headless:true});
const sampleProfile={success:true,data:{student:{id:'preview-student',name:'Aarav Patil',prn:'24053651251515',branch:'CT',class:'BE-A',year:'Final Year',cgpa_overall:8.72,cgpa_semesterwise:{sem1:8.1,sem2:8.3,sem3:8.4,sem4:8.6,sem5:8.7,sem6:8.9},backlogs_semesterwise:{},active_backlogs:0,email:'aarav@example.com',phone:'9876543210',avatar_path:'preview.jpg',ssc_marks:88,hsc_marks:82,resume_url:'https://example.com/resume.pdf',updated_at:new Date().toISOString()},skills:[{skill:'JavaScript'},{skill:'Node.js'}],internships:[],certificates:[],projects:[],research_papers:[],diploma:null}};
const context={success:true,data:{student_id:'preview-student',branch:'CT',class:'BE-A',year:'Final Year',points:82,college_rank:1,college_size:120,branch_rank:1,branch_size:32,class_year_rank:1,class_year_size:18,rank_movement:2,frame:'triple'}};
const notifications={success:true,data:[{id:'n1',title:'New placement drive match',message:'A new job opportunity matches your profile.',created_at:new Date().toISOString()}]};
async function setup(page){
  await page.addInitScript(()=>{localStorage.setItem('tpo_token','preview');localStorage.setItem('tpo_admin_token','preview');localStorage.setItem('tpo_observer_token','preview');});
  await page.route('**/api/**',async route=>{
    const u=new URL(route.request().url());
    let body={success:true,data:[]};
    if(u.pathname==='/api/student/profile')body=sampleProfile;
    else if(u.pathname==='/api/student/engagement/context')body=context;
    else if(u.pathname==='/api/student/competitions')body={success:true,data:[]};
    else if(u.pathname==='/api/student/workflow/notifications')body=notifications;
    else if(/\/api\/(admin|observer)\/engagement\/students\//.test(u.pathname))body=context;
    else if(/\/student-avatars\//.test(u.pathname)){await route.fulfill({status:404,body:''});return;}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
}
async function noOverflow(page,label){const bad=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);if(bad)throw new Error(`${label}: horizontal overflow detected`);}
async function shotLogin(width,label){const page=await browser.newPage({viewport:{width,height:900}});await setup(page);await page.goto('http://127.0.0.1:3000/',{waitUntil:'domcontentloaded'});await page.waitForTimeout(500);await noOverflow(page,`login-${label}`);await page.screenshot({path:`ui-evidence/login-${label}.png`,fullPage:true});await page.close();}
async function shotStudent(width,label){const page=await browser.newPage({viewport:{width,height:1000}});await setup(page);await page.goto('http://127.0.0.1:3000/dashboard',{waitUntil:'domcontentloaded'});await page.waitForTimeout(1200);await page.evaluate(()=>{const gate=document.getElementById('mandatoryNotificationGate');if(gate)gate.hidden=true;document.body.classList.remove('notifications-blocked');const dash=document.getElementById('studentDashboard');if(dash){dash.inert=false;dash.setAttribute('aria-hidden','false');}const c=document.getElementById('dashboardContent');if(c)c.hidden=false;const s=document.getElementById('dashboardSkeleton');if(s)s.hidden=true;});await page.waitForTimeout(300);await noOverflow(page,`student-${label}`);await page.screenshot({path:`ui-evidence/student-${label}.png`,fullPage:false});await page.close();}
async function shotCandidate(width,label,role){const page=await browser.newPage({viewport:{width,height:1000}});await setup(page);const path=role==='admin'?'/admin/dashboard':'/observer/dashboard';await page.goto(`http://127.0.0.1:3000${path}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(800);await page.evaluate(({role})=>{const host=document.createElement('div');host.className='modal-backdrop active';host.style.display='flex';host.innerHTML='<section class="modal-card" style="max-width:900px;max-height:90vh;overflow:auto"><div class="candidate-profile-v2"><section class="candidate-profile-hero"><div><span class="eyebrow">Student profile</span><h2>Aarav Patil</h2><p>CT · BE-A · Final Year</p></div><div class="candidate-profile-actions"><button class="btn btn-primary btn-sm">Open resume</button></div></section><div class="candidate-kpi-grid"><div class="candidate-kpi"><small>Overall CGPA</small><strong>8.72</strong></div></div></div></section>';document.body.appendChild(host);window.PortalStudentExperience?.decorateCandidateProfile({id:'preview-student',name:'Aarav Patil',branch:'CT',class:'BE-A',year:'Final Year'},role);},{role});await page.waitForTimeout(500);const avatar=page.locator('.candidate-rank-avatar');if(role==='admin'&&await avatar.count())await avatar.hover();await noOverflow(page,`${role}-${label}`);await page.screenshot({path:`ui-evidence/${role}-candidate-${label}.png`,fullPage:false});await page.close();}
await shotLogin(390,'mobile'); await shotLogin(1440,'desktop');
await shotStudent(390,'mobile'); await shotStudent(768,'tablet'); await shotStudent(1440,'desktop');
await shotCandidate(390,'mobile','admin'); await shotCandidate(1440,'desktop','admin');
await shotCandidate(390,'mobile','observer'); await shotCandidate(1440,'desktop','observer');
await browser.close();
console.log('Captured 9 responsive evidence screenshots with overflow assertions.');
