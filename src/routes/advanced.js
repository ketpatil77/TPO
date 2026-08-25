const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin, authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const admin = express.Router(); const student = express.Router();
admin.use(authenticateAdmin); student.use(authenticateStudent);
const now = () => new Date().toISOString();

async function joinedStudents(studentId = null, limit = 500) {
    if (!db.isLocal()) {
        const supabase = db.supabaseClient();
        let query = supabase.from('students').select(`
            id, prn, name, email, phone, branch, class, year, cgpa_overall, resume_url, activities,
            internships(id, student_id, company, role, start_date, end_date, mode),
            certificates(id, student_id, name, issuer, date, mode),
            student_projects(id, student_id, title, summary, technologies),
            research_papers(id, student_id, title, authors, publication, abstract),
            student_skills(id, student_id, skill),
            assessments(id, student_id, title, type, score, max_score),
            offers(id, student_id, company, role, package_lpa, status)
        `);
        if (studentId) {
            query = query.eq('id', studentId);
        } else if (limit) {
            query = query.limit(limit);
        }
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(s => ({
            ...s,
            skills: (s.student_skills || []).map(x => x.skill)
        }));
    }
    const [students, internships, certificates, projects, researchPapers, skills, assessments, offers] = await Promise.all(['students','internships','certificates','student_projects','research_papers','student_skills','assessments','offers'].map(t=>db.select(t)));
    let filteredStudents = students;
    if (studentId) filteredStudents = students.filter(s => s.id === studentId);
    else if (limit) filteredStudents = students.slice(0, limit);

    return filteredStudents.map(s=>({...s, internships:internships.filter(x=>x.student_id===s.id), certificates:certificates.filter(x=>x.student_id===s.id), projects:projects.filter(x=>x.student_id===s.id), research_papers:researchPapers.filter(x=>x.student_id===s.id), skills:skills.filter(x=>x.student_id===s.id).map(x=>x.skill), assessments:assessments.filter(x=>x.student_id===s.id), offers:offers.filter(x=>x.student_id===s.id)}));
}
function completion(s) { const checks=[s.name,s.branch,s.class,s.year,Number(s.cgpa_overall)>0,s.resume_url,s.activities,s.skills?.length,s.internships?.length,s.certificates?.length,s.projects?.length]; const missing=['Name','Branch','Class','Year','CGPA','Resume','Activities','Skills','Internship','Certificate','Project'].filter((_,i)=>!checks[i]); return {score:Math.round((checks.filter(Boolean).length/checks.length)*100),missing}; }
function resumeReview(s){const issues=[];if(!s.resume_url)issues.push('Resume PDF missing');if(!s.name)issues.push('Name missing');if(!s.skills?.length)issues.push('Skills missing');if(!s.internships?.length)issues.push('Internship experience missing');if(!s.certificates?.length)issues.push('Certificates missing');if(!s.activities)issues.push('Achievements missing');return {score:Math.max(0,100-issues.length*15),issues,recommendations:issues.map(x=>`Add or improve: ${x.replace(' missing','')}`)};}

let analyticsCache = null;
let analyticsCacheTime = 0;

admin.get('/analytics', async (_req,res)=>{
    if (analyticsCache && Date.now() - analyticsCacheTime < 60000) {
        return res.json({ success: true, data: analyticsCache });
    }
    const rows=await joinedStudents();
    const offers=rows.flatMap(s=>s.offers);
    const byBranch={};
    rows.forEach(s=>{
        byBranch[s.branch]??={students:0,placed:0,avgCgpa:0,totalCgpa:0};
        const b=byBranch[s.branch];
        b.students++;
        b.totalCgpa+=Number(s.cgpa_overall)||0;
        if(s.offers.some(o=>['accepted','joined'].includes(o.status))) b.placed++;
    });
    Object.values(byBranch).forEach(b=>{
        b.avgCgpa=Number((b.totalCgpa/b.students||0).toFixed(2));
        delete b.totalCgpa;
    });

    const drives = await db.select('placement_drives');
    const topCompanies = offers.reduce((acc, o) => { if(o.company) acc[o.company] = (acc[o.company] || 0) + 1; return acc; }, {});
    const topRecruiters = Object.entries(topCompanies).sort((a,b)=>b[1]-a[1]).slice(0, 5).map(e => ({ company: e[0], count: e[1] }));
    const packagesLPA = offers.map(o => Number(o.package_lpa) || 0);
    const packageDistribution = {
        '< 5 LPA': packagesLPA.filter(p => p > 0 && p < 5).length,
        '5 - 10 LPA': packagesLPA.filter(p => p >= 5 && p <= 10).length,
        '> 10 LPA': packagesLPA.filter(p => p > 10).length
    };

    const data = {
        students:rows.length,
        placed:rows.filter(s=>s.offers.some(o=>['accepted','joined'].includes(o.status))).length,
        offers:offers.length,
        averagePackage:Number((offers.reduce((a,o)=>a+(Number(o.package_lpa)||0),0)/(offers.length||1)).toFixed(2)),
        highestPackage:Math.max(0,...offers.map(o=>Number(o.package_lpa)||0)),
        profileCompletion:Math.round(rows.reduce((a,s)=>a+completion(s).score,0)/(rows.length||1)),
        byBranch,
        totalDrives: drives.length,
        topRecruiters,
        packageDistribution
    };

    analyticsCache = data;
    analyticsCacheTime = Date.now();
    res.json({success:true,data});
});
admin.get('/search',async(req,res)=>{let rows=await joinedStudents();const q=String(req.query.q||'').toLowerCase();if(q)rows=rows.filter(s=>[s.name,s.prn,s.branch,...s.skills].some(v=>String(v||'').toLowerCase().includes(q)));if(req.query.branch&&req.query.branch!=='all')rows=rows.filter(s=>s.branch===req.query.branch);if(req.query.minCgpa)rows=rows.filter(s=>Number(s.cgpa_overall)>=Number(req.query.minCgpa));if(req.query.hasResume==='true')rows=rows.filter(s=>s.resume_url);if(req.query.skill)rows=rows.filter(s=>s.skills.some(x=>x.toLowerCase().includes(String(req.query.skill).toLowerCase())));if(req.query.placed==='true')rows=rows.filter(s=>s.offers.some(o=>['accepted','joined'].includes(o.status)));res.json({success:true,data:rows.slice(0,200).map(s=>({...s,completion:completion(s),resumeReview:resumeReview(s)}))})});

const filterSchema=z.object({name:z.string().trim().min(2).max(80),filters:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))}).strict();
admin.get('/filters',async(req,res)=>res.json({success:true,data:await db.select('saved_filters',{owner_id:req.admin.adminId})}));
admin.post('/filters',validate(filterSchema),async(req,res)=>res.status(201).json({success:true,data:await db.insert('saved_filters',{owner_id:req.admin.adminId,...req.body,created_at:now()})}));

const schemas={assessments:z.object({student_id:z.uuid(),type:z.enum(['aptitude','coding','mock_interview','training']),title:z.string().min(2).max(120),score:z.number().min(0).max(1000).nullable(),max_score:z.number().min(1).max(1000).nullable(),attended_on:z.string().date().nullable(),notes:z.string().max(1000).default('')}).strict(),interviews:z.object({drive_id:z.uuid().nullable(),student_id:z.uuid().nullable(),starts_at:z.iso.datetime(),ends_at:z.iso.datetime(),venue:z.string().max(200).default(''),meeting_url:z.union([z.url(),z.literal('')]).default(''),panel:z.string().max(300).default(''),status:z.enum(['scheduled','completed','cancelled']).default('scheduled'),notes:z.string().max(1000).default('')}).strict(),offers:z.object({student_id:z.uuid(),drive_id:z.uuid().nullable(),company:z.string().min(1).max(150),role:z.string().min(1).max(150),package_lpa:z.number().min(0).max(1000).nullable(),offer_date:z.string().date().nullable(),joining_date:z.string().date().nullable(),status:z.enum(['offered','accepted','declined','joined']).default('offered')}).strict(),calendar_events:z.object({title:z.string().min(2).max(150),event_type:z.enum(['drive','test','interview','training','deadline','other']),starts_at:z.iso.datetime(),ends_at:z.iso.datetime().nullable(),location:z.string().max(200).default(''),description:z.string().max(1000).default('')}).strict()};
for(const [name,schema] of Object.entries(schemas)){
  admin.get(`/${name}`,async(_req,res)=>res.json({success:true,data:(await db.select(name)).slice(0,500)}));
  admin.post(`/${name}`,validate(schema),async(req,res)=>{
    const record={...req.body,created_at:now()};
    if(name==='calendar_events') record.created_by=req.admin.adminId;
    res.status(201).json({success:true,data:await db.insert(name,record)});
  });
}
admin.get('/resume-review/:studentId',async(req,res)=>{const [s]=await joinedStudents(req.params.studentId);if(!s)return res.status(404).json({success:false,error:'Student not found.'});res.json({success:true,data:resumeReview(s)})});

student.get('/summary',async(req,res)=>{const s=(await joinedStudents()).find(x=>x.id===req.student.studentId);if(!s)return res.status(404).json({success:false,error:'Student not found.'});const [interviews,offers,events]=await Promise.all([db.select('interviews',{student_id:s.id}),db.select('offers',{student_id:s.id}),db.select('calendar_events')]);res.json({success:true,data:{completion:completion(s),resumeReview:resumeReview(s),assessments:s.assessments.slice(0,50),interviews:interviews.slice(0,50),offers:offers.slice(0,50),events:events.slice(0,100)}})});
module.exports={admin,student};
