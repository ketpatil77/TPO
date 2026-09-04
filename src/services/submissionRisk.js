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
  try { const url = new URL(text(value)); return url.protocol === 'https:'; }
  catch (_) { return false; }
}
function githubLike(value) {
  try {
    const url = new URL(text(value));
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && /(^|\.)github\.com$/i.test(url.hostname) && parts.length >= 2;
  } catch (_) { return false; }
}
function doiLike(value) {
  try { const url = new URL(text(value)); return url.protocol === 'https:' && /(^|\.)doi\.org$/i.test(url.hostname) && url.pathname.length > 2; }
  catch (_) { return false; }
}
function repeatedContent(values) {
  const compact = values.map(v => text(v).toLowerCase().replace(/[^a-z0-9]/g,'')).filter(Boolean);
  return compact.length > 1 && new Set(compact).size === 1;
}
function canonicalSubmissionKey(type,item = {}) {
  if (type === 'project') {
    const repo = normalizedUrl(item.repository_url);
    const live = normalizedUrl(item.project_url);
    return repo ? `repo:${repo}` : live ? `live:${live}` : `project:${normalizedText(item.title)}`;
  }
  if (type === 'research') {
    const doi = normalizedUrl(item.doi_url);
    const paper = normalizedUrl(item.paper_url);
    return doi ? `doi:${doi}` : paper ? `paper:${paper}` : `research:${normalizedText(item.title)}|${normalizedText(item.publication)}`;
  }
  if (type === 'internship') {
    const proof = text(item.evidence_sha256 || item.evidence_path);
    return proof ? `intern-proof:${proof}` : `intern:${normalizedText(item.company)}|${normalizedText(item.role)}|${text(item.start_date)}|${text(item.end_date)}`;
  }
  if (type === 'certificate') {
    const proof = text(item.evidence_sha256 || item.evidence_path);
    return proof ? `cert-proof:${proof}` : `cert:${normalizedText(item.name)}|${normalizedText(item.issuer)}|${text(item.issued_on || item.issue_date)}`;
  }
  return '';
}
function duplicateIds(type, rows = []) {
  const sorted = [...rows].sort((a,b) => String(a.created_at || a.id || '').localeCompare(String(b.created_at || b.id || '')));
  const seen = new Set();
  const duplicates = new Set();
  for (const row of sorted) {
    const key = canonicalSubmissionKey(type,row);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(String(row.id));
    else seen.add(key);
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
function classify(score,reasons,item) {
  const capped = Math.min(100, Math.max(0, score));
  const low = capped < 30;
  return { score:capped, level:capped >= 60 ? 'high' : capped >= 30 ? 'medium' : 'low', auto_approved:low, needs_review:!low, audit_sample:low && auditSample(item), reasons };
}
function markDuplicate(risk) {
  return { ...risk, score:100, level:'high', auto_approved:false, needs_review:true, audit_sample:false, duplicate:true, reasons:['Duplicate submission detected. Duplicate records earn zero Profile Points.', ...(risk.reasons || [])] };
}
function projectRisk(item = {}) {
  let score=0; const reasons=[];
  if(isJunk(item.title)){score+=60;reasons.push('Project title looks like placeholder text.');}
  if(text(item.summary).length<40||tokens(item.summary).length<7){score+=35;reasons.push('Project description is too thin to establish real work.');}
  if(isJunk(item.summary)){score+=50;reasons.push('Project description looks like junk text.');}
  if(text(item.technologies)&&isJunk(item.technologies)){score+=20;reasons.push('Technology list looks invalid.');}
  if(!validHttps(item.project_url)&&!validHttps(item.repository_url)){score+=35;reasons.push('A valid HTTPS live project or repository URL is required for automatic scoring.');}
  if(item.repository_url&&!githubLike(item.repository_url)){score+=20;reasons.push('Repository URL must point to a GitHub owner/repository path.');}
  if(repeatedContent([item.title,item.summary,item.technologies])){score+=30;reasons.push('Repeated placeholder content across fields.');}
  return classify(score,reasons,item);
}
function researchRisk(item = {}) {
  let score=0; const reasons=[];
  if(isJunk(item.title)){score+=60;reasons.push('Research title looks like placeholder text.');}
  if(isJunk(item.publication)){score+=45;reasons.push('Publication/journal looks invalid.');}
  if(text(item.abstract).length<80||tokens(item.abstract).length<12){score+=35;reasons.push('Abstract/contribution is too short.');}
  if(isJunk(item.abstract)){score+=60;reasons.push('Abstract looks like junk text.');}
  if(!validHttps(item.doi_url)&&!validHttps(item.paper_url)){score+=35;reasons.push('A valid DOI or paper URL is required for automatic scoring.');}
  if(item.doi_url&&!doiLike(item.doi_url)){score+=30;reasons.push('DOI URL is not a valid doi.org path.');}
  if(repeatedContent([item.title,item.publication,item.abstract])){score+=35;reasons.push('Repeated placeholder content across fields.');}
  return classify(score,reasons,item);
}
function internshipRisk(item = {}) {
  let score=0; const reasons=[];
  if(isJunk(item.company)){score+=50;reasons.push('Company name looks invalid.');}
  if(isJunk(item.role)){score+=45;reasons.push('Role looks invalid.');}
  if(text(item.company).length<3)score+=15;
  if(text(item.role).length<3)score+=15;
  if(!item.evidence_path){score+=35;reasons.push('Internship proof is required for automatic quality approval.');}
  return classify(score,reasons,item);
}
function certificateRisk(item = {}) {
  let score=0; const reasons=[];
  if(isJunk(item.name)){score+=55;reasons.push('Certificate name looks invalid.');}
  if(isJunk(item.issuer)){score+=45;reasons.push('Issuer looks invalid.');}
  if(text(item.name).length<4)score+=10;
  if(text(item.issuer).length<3)score+=10;
  if(!item.evidence_path){score+=30;reasons.push('Certificate proof is required for automatic quality approval.');}
  return classify(score,reasons,item);
}
function evaluate(type,item) {
  if(type==='project')return projectRisk(item);
  if(type==='research')return researchRisk(item);
  if(type==='internship')return internshipRisk(item);
  if(type==='certificate')return certificateRisk(item);
  return classify(100,['Unsupported submission type.'],item);
}
module.exports={ evaluate,projectRisk,researchRisk,internshipRisk,certificateRisk,auditSample,isJunk,validHttps,githubLike,doiLike,canonicalSubmissionKey,duplicateIds,markDuplicate };
