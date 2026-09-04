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
  try { const url = new URL(text(value)); return url.protocol === 'https:' && Boolean(url.hostname); }
  catch (_) { return false; }
}
function githubLike(value) {
  try {
    const url = new URL(text(value));
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && /(^|\.)github\.com$/i.test(url.hostname) && parts.length >= 2;
  } catch (_) { return false; }
}
function githubOwner(value) {
  try {
    const url = new URL(text(value));
    if (url.protocol !== 'https:' || !/(^|\.)github\.com$/i.test(url.hostname)) return '';
    return (url.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  } catch (_) { return ''; }
}
function repeatedContent(values) {
  const compact = values.map(v => text(v).toLowerCase().replace(/[^a-z0-9]/g,'')).filter(Boolean);
  return compact.length > 1 && new Set(compact).size === 1;
}
function submissionKeys(type,item = {}) {
  const keys = new Set();
  const addUrl = (prefix, value) => { const u = normalizedUrl(value); if (u) keys.add(`${prefix}:${u}`); };
  if (type === 'project') {
    addUrl('project-link', item.repository_url);
    addUrl('project-link', item.project_url);
    const title = normalizedText(item.title);
    if (title) keys.add(`project-title:${title}`);
  } else if (type === 'research') {
    addUrl('research-link', item.doi_url);
    addUrl('research-link', item.paper_url);
    const title = normalizedText(item.title);
    const publication = normalizedText(item.publication);
    if (title && publication) keys.add(`research-title:${title}|${publication}`);
  } else if (type === 'internship') {
    const proof = text(item.evidence_sha256 || item.evidence_path);
    if (proof) keys.add(`intern-proof:${proof}`);
    const composite = `${normalizedText(item.company)}|${normalizedText(item.role)}|${text(item.start_date)}|${text(item.end_date)}`;
    if (composite.replace(/\|/g,'')) keys.add(`intern:${composite}`);
  } else if (type === 'certificate') {
    const proof = text(item.evidence_sha256 || item.evidence_path);
    if (proof) keys.add(`cert-proof:${proof}`);
    const date = text(item.date || item.issued_on || item.issue_date);
    const composite = `${normalizedText(item.name)}|${normalizedText(item.issuer)}|${date}`;
    if (composite.replace(/\|/g,'')) keys.add(`cert:${composite}`);
  }
  return [...keys];
}
function canonicalSubmissionKey(type,item = {}) { return submissionKeys(type,item)[0] || ''; }
function duplicateConflict(type, candidate = {}, rows = [], editingId = null) {
  const candidateKeys = new Set(submissionKeys(type, candidate));
  if (!candidateKeys.size) return null;
  for (const row of rows || []) {
    if (editingId && String(row.id) === String(editingId)) continue;
    for (const key of submissionKeys(type, row)) {
      if (candidateKeys.has(key)) return { row, key };
    }
  }
  return null;
}
function duplicateIds(type, rows = []) {
  const sorted = [...rows].sort((a,b) => String(a.created_at || a.id || '').localeCompare(String(b.created_at || b.id || '')));
  const seen = new Map();
  const duplicates = new Set();
  for (const row of sorted) {
    for (const key of submissionKeys(type,row)) {
      if (seen.has(key)) duplicates.add(String(row.id));
      else seen.set(key, String(row.id));
    }
  }
  return duplicates;
}
function auditSample(item = {}) {
  const key = text(item.id || item.evidence_sha256 || item.repository_url || item.doi_url || item.title || item.name || item.company);
  if (!key) return false;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
  return hash % 20 === 0;
}
function classify(score,reasons,item,extra = {}) {
  const capped = Math.min(100, Math.max(0, score));
  const low = capped < 30;
  return { score:capped, level:capped >= 60 ? 'high' : capped >= 30 ? 'medium' : 'low', auto_approved:low, needs_review:!low, audit_sample:low && auditSample(item), reasons, ...extra };
}
function markDuplicate(risk) {
  return { ...risk, score:100, level:'high', auto_approved:false, needs_review:true, audit_sample:false, duplicate:true, reasons:['Duplicate entry declined. No cheating: this link, proof, or record is already used.', ...(risk.reasons || [])] };
}
function privateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^(127\.|10\.|0\.|169\.254\.)/.test(host)) return true;
  const m = host.match(/^192\.168\./); if (m) return true;
  const ip172 = host.match(/^172\.(\d+)\./); if (ip172 && Number(ip172[1]) >= 16 && Number(ip172[1]) <= 31) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  return false;
}
function safePublicHttpsUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' && !privateHost(url.hostname);
  } catch (_) { return false; }
}
async function checkReachableUrl(value, { timeoutMs = 3500 } = {}) {
  if (!safePublicHttpsUrl(value)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const target = String(value);
  try {
    let response = await fetch(target, { method:'HEAD', redirect:'follow', signal:controller.signal, headers:{ 'User-Agent':'AIT-Placement-Integrity/1.0' } });
    if (response.status === 405 || response.status === 403 || response.status === 400) {
      response = await fetch(target, { method:'GET', redirect:'follow', signal:controller.signal, headers:{ Range:'bytes=0-0', 'User-Agent':'AIT-Placement-Integrity/1.0' } });
    }
    return response.status >= 200 && response.status < 400;
  } catch (_) { return false; }
  finally { clearTimeout(timer); }
}
async function checkReachableUrls(values = [], options) {
  const unique = [...new Set(values.map(normalizedUrl).filter(Boolean))];
  const entries = await Promise.all(unique.map(async url => [url, await checkReachableUrl(url, options)]));
  return Object.fromEntries(entries);
}
function linkStatus(context, value) {
  const key = normalizedUrl(value);
  return key ? context?.linkStatus?.[key] : undefined;
}
function projectRisk(item = {}, context = {}) {
  let score=0; const reasons=[];
  const liveOk = validHttps(item.project_url);
  const repoOk = validHttps(item.repository_url);
  if(isJunk(item.title)){score+=60;reasons.push('Project title looks like placeholder text.');}
  if(text(item.summary).length<40||tokens(item.summary).length<7){score+=35;reasons.push('Project description is too thin to establish real work.');}
  if(isJunk(item.summary)){score+=50;reasons.push('Project description looks like junk text.');}
  if(text(item.technologies)&&isJunk(item.technologies)){score+=20;reasons.push('Technology list looks invalid.');}
  if(!liveOk&&!repoOk){score+=45;reasons.push('Every project needs at least one valid HTTPS live URL or GitHub repository URL.');}
  if(item.repository_url&&!githubLike(item.repository_url)){score+=45;reasons.push('Repository URL must be a real GitHub owner/repository link.');}
  if(liveOk && repoOk && normalizedUrl(item.project_url) === normalizedUrl(item.repository_url)){score+=50;reasons.push('Live URL and repository URL cannot be the same link.');}
  if(context.enforceOwnership && repoOk && githubLike(item.repository_url)) {
    const repoOwner = githubOwner(item.repository_url);
    const profileOwner = String(context.profileGithubUsername || '').toLowerCase();
    if (!profileOwner) { score += 35; reasons.push('Add your GitHub profile in the GitHub link section before this repository can be auto-verified.'); }
    else if (repoOwner && repoOwner !== profileOwner) { score += 55; reasons.push(`Repository owner @${repoOwner} does not match the student GitHub profile @${profileOwner}.`); }
  }
  if(context.enforceReachability) {
    if (liveOk && linkStatus(context,item.project_url) === false) { score += 35; reasons.push('Live project URL could not be reached.'); }
    if (repoOk && linkStatus(context,item.repository_url) === false) { score += 45; reasons.push('GitHub repository URL could not be reached.'); }
  }
  if(context.reusedLink){score+=80;reasons.push('This project link is already used by another project on the same profile.');}
  if(repeatedContent([item.title,item.summary,item.technologies])){score+=30;reasons.push('Repeated placeholder content across fields.');}
  return classify(score,reasons,item);
}
function researchRisk(item = {}, context = {}) {
  let score=0; const reasons=[];
  const doiOk = validHttps(item.doi_url);
  const paperOk = validHttps(item.paper_url);
  if(isJunk(item.title)){score+=60;reasons.push('Research title looks like placeholder text.');}
  if(isJunk(item.publication)){score+=45;reasons.push('Publication/journal looks invalid.');}
  if(text(item.abstract).length<80||tokens(item.abstract).length<12){score+=35;reasons.push('Abstract/contribution is too short.');}
  if(isJunk(item.abstract)){score+=60;reasons.push('Abstract looks like junk text.');}
  if(!doiOk&&!paperOk){score+=45;reasons.push('Provide at least one working HTTPS publication, paper, or DOI link. A doi.org URL is not mandatory.');}
  if(context.enforceReachability) {
    const reachable = [item.doi_url,item.paper_url].filter(validHttps).some(value => linkStatus(context,value) === true);
    if ((doiOk || paperOk) && !reachable) { score += 45; reasons.push('None of the supplied research links could be reached.'); }
  }
  if(context.reusedLink){score+=80;reasons.push('This research link is already used by another research entry.');}
  if(repeatedContent([item.title,item.publication,item.abstract])){score+=35;reasons.push('Repeated placeholder content across fields.');}
  return classify(score,reasons,item);
}
function internshipRisk(item = {}) {
  let score=0; const reasons=[];
  if(isJunk(item.company)){score+=50;reasons.push('Company name looks invalid.');}
  if(isJunk(item.role)){score+=45;reasons.push('Role looks invalid.');}
  if(text(item.company).length<3)score+=15;
  if(text(item.role).length<3)score+=15;
  if(!item.evidence_path){score+=40;reasons.push('Internship proof is required for automatic verification.');}
  return classify(score,reasons,item);
}
function certificateRisk(item = {}) {
  let score=0; const reasons=[];
  if(isJunk(item.name)){score+=55;reasons.push('Certificate name looks invalid.');}
  if(isJunk(item.issuer)){score+=45;reasons.push('Issuer looks invalid.');}
  if(text(item.name).length<4)score+=10;
  if(text(item.issuer).length<3)score+=10;
  if(!item.evidence_path){score+=40;reasons.push('Certificate proof is required for automatic verification. Unverified certificates earn 0 points.');}
  return classify(score,reasons,item);
}
function evaluate(type,item,context = {}) {
  if(type==='project')return projectRisk(item,context);
  if(type==='research')return researchRisk(item,context);
  if(type==='internship')return internshipRisk(item,context);
  if(type==='certificate')return certificateRisk(item,context);
  return classify(100,['Unsupported submission type.'],item);
}
module.exports={ evaluate,projectRisk,researchRisk,internshipRisk,certificateRisk,auditSample,isJunk,validHttps,githubLike,githubOwner,normalizedUrl,safePublicHttpsUrl,checkReachableUrl,checkReachableUrls,canonicalSubmissionKey,submissionKeys,duplicateConflict,duplicateIds,markDuplicate };
