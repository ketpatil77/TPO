'use strict';

function text(value){ return String(value||'').trim(); }
function isPrivateIpv4(host){
  const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if(!m)return false;
  const [a,b,c,d]=m.slice(1).map(Number);
  if([a,b,c,d].some(n=>n<0||n>255))return true;
  return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19))||a>=224;
}
function unsafeHostname(hostname){
  const host=String(hostname||'').toLowerCase().replace(/^\[|\]$/g,'');
  if(!host)return true;
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host==='metadata.google.internal')return true;
  if(host.includes(':'))return true; // literal IPv6 is never accepted as student evidence.
  return isPrivateIpv4(host);
}
function inspectEvidenceUrl(value){
  try{
    const url=new URL(text(value));
    if(url.protocol!=='https:')return{ok:false,hard_invalid:true,reason:'Evidence URL must use HTTPS.'};
    if(!url.hostname||unsafeHostname(url.hostname))return{ok:false,hard_invalid:true,reason:'Evidence URL host is not allowed.'};
    if(url.username||url.password)return{ok:false,hard_invalid:true,reason:'Evidence URL cannot contain embedded credentials.'};
    if(url.port&&url.port!=='443')return{ok:false,hard_invalid:true,reason:'Evidence URL must use the standard HTTPS port.'};
    return{ok:true,url:url.toString()};
  }catch(_){return{ok:false,hard_invalid:true,reason:'Evidence URL is malformed.'};}
}
async function fetchOnce(fetchImpl,url,method,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{method,redirect:'manual',signal:controller.signal,headers:method==='GET'?{Range:'bytes=0-0'}:{}});
    try{ if(method==='GET'&&response.body?.cancel) await response.body.cancel(); }catch(_){}
    return response;
  }finally{clearTimeout(timer);}
}
async function probeEvidenceUrl(value,{fetchImpl=globalThis.fetch,timeoutMs=5000,maxRedirects=2}={}){
  const inspected=inspectEvidenceUrl(value);
  if(!inspected.ok)return inspected;
  if(typeof fetchImpl!=='function')return{ok:false,temporary:true,reason:'Evidence URL could not be checked right now.'};
  let current=inspected.url;
  for(let redirect=0;redirect<=maxRedirects;redirect+=1){
    try{
      let response=await fetchOnce(fetchImpl,current,'HEAD',timeoutMs);
      if(response.status===405||response.status===501)response=await fetchOnce(fetchImpl,current,'GET',timeoutMs);
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers?.get?.('location');
        if(!location)return{ok:false,temporary:false,status:response.status,reason:'Evidence URL redirects without a destination.'};
        const next=inspectEvidenceUrl(new URL(location,current).toString());
        if(!next.ok)return next;
        current=next.url;
        continue;
      }
      if(response.status>=200&&response.status<300)return{ok:true,status:response.status,final_url:current};
      return{ok:false,temporary:response.status===408||response.status===425||response.status===429||response.status>=500,status:response.status,reason:`Evidence URL returned HTTP ${response.status}.`};
    }catch(error){
      return{ok:false,temporary:true,reason:error?.name==='AbortError'?'Evidence URL timed out.':'Evidence URL could not be reached.'};
    }
  }
  return{ok:false,temporary:false,reason:'Evidence URL redirects too many times.'};
}
function submissionUrls(type,item={}){
  if(type==='project')return[['GitHub repository',item.repository_url],['Live project',item.project_url]].filter(([,v])=>text(v));
  if(type==='research')return[['DOI/publication',item.doi_url],['Paper',item.paper_url]].filter(([,v])=>text(v));
  return[];
}
async function probeSubmissionUrls(type,item,options={}){
  const results=[];
  for(const [label,url] of submissionUrls(type,item)){
    const result=await probeEvidenceUrl(url,options);
    results.push({label,url,...result});
  }
  return results;
}
module.exports={inspectEvidenceUrl,probeEvidenceUrl,probeSubmissionUrls,submissionUrls,unsafeHostname,isPrivateIpv4};
