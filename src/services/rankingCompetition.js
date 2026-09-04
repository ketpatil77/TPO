'use strict';

const crypto = require('crypto');
const db = require('../config/database');
const { createStudentNotification } = require('./incompleteProfilePush');

const SCOPE_KEY = 'college';
const PRESSURE_GAP = 6;
const SAFE_LEAD_GAP = 20;
const MAJOR_CLIMB = 5;

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const iso = value => (value instanceof Date ? value : new Date(value)).toISOString();
const secondsBetween = (a,b) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000) || 0);
const eventKey = parts => parts.map(v => String(v ?? '')).join(':').slice(0,240);
const dayKey = date => date.toISOString().slice(0,10);

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const week = Math.ceil((((d-start)/86400000)+1)/7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}

function holdTier(seconds) {
  if (seconds >= 7*86400) return {key:'guardian',label:'Rank Guardian',icon:'👑'};
  if (seconds >= 48*3600) return {key:'stronghold',label:'Stronghold',icon:'⚔'};
  if (seconds >= 24*3600) return {key:'defender',label:'Rank Defender',icon:'🛡'};
  return null;
}

function momentum({rankDelta=0, pointDelta=0, weeklyGain=0}={}) {
  if (rankDelta < 0) return {key:'slipping',label:'Slipping',icon:'🔻'};
  if (rankDelta >= 3 || weeklyGain >= 20) return {key:'hot',label:'Hot',icon:'🔥'};
  if (rankDelta > 0 || pointDelta > 0 || weeklyGain > 0) return {key:'rising',label:'Rising',icon:'⚡'};
  return {key:'stable',label:'Stable',icon:'🟢'};
}

function nearestDifferentRank(rows,index,direction) {
  const current = rows[index];
  if (!current) return null;
  const rank = num(current.rank ?? current.current_rank);
  for (let i=index+direction;i>=0&&i<rows.length;i+=direction) {
    if (num(rows[i].rank ?? rows[i].current_rank) !== rank) return rows[i];
  }
  return null;
}

function holdText(seconds) {
  const days=Math.floor(seconds/86400), hours=Math.floor((seconds%86400)/3600), mins=Math.floor((seconds%3600)/60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
}

async function notify(data) {
  try { return await createStudentNotification({...data,id:crypto.randomUUID(),branches:[],priority:'important',action_url:'/dashboard?tab=ranking',created_at:new Date().toISOString()}); }
  catch(error) { console.warn('Leaderboard notification delivery failed:',error.message); return null; }
}

async function emit({key,type,studentId,targetStudentId=null,rankFrom=null,rankTo=null,points=0,pointDelta=0,message,broadcast=false,privateStudentId=null,privateTitle='Your ranking changed'}) {
  let event;
  try {
    event = await db.insert('leaderboard_events',{id:crypto.randomUUID(),event_key:key,scope_key:SCOPE_KEY,event_type:type,student_id:studentId,target_student_id:targetStudentId,rank_from:rankFrom,rank_to:rankTo,points,point_delta:pointDelta,message,broadcast,created_at:new Date().toISOString()});
  } catch(error) {
    if (String(error?.code||'') === '23505') return null;
    throw error;
  }
  if (broadcast) await notify({audience:'all',student_id:null,title:'Leaderboard update',message});
  if (privateStudentId) await notify({audience:'student',student_id:privateStudentId,title:privateTitle,message});
  return event;
}

function baseState(row,now,wk) {
  return {id:crypto.randomUUID(),scope_key:SCOPE_KEY,student_id:row.student_id,current_rank:row.rank,previous_rank:row.rank,current_points:row.points,previous_points:row.points,rank_since:iso(now),longest_hold_seconds:0,longest_hold_rank:row.rank,best_rank:row.rank,hold_milestone_days:0,week_key:wk,week_start_points:row.points,week_start_rank:row.rank,growth_streak_weeks:0,last_rank_delta:0,last_point_delta:0,last_movement_at:null,updated_at:iso(now)};
}

async function initializeBaseline(rows,now,wk) {
  await Promise.all(rows.map(row=>db.insert('leaderboard_rank_state',baseState(row,now,wk))));
}

async function weeklyWinner(states,rowsById,wk) {
  const old = states.filter(s=>s.week_key&&s.week_key!==wk).map(s=>({s,row:rowsById.get(s.student_id),gain:num(s.current_points)-num(s.week_start_points)})).filter(x=>x.row&&x.gain>0).sort((a,b)=>b.gain-a.gain||num(a.s.current_rank)-num(b.s.current_rank))[0];
  if (!old) return;
  const gain=old.gain.toFixed(1).replace(/\.0$/,'');
  await emit({key:eventKey(['weekly-top-gainer',old.s.week_key,old.s.student_id]),type:'weekly_top_gainer',studentId:old.s.student_id,rankFrom:old.s.week_start_rank,rankTo:old.s.current_rank,points:old.s.current_points,pointDelta:old.gain,message:`🚀 ${old.row.name} gained ${gain} points and became ${old.s.week_key}'s fastest climber.`,broadcast:true});
}

async function pressure(row,below,now) {
  if (!below) return;
  const gap=Math.max(0,num(row.points)-num(below.points));
  if (gap>PRESSURE_GAP) return;
  await emit({key:eventKey(['pressure',row.student_id,below.student_id,dayKey(now)]),type:'under_pressure',studentId:row.student_id,targetStudentId:below.student_id,rankFrom:row.rank,rankTo:row.rank,points:row.points,message:`⚠ ${below.name} is only ${gap.toFixed(1).replace(/\.0$/,'')} pts behind your #${row.rank} spot. Keep building.`,privateStudentId:row.student_id,privateTitle:'Your rank is under pressure'});
}

function publicEvent(e) { return {id:e.id,type:e.event_type,message:e.message,rank_from:e.rank_from,rank_to:e.rank_to,points:num(e.points),point_delta:num(e.point_delta),created_at:e.created_at}; }

function badges(row,c,size) {
  const out=[];
  if(c.hold_badge) out.push(c.hold_badge);
  if(size&&row.rank/size<=.10) out.push({key:'top-10-percent',label:'Top 10%',icon:'🏆'});
  if(num(row.counts?.skills)>=10) out.push({key:'skill-builder',label:'Skill Builder',icon:'⚡'});
  if(num(row.counts?.projects)>=3) out.push({key:'project-builder',label:'Project Builder',icon:'🧩'});
  if(num(row.evidence_counts?.verified)>=1) out.push({key:'verified-achiever',label:'Verified Achiever',icon:'✓'});
  return out.slice(0,5);
}

function rowCompetition(row,state,above,below,now) {
  const hold=state?secondsBetween(state.rank_since,now):0, weekly=state?Math.max(0,num(row.points)-num(state.week_start_points)):0;
  const rankDelta=num(state?.last_rank_delta), pointDelta=num(state?.last_point_delta);
  const gapAhead=above?Math.max(0,num(above.points??above.current_points)-num(row.points)):0;
  const gapBehind=below?Math.max(0,num(row.points)-num(below.points??below.current_points)):0;
  return {movement:rankDelta,point_delta:pointDelta,weekly_gain:weekly,growth_streak_weeks:num(state?.growth_streak_weeks),hold_seconds:hold,hold_since:state?.rank_since||null,hold_badge:holdTier(hold),longest_hold_seconds:num(state?.longest_hold_seconds),longest_hold_rank:num(state?.longest_hold_rank||row.rank),best_rank:num(state?.best_rank||row.rank),last_movement_at:state?.last_movement_at||null,gap_ahead:gapAhead,gap_behind:gapBehind,pressure:Boolean(below&&gapBehind<=PRESSURE_GAP),safe_lead:Boolean(below&&gapBehind>=SAFE_LEAD_GAP),unbeaten:hold>=7*86400,momentum:momentum({rankDelta,pointDelta,weeklyGain:weekly})};
}

function attach(data,states,events,currentStudentId,now) {
  const stateById=new Map(states.map(s=>[s.student_id,s]));
  const rows=data.rows.map((row,i,all)=>{
    const c=rowCompetition(row,stateById.get(row.student_id),nearestDifferentRank(all,i,-1),nearestDifferentRank(all,i,1),now);
    c.cohort_size=all.length;c.badges=badges(row,c,all.length);return {...row,competition:c};
  });
  const top=rows.filter(r=>r.competition.hold_seconds>0).sort((a,b)=>b.competition.hold_seconds-a.competition.hold_seconds).slice(0,5).map(r=>({student_id:r.student_id,name:r.name,rank:r.rank,points:r.points,hold_seconds:r.competition.hold_seconds,badge:r.competition.hold_badge}));
  return {...data,rows,current:rows.find(r=>r.student_id===currentStudentId)||null,competition:{scope:SCOPE_KEY,events:events.map(publicEvent),top_holds:top,thresholds:{pressure_gap:PRESSURE_GAP,safe_lead_gap:SAFE_LEAD_GAP,major_climb:MAJOR_CLIMB}}};
}

async function enrichCollegeLeaderboard(data,currentStudentId,{now=new Date()}={}) {
  if(!data||data.filters?.branch!=='all'||data.filters?.year!=='all') return data;
  const rows=Array.isArray(data.rows)?data.rows:[];
  if(!rows.length) return {...data,competition:{scope:SCOPE_KEY,events:[],top_holds:[]}};
  const wk=weekKey(now), states=await db.select('leaderboard_rank_state',{scope_key:SCOPE_KEY}), rowsById=new Map(rows.map(r=>[r.student_id,r])), oldById=new Map(states.map(s=>[s.student_id,s])), oldByRank=new Map();
  states.forEach(s=>{const r=num(s.current_rank),list=oldByRank.get(r)||[];list.push(s);oldByRank.set(r,list);});
  if(!states.length){await initializeBaseline(rows,now,wk);return attach(data,await db.select('leaderboard_rank_state',{scope_key:SCOPE_KEY}),[],currentStudentId,now);}
  await weeklyWinner(states,rowsById,wk);

  for(let i=0;i<rows.length;i+=1){
    const row=rows[i], below=nearestDifferentRank(rows,i,1), old=oldById.get(row.student_id);
    if(!old){await db.insert('leaderboard_rank_state',baseState(row,now,wk));continue;}
    const same=num(old.current_rank)===num(row.rank), hold=secondsBetween(old.rank_since,now), rankDelta=num(old.current_rank)-num(row.rank), pointDelta=num(row.points)-num(old.current_points), rolled=old.week_key!==wk;
    const previousWeekGain=num(old.current_points)-num(old.week_start_points);
    const growth=rolled?(previousWeekGain>0?num(old.growth_streak_weeks)+1:0):num(old.growth_streak_weeks);
    const lost=same?0:hold, longest=Math.max(num(old.longest_hold_seconds),lost), longestRank=lost>=num(old.longest_hold_seconds)?num(old.current_rank):num(old.longest_hold_rank||old.current_rank), best=Math.min(num(old.best_rank||row.rank),num(row.rank));
    let milestone=same?num(old.hold_milestone_days):0, lastRank=num(old.last_rank_delta), lastPoint=num(old.last_point_delta), lastAt=old.last_movement_at||null;
    if(rankDelta!==0||pointDelta!==0){lastRank=rankDelta;lastPoint=pointDelta;lastAt=iso(now);}

    if(!same&&rankDelta>0){
      const displaced=(oldByRank.get(num(row.rank))||[]).filter(s=>s.student_id!==row.student_id).filter(s=>{const next=rowsById.get(s.student_id);return !next||num(next.rank)>num(row.rank);});
      const oldOccupant=displaced.length===1?displaced[0]:null, target=oldOccupant?rowsById.get(oldOccupant.student_id):null, targetName=target?.name||null;
      let broadcast=false,message=`⚡ ${row.name} climbed from #${old.current_rank} to #${row.rank}.`;
      if(num(row.rank)===1){message=targetName?`⚡ ${row.name} takes #1 from ${targetName} with ${num(row.points).toFixed(1).replace(/\.0$/,'')} points.`:`⚡ ${row.name} takes #1 with ${num(row.points).toFixed(1).replace(/\.0$/,'')} points.`;broadcast=true;}
      else if(num(row.rank)<=3){message=`🔥 ${row.name} captured #${row.rank}${targetName?` from ${targetName}`:''}.`;broadcast=true;}
      else if(num(old.current_rank)>10&&num(row.rank)<=10){message=`🔥 ${row.name} jumped into the Top 10 at #${row.rank}!`;broadcast=true;}
      else if(rankDelta>=MAJOR_CLIMB){message=`🚀 ${row.name} jumped ${rankDelta} places to #${row.rank}.`;broadcast=true;}
      await emit({key:eventKey(['capture',row.student_id,old.current_rank,row.rank,row.points]),type:broadcast?'major_capture':'rank_capture',studentId:row.student_id,targetStudentId:oldOccupant?.student_id||null,rankFrom:old.current_rank,rankTo:row.rank,points:row.points,pointDelta,message,broadcast,privateStudentId:broadcast?null:row.student_id});
      if(oldOccupant&&oldOccupant.student_id!==row.student_id){
        const gap=Math.max(0,num(row.points)-num(target?.points||oldOccupant.current_points));
        await emit({key:eventKey(['retake',oldOccupant.student_id,row.student_id,row.rank,row.points]),type:'rank_overtaken',studentId:oldOccupant.student_id,targetStudentId:row.student_id,rankFrom:oldOccupant.current_rank,rankTo:target?.rank||oldOccupant.current_rank,points:target?.points||oldOccupant.current_points,message:`${row.name} took your #${oldOccupant.current_rank} spot. Gap: ${gap.toFixed(1).replace(/\.0$/,'')} pts. Retake it.`,privateStudentId:oldOccupant.student_id,privateTitle:'Your rank was overtaken'});
      }
    } else if(!same&&rankDelta<0){
      await emit({key:eventKey(['lost',row.student_id,old.current_rank,row.rank,row.points]),type:'rank_lost',studentId:row.student_id,rankFrom:old.current_rank,rankTo:row.rank,points:row.points,pointDelta,message:`↓ Rank #${old.current_rank} lost after ${holdText(lost)}. You are now #${row.rank}.`,privateStudentId:row.student_id});
    }

    if(same){
      for(const days of [7,14]) if(hold>=days*86400&&milestone<days){
        const message=days===7?`👑 ${row.name} defended #${row.rank} for 7 days.`:`🛡 ${row.name} has held #${row.rank} for 14 days straight.`;
        await emit({key:eventKey(['hold',row.student_id,row.rank,days,old.rank_since]),type:'hold_milestone',studentId:row.student_id,rankFrom:row.rank,rankTo:row.rank,points:row.points,message,broadcast:true});milestone=days;
      }
    }
    await pressure(row,below,now);
    await db.update('leaderboard_rank_state',{id:old.id},{previous_rank:old.current_rank,current_rank:row.rank,previous_points:old.current_points,current_points:row.points,rank_since:same?old.rank_since:iso(now),longest_hold_seconds:longest,longest_hold_rank:longestRank,best_rank:best,hold_milestone_days:milestone,week_key:wk,week_start_points:rolled?row.points:old.week_start_points,week_start_rank:rolled?row.rank:old.week_start_rank,growth_streak_weeks:growth,last_rank_delta:lastRank,last_point_delta:lastPoint,last_movement_at:lastAt,updated_at:iso(now)});
  }
  const [fresh,events]=await Promise.all([db.select('leaderboard_rank_state',{scope_key:SCOPE_KEY}),db.select('leaderboard_events',{scope_key:SCOPE_KEY})]);
  return attach(data,fresh,events.filter(e=>e.broadcast).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,12),currentStudentId,now);
}

async function readCompetitionSnapshot(currentStudentId,{now=new Date()}={}) {
  const [states,events,students,skills,projects,certificates,competitions]=await Promise.all([db.select('leaderboard_rank_state',{scope_key:SCOPE_KEY}),db.select('leaderboard_events',{scope_key:SCOPE_KEY}),db.select('students'),db.select('student_skills',{student_id:currentStudentId}),db.select('student_projects',{student_id:currentStudentId}),db.select('certificates',{student_id:currentStudentId}),db.select('student_competitions',{student_id:currentStudentId})]);
  const byId=new Map(students.map(s=>[s.id,s]));
  const active=states.filter(s=>byId.get(s.student_id)?.status!=='inactive').sort((a,b)=>num(a.current_rank)-num(b.current_rank)||num(b.current_points)-num(a.current_points)||String(byId.get(a.student_id)?.name||'').localeCompare(String(byId.get(b.student_id)?.name||'')));
  const rows=active.map((state,i)=>{
    const student=byId.get(state.student_id)||{}, row={student_id:state.student_id,name:student.name||'Student',rank:num(state.current_rank),points:num(state.current_points)};
    row.competition=rowCompetition(row,state,nearestDifferentRank(active,i,-1),nearestDifferentRank(active,i,1),now);return row;
  });
  const current=rows.find(r=>r.student_id===currentStudentId)||null;
  if(current){
    const verified=[...certificates,...competitions].filter(x=>['verified','approved'].includes(String(x.verification_status||'').toLowerCase())).length;
    current.competition.badges=badges({rank:current.rank,counts:{skills:skills.length,projects:projects.length},evidence_counts:{verified}},current.competition,rows.length);
  }
  return {scope:SCOPE_KEY,current,rows,top_holds:rows.filter(r=>r.competition.hold_seconds>0).sort((a,b)=>b.competition.hold_seconds-a.competition.hold_seconds).slice(0,5),events:events.filter(e=>e.broadcast).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,12).map(publicEvent),thresholds:{pressure_gap:PRESSURE_GAP,safe_lead_gap:SAFE_LEAD_GAP,major_climb:MAJOR_CLIMB}};
}

module.exports={SCOPE_KEY,PRESSURE_GAP,SAFE_LEAD_GAP,MAJOR_CLIMB,weekKey,holdTier,momentum,nearestDifferentRank,enrichCollegeLeaderboard,readCompetitionSnapshot};
