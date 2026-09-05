'use strict';

const express = require('express');
const db = require('../config/database');
const kvCache = require('../utils/kvCache');
const { authenticateAdmin, authenticateObserver } = require('../middleware/auth');
const { createStudentNotification } = require('../services/incompleteProfilePush');
const { evaluate, duplicateIds, markDuplicate } = require('../services/submissionRisk');

const TYPE_MAP = {
  project: { table:'student_projects', label:'project', title:item => item.title || 'Project' },
  research: { table:'research_papers', label:'research paper', title:item => item.title || 'Research paper' },
  internship: { table:'internships', label:'internship', title:item => `${item.company || 'Internship'}${item.role ? ` · ${item.role}` : ''}` },
  certificate: { table:'certificates', label:'certificate', title:item => `${item.name || 'Certificate'}${item.issuer ? ` · ${item.issuer}` : ''}` }
};

function text(value){ return String(value || '').trim(); }
function normalizedStatus(item){ const value=text(item?.verification_status || 'pending').toLowerCase(); return value === 'approved' ? 'verified' : value; }
function cleanReason(value){ const reason=text(value).replace(/\s+/g,' '); return reason.length >= 5 && reason.length <= 300 ? reason : null; }
function asInt(value,fallback,min,max){ const n=Number.parseInt(value,10); return Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : fallback; }
function matchesSearch(item,student,query){
  if(!query) return true;
  const haystack=[student.name,student.prn,student.branch,student.class,student.year,item.title,item.name,item.company,item.role,item.issuer,item.publication,item.repository_url,item.project_url,item.paper_url,item.doi_url].map(v=>text(v).toLowerCase()).join(' ');
  return haystack.includes(query.toLowerCase());
}
function evidenceLinks(type,item){
  if(type === 'project') return [item.repository_url,item.project_url].filter(Boolean);
  if(type === 'research') return [item.doi_url,item.paper_url].filter(Boolean);
  return [];
}
async function clearCaches(){
  await Promise.all([
    kvCache.clearPattern('students_list'),
    kvCache.clearPattern('profile_ranking'),
    kvCache.clearPattern('leaderboard')
  ]).catch(()=>{});
}
async function notifyDecision({studentId,type,item,decision,reason,actorLabel}){
  const config=TYPE_MAP[type];
  const title=config.title(item);
  try{
    return await createStudentNotification({
      student_id:studentId,
      audience:'student',
      title:`${config.label.charAt(0).toUpperCase()+config.label.slice(1)} ${decision === 'approve' ? 'approved' : 'rejected'}`,
      message:decision === 'approve'
        ? `Your ${config.label} “${title}” was reviewed and approved by ${actorLabel}. Eligible Profile Points now count.`
        : `Your ${config.label} “${title}” was rejected by ${actorLabel}. Reason: ${reason}`,
      priority:'important',
      action_url:'/dashboard?tab=edit-profile'
    });
  }catch(error){
    console.error('Flagged queue notification failed:',error.message);
    return null;
  }
}

async function buildQueue({branch='all',search='',type='all',risk='all'}){
  const [students,projects,research,internships,certificates]=await Promise.all([
    db.select('students'),db.select('student_projects'),db.select('research_papers'),db.select('internships'),db.select('certificates')
  ]);
  const byStudent=new Map((students || []).map(student=>[String(student.id),student]));
  const groups={project:projects || [],research:research || [],internship:internships || [],certificate:certificates || []};
  const rows=[];
  for(const [recordType,records] of Object.entries(groups)){
    if(type !== 'all' && type !== recordType) continue;
    const grouped=new Map();
    for(const record of records){
      const key=String(record.student_id || '');
      const list=grouped.get(key) || [];
      list.push(record); grouped.set(key,list);
    }
    const duplicateSetByStudent=new Map([...grouped.entries()].map(([studentId,list])=>[studentId,duplicateIds(recordType,list)]));
    for(const item of records){
      const student=byStudent.get(String(item.student_id));
      if(!student || student.status === 'inactive') continue;
      if(branch !== 'all' && text(student.branch).toUpperCase() !== text(branch).toUpperCase()) continue;
      if(!matchesSearch(item,student,search)) continue;
      let moderation=evaluate(recordType,item,{ github_url:student.github_url || '' });
      if(duplicateSetByStudent.get(String(item.student_id))?.has(String(item.id))) moderation=markDuplicate(moderation);
      if(!moderation.needs_review && !moderation.audit_sample) continue;
      if(risk !== 'all' && moderation.level !== risk) continue;
      rows.push({
        id:item.id,
        student_id:student.id,
        student_name:student.name || 'Student',
        prn:student.prn || '',
        branch:student.branch || '',
        class:student.class || '',
        year:student.year || '',
        type:recordType,
        title:TYPE_MAP[recordType].title(item),
        moderation,
        verification_status:normalizedStatus(item),
        links:evidenceLinks(recordType,item),
        submitted_at:item.created_at || item.updated_at || null
      });
    }
  }
  rows.sort((a,b)=>{
    const riskOrder={high:0,medium:1,low:2};
    return (riskOrder[a.moderation.level] ?? 9)-(riskOrder[b.moderation.level] ?? 9)
      || text(a.branch).localeCompare(text(b.branch))
      || text(a.student_name).localeCompare(text(b.student_name));
  });
  return rows;
}

function createRouter(role){
  const router=express.Router();
  const isObserver=role === 'observer';
  router.use(isObserver ? authenticateObserver : authenticateAdmin);

  router.get('/',async(req,res)=>{
    try{
      const branch=text(req.query.branch || 'all');
      const search=text(req.query.search || '').slice(0,120);
      const type=['all','project','research','internship','certificate'].includes(req.query.type) ? req.query.type : 'all';
      const risk=['all','high','medium','low'].includes(req.query.risk) ? req.query.risk : 'all';
      const page=asInt(req.query.page,1,1,100000);
      const pageSize=asInt(req.query.pageSize,25,10,50);
      const rows=await buildQueue({branch,search,type,risk});
      const observerDepartment=isObserver ? text(req.observer.department).toUpperCase() : null;
      const decorated=rows.map(row=>({
        ...row,
        can_review:!isObserver || text(row.branch).toUpperCase() === observerDepartment,
        review_scope:isObserver ? observerDepartment : 'all'
      }));
      const total=decorated.length;
      const totalPages=Math.max(1,Math.ceil(total/pageSize));
      const safePage=Math.min(page,totalPages);
      const start=(safePage-1)*pageSize;
      const data=decorated.slice(start,start+pageSize);
      const branchCounts=decorated.reduce((acc,row)=>{ acc[row.branch]=(acc[row.branch] || 0)+1; return acc; },{});
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
      return res.json({success:true,data:{rows:data,page:safePage,pageSize,total,totalPages,branch_counts:branchCounts,scope:{role:role === 'admin' ? 'tpo' : 'tpc',department:observerDepartment || 'all'}}});
    }catch(error){
      console.error('Flagged moderation queue load failed:',error.message);
      return res.status(500).json({success:false,error:{code:'FLAGGED_QUEUE_FAILED',message:'Unable to load flagged submissions.'}});
    }
  });

  router.post('/:type/:id/review',async(req,res)=>{
    try{
      const type=req.params.type;
      const config=TYPE_MAP[type];
      if(!config) return res.status(400).json({success:false,error:{code:'INVALID_TYPE',message:'Unsupported record type.'}});
      const decision=text(req.body?.decision).toLowerCase();
      if(!['approve','reject'].includes(decision)) return res.status(400).json({success:false,error:{code:'INVALID_DECISION',message:'Decision must be approve or reject.'}});
      const reason=decision === 'reject' ? cleanReason(req.body?.reason) : text(req.body?.reason).slice(0,300);
      if(decision === 'reject' && !reason) return res.status(400).json({success:false,error:{code:'REASON_REQUIRED',message:'Rejection reason must be 5 to 300 characters.'}});
      const item=await db.selectOne(config.table,{id:req.params.id});
      if(!item) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Submission not found.'}});
      const student=await db.selectOne('students',{id:item.student_id});
      if(!student) return res.status(404).json({success:false,error:{code:'STUDENT_NOT_FOUND',message:'Student not found.'}});
      if(isObserver && text(student.branch).toUpperCase() !== text(req.observer.department).toUpperCase()){
        return res.status(403).json({success:false,error:{code:'OUT_OF_SCOPE',message:'TPC can review only submissions from their own department.'}});
      }
      if((type === 'certificate' || type === 'internship') && decision === 'approve' && !item.evidence_path){
        return res.status(400).json({success:false,error:{code:'PROOF_REQUIRED',message:'Proof is required before approval.'}});
      }
      const actorId=isObserver ? req.observer.observerId : req.admin.adminId;
      const actorRole=isObserver ? 'tpc' : 'tpo';
      const actorLabel=isObserver ? 'TPC' : 'TPO';
      const now=new Date().toISOString();
      const verification_status=decision === 'approve' ? 'verified' : 'rejected';
      const updated=await db.update(config.table,{id:item.id,student_id:item.student_id},{
        verification_status,
        verification_note:decision === 'reject' ? reason : (reason || null),
        verified_at:now,
        verified_by:actorId,
        verified_role:actorRole
      });
      if(!updated) throw new Error('Review update matched no record.');
      await db.logAudit('flagged_submission_review',config.table,item.id,{
        student_id:item.student_id,student_prn:student.prn || null,branch:student.branch || null,type,decision,
        reason:decision === 'reject' ? reason : (reason || ''),actor_id:actorId,actor_role:actorRole,reviewed_at:now
      });
      const notification=await notifyDecision({studentId:item.student_id,type,item,decision,reason,actorLabel});
      await clearCaches();
      return res.json({success:true,data:{id:item.id,status:verification_status,notification_sent:Boolean(notification)},message:`${config.label} ${decision === 'approve' ? 'approved' : 'rejected'}.`});
    }catch(error){
      console.error('Flagged moderation review failed:',error.message);
      return res.status(500).json({success:false,error:{code:'FLAGGED_REVIEW_FAILED',message:'Unable to save moderation decision.'}});
    }
  });

  return router;
}

module.exports={admin:createRouter('admin'),observer:createRouter('observer'),buildQueue};
