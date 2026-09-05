'use strict';

const JUNK = new Set(['test','testing','abc','abcd','asdf','none','na','n/a','nil','sample','demo','project','research','paper','certificate','internship','hello','hi','xyz','123']);

function text(value) { return String(value || '').trim(); }
function tokens(value) { return text(value).toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean); }
function normalizedText(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' '); }
function normalizedUrl(value) {
  try {
    const url = new URL(text(value));
    url.hash = '';
    url.search = '';
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/,'')}`.toLowerCase();
  } catch (_) { return ''; }
}
function isJunk(value) {
  const normalized = text(value).toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return true;
  if (JUNK.has(normalized)) return true;
  const parts = tokens(normalized);
  return parts.length <= 2 && parts.every(part => JUNK.has(part) || /^\d+$/.test(part));
}
function validHttps(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch (_) { return false; }
}
function githubLike(value) {
  try {
    const url = new URL(text(value));
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && /(^|\.)github\.com$/i.test(url.hostname) && parts.length >= 2;
  } catch (_) { return false; }
}
function githubProfileOwner(value) {
  try {
    const url = new URL(text(value));
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return '';
    return (url.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  } catch (_) { return ''; }
}
function githubRepoOwner(value) {
  if (!githubLike(value)) return '';
  try { return (new URL(text(value)).pathname.split('/').filter(Boolean)[0] || '').toLowerCase(); }
  catch (_) { return ''; }
}
function doiLike(value) {
  try { const url = new URL(text(value)); return url.protocol === 'https:' && /(^|\.)doi\.org$/i.test(url.hostname) && url.pathname.length > 2; }
  catch (_) { return false; }
}
function repeatedContent(values) {
  const compact = values.map(v => text(v).toLowerCase().replace(/[^a-z0-9]/g,'')).filter(Boolean);
  return compact.length > 1 && new Set(compact).size === 1;
}
function titleFingerprint(prefix, value) {
  const title = normalizedText(value);
  return title ? `${prefix}-title:${title}` : '';
}
function evidenceFingerprints(type,item = {}) {
  const out = [];
  if (type === 'project') {
    const repo = normalizedUrl(item.repository_url); const live = normalizedUrl(item.project_url);
    if (repo) out.push(`project-url:${repo}`);
    if (live) out.push(`project-url:${live}`);
  } else if (type === 'research') {
    const doi = normalizedUrl(item.doi_url); const paper = normalizedUrl(item.paper_url);
    if (doi) out.push(`research-url:${doi}`);
    if (paper) out.push(`research-url:${paper}`);
  } else if (type === 'internship') {
    const proof = text(item.evidence_sha256 || item.evidence_path);
    if (proof) out.push(`intern-proof:${proof}`);
  } else if (type === 'certificate') {
    const proof = text(item.evidence_sha256 || item.evidence_path);
    if (proof) out.push(`cert-proof:${proof}`);
  }
  return [...new Set(out.filter(Boolean))];
}
function submissionFingerprints(type,item = {}) {
  const out = [...evidenceFingerprints(type,item)];
  if (type === 'project') {
    out.push(titleFingerprint('project', item.title));
  } else if (type === 'research') {
    out.push(titleFingerprint('research', item.title));
  } else if (type === 'internship') {
    const start = text(item.start_date), end = text(item.end_date);
    if (start || end) out.push(`intern:${normalizedText(item.company)}|${normalizedText(item.role)}|${start}|${end}`);
  } else if (type === 'certificate') {
    const issued = text(item.date || item.issued_on || item.issue_date);
    if (issued) out.push(`cert:${normalizedText(item.name)}|${normalizedText(item.issuer)}|${issued}`);
  }
  return [...new Set(out.filter(Boolean))];
}
function canonicalSubmissionKey(type,item = {}) { return submissionFingerprints(type,item)[0] || ''; }
function duplicateIds(type, rows = []) {
  const sorted = [...rows].sort((a,b) => String(a.created_at || a.id || '').localeCompare(String(b.created_at || b.id || '')));
  const seen = new Set(); const duplicates = new Set();
  for (const row of sorted) {
    const fps = submissionFingerprints(type,row);
    if (fps.some(fp => seen.has(fp))) duplicates.add(String(row.id));
    fps.forEach(fp => seen.add(fp));
  }
  return duplicates;
}
function auditSample(item = {}) {
  const key = text(item.id || item.evidence_sha256 || item.repository_url || item.doi_url || item.title || item.name || item.company);
  if (!key) return false;
  let hash = 0; for (let i = 0; i < key.length; i += 1) hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
  return hash % 20 === 0;
}
function classify(score,reasons,item,{hardReject=false}={}) {
  const capped = Math.min(100, Math.max(0, score)); const low = capped < 30;
  return { score:capped, level:capped >= 60 ? 'high' : capped >= 30 ? 'medium' : 'low', auto_approved:low, needs_review:!low, audit_sample:low && auditSample(item), hard_reject:Boolean(hardReject), reasons };
}
function markDuplicate(risk) {
  return { ...risk, score:100, level:'high', auto_approved:false, needs_review:false, hard_reject:true, audit_sample:false, duplicate:true, reasons:['Duplicate entry detected. The same title or unique evidence is already saved in this profile. No cheating.', ...(risk.reasons || [])] };
}
function applyStoredDecision(risk,item={}) {
  const status = String(item.verification_status || '').toLowerCase();
  const note = text(item.verification_note);
  if (status === 'verified' || status === 'approved') return { ...risk, auto_approved:true, needs_review:false, hard_reject:false, audit_sample:false, staff_approved:true, level:'low' };
  if (status === 'rejected') return { ...risk, auto_approved:false, needs_review:false, hard_reject:false, audit_sample:false, staff_rejected:true, level:'high', score:100, reasons:[note || 'Rejected by TPO/TPC.', ...(risk.reasons || [])] };
  if (status === 'pending' && /^AUTO_FLAG:/i.test(note)) {
    const reason = note.replace(/^AUTO_FLAG:\s*/i,'').trim();
    return { ...risk, score:Math.max(45, Number(risk.score)||0), level:(Number(risk.score)||0)>=60?'high':'medium', auto_approved:false, needs_review:true, hard_reject:false, audit_sample:false, reasons:[reason || 'Automatic evidence validation requires staff review.', ...(risk.reasons || [])] };
  }
  return risk;
}
function projectRisk(item = {}, context = {}) {
  let score=0, hardReject=false; const reasons=[];
  if(isJunk(item.title)){score+=70;hardReject=true;reasons.push('Project title looks like placeholder or junk text.');}
  if(text(item.summary).length<40||tokens(item.summary).length<7){score+=35;reasons.push('Project description is too thin to establish real work.');}
  if(isJunk(item.summary)){score+=60;hardReject=true;reasons.push('Project description looks like junk text.');}
  if(text(item.technologies)&&isJunk(item.technologies)){score+=20;reasons.push('Technology list looks invalid.');}
  const repoRaw=text(item.repository_url), liveRaw=text(item.project_url), repo=normalizedUrl(repoRaw), live=normalizedUrl(liveRaw);
  const hasLive=validHttps(liveRaw), hasRepo=validHttps(repoRaw)&&githubLike(repoRaw);
  if(repoRaw&&!validHttps(repoRaw)){score+=70;hardReject=true;reasons.push('Repository URL must be a valid HTTPS URL.');}
  else if(repoRaw&&!githubLike(repoRaw)){score+=70;hardReject=true;reasons.push('Repository URL must be a GitHub owner/repository link, not a profile or homepage.');}
  if(liveRaw&&!validHttps(liveRaw)){score+=70;hardReject=true;reasons.push('Live project URL must be a valid HTTPS URL.');}
  if(repo&&live&&repo===live){score=100;hardReject=true;reasons.push('Repository URL and live project URL cannot be the same link.');}
  if(!hasLive&&!hasRepo){score+=60;reasons.push('Every project needs at least one valid project-specific live URL or GitHub repository URL.');}
  const profileOwner=githubProfileOwner(context.github_url || item.student_github_url), repoOwner=githubRepoOwner(repoRaw);
  if(profileOwner&&repoOwner&&profileOwner!==repoOwner){score+=45;reasons.push(`Repository owner @${repoOwner} does not match the student GitHub profile @${profileOwner}. Team/organisation projects require staff review.`);}
  if(repeatedContent([item.title,item.summary,item.technologies])){score+=30;reasons.push('Repeated placeholder content across project fields.');}
  return applyStoredDecision(classify(score,reasons,item,{hardReject}),item);
}
function researchRisk(item = {}) {
  let score=0, hardReject=false; const reasons=[];
  if(isJunk(item.title)){score+=70;hardReject=true;reasons.push('Research title looks like placeholder or junk text.');}
  if(isJunk(item.publication)){score+=45;reasons.push('Publication/journal looks invalid.');}
  if(text(item.abstract).length<80||tokens(item.abstract).length<12){score+=35;reasons.push('Abstract/contribution is too short.');}
  if(isJunk(item.abstract)){score+=60;hardReject=true;reasons.push('Abstract looks like junk text.');}
  const doiRaw=text(item.doi_url), paperRaw=text(item.paper_url), publicationUrl=validHttps(doiRaw), paper=validHttps(paperRaw);
  if(doiRaw&&!validHttps(doiRaw)){score+=70;hardReject=true;reasons.push('DOI/publication URL is malformed or not HTTPS.');}
  if(paperRaw&&!validHttps(paperRaw)){score+=70;hardReject=true;reasons.push('Paper URL is malformed or not HTTPS.');}
  if(!publicationUrl&&!paper){score+=45;reasons.push('A valid HTTPS journal, publication, DOI, or paper URL is required for automatic scoring.');}
  if(repeatedContent([item.title,item.publication,item.abstract])){score+=35;reasons.push('Repeated placeholder content across research fields.');}
  return applyStoredDecision(classify(score,reasons,item,{hardReject}),item);
}
function internshipRisk(item = {}) {
  let score=0, hardReject=false; const reasons=[];
  if(isJunk(item.company)){score+=60;hardReject=true;reasons.push('Company name looks invalid.');}
  if(isJunk(item.role)){score+=60;hardReject=true;reasons.push('Role looks invalid.');}
  if(text(item.company).length<3)score+=15; if(text(item.role).length<3)score+=15;
  if(!item.evidence_path){score+=35;reasons.push('Internship proof is required for automatic quality approval.');}
  return applyStoredDecision(classify(score,reasons,item,{hardReject}),item);
}
function certificateRisk(item = {}) {
  let score=0, hardReject=false; const reasons=[];
  if(isJunk(item.name)){score+=65;hardReject=true;reasons.push('Certificate name looks invalid.');}
  if(isJunk(item.issuer)){score+=60;hardReject=true;reasons.push('Issuer looks invalid.');}
  if(text(item.name).length<4)score+=10; if(text(item.issuer).length<3)score+=10;
  if(!item.evidence_path){score+=30;reasons.push('Certificate proof is required before verification.');}
  return applyStoredDecision(classify(score,reasons,item,{hardReject}),item);
}
function evaluate(type,item,context={}) {
  if(type==='project')return projectRisk(item,context);
  if(type==='research')return researchRisk(item,context);
  if(type==='internship')return internshipRisk(item,context);
  if(type==='certificate')return certificateRisk(item,context);
  return classify(100,['Unsupported submission type.'],item,{hardReject:true});
}
module.exports={ evaluate,projectRisk,researchRisk,internshipRisk,certificateRisk,auditSample,isJunk,validHttps,githubLike,githubProfileOwner,githubRepoOwner,doiLike,canonicalSubmissionKey,submissionFingerprints,evidenceFingerprints,duplicateIds,markDuplicate,normalizedText,normalizedUrl };
