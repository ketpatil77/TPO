process.env.NODE_ENV='test';
process.env.SUPABASE_URL='';
process.env.SUPABASE_KEY='';
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret-at-least-thirty-two-characters';
process.env.DATA_FILE=require('path').join(require('os').tmpdir(),`tpo-cert-fraud-${process.pid}.json`);

const test=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const jwt=require('jsonwebtoken');
const app=require('../src/server');
const db=require('../src/config/database');
const fraud=require('../src/services/certificateFraudDetection');

function token(role,extra={}){return jwt.sign({role,sessionVersion:2,...extra},process.env.JWT_SECRET);}
function writeHeaders(bearer,csrf=`csrf-${Math.random()}`){return {Authorization:`Bearer ${bearer}`,Cookie:`csrfToken=${csrf}`,'X-CSRF-Token':csrf};}
function rgbaFixture({edited=false,anomaly=false}={}){
  const w=320,h=200,raw=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=anomaly?245:245+((x+y)%4);raw[i]=raw[i+1]=raw[i+2]=v;raw[i+3]=255;}
  const rows=anomaly?[20,27,100,188]:[55,80,105,130];
  for(const y of rows)for(let yy=y;yy<Math.min(h,y+3);yy++)for(let x=45;x<275;x++){const i=(yy*w+x)*4;raw[i]=raw[i+1]=raw[i+2]=35;}
  if(edited)for(let y=72;y<115;y++)for(let x=145;x<255;x++){const i=(y*w+x)*4,v=((x*13+y*7)%2)?20:230;raw[i]=v;raw[i+1]=40;raw[i+2]=40;raw[i+3]=255;}
  return {raw,w,h};
}
async function jpegFixture(options={}){const {raw,w,h}=rgbaFixture(options);const {PhotonImage}=await import('@cf-wasm/photon');const bmp=fraud.encodeBmp(raw,w,h);const image=PhotonImage.new_from_byteslice(bmp);try{return Buffer.from(image.get_bytes_jpeg(92));}finally{image.free();}}
function mockR2(){const objects=new Map();return {objects,async put(path,body,meta={}){objects.set(path,{body:Buffer.from(body),httpMetadata:meta.httpMetadata||{}});},async get(path){const x=objects.get(path);if(!x)return null;return {httpMetadata:x.httpMetadata,async arrayBuffer(){return x.body.buffer.slice(x.body.byteOffset,x.body.byteOffset+x.body.byteLength);}};},async delete(path){objects.delete(path);}};}
async function waitFor(fn,ms=2500){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,25));}throw new Error('Timed out waiting for async certificate analysis');}

test('OCR name cross-check tolerates OCR noise and flags a different roster name',()=>{
  const good=fraud.analyzeNameMatch('CERTIFICATE OF COMPLETION\nPresented to\nRAHUL SHARMA\nfor Java','Rahul Sharma');
  assert.ok(good.name_match_score>=fraud.NAME_MATCH_THRESHOLD);assert.equal(good.flagged,false);assert.match(good.ocr_extracted_name,/RAHUL SHARMA/);
  const noisy=fraud.analyzeNameMatch('AWARDED TO\nRAHUL SHARHA\nCOURSE','Rahul Sharma');assert.ok(noisy.name_match_score>=fraud.NAME_MATCH_THRESHOLD);
  const bad=fraud.analyzeNameMatch('PRESENTED TO\nVIKAS PATIL\nCOURSE','Rahul Sharma');assert.equal(bad.flagged,true);assert.ok(bad.name_match_score<fraud.NAME_MATCH_THRESHOLD);
});

test('ELA tamper detector keeps synthetic clean certificate low and raises edited sample',async()=>{
  const clean=await fraud.analyzeImage(await jpegFixture());const edited=await fraud.analyzeImage(await jpegFixture({edited:true}));
  assert.ok(clean.tamper_score<fraud.TAMPER_THRESHOLD,`clean score ${clean.tamper_score}`);
  assert.ok(edited.tamper_score>=fraud.TAMPER_THRESHOLD,`edited score ${edited.tamper_score}`);
  assert.equal(Buffer.from(edited.ela_diff).subarray(0,2).toString(),'BM');
});

test('perceptual hash catches slight re-use and ignores unrelated synthetic fake',()=>{
  const {raw,w,h}=rgbaFixture();const base=fraud.dctHash(raw,w,h);const close=new Uint8Array(raw);for(let y=10;y<14;y++)for(let x=10;x<14;x++){const i=(y*w+x)*4;close[i]=240;close[i+1]=240;close[i+2]=240;}
  const near=fraud.dctHash(close,w,h);const fake=rgbaFixture({edited:true,anomaly:true});const far=fraud.dctHash(fake.raw,fake.w,fake.h);
  assert.ok(fraud.hammingDistance(base,near)<=fraud.PHASH_HAMMING_THRESHOLD);assert.ok(fraud.hammingDistance(base,far)>fraud.PHASH_HAMMING_THRESHOLD);
});

test('layout anomaly heuristic treats regular baselines as soft-clear and irregular synthetic fake as anomalous',()=>{
  const clean=rgbaFixture();const fake=rgbaFixture({anomaly:true});const a=fraud.layoutAnomalyFromRaw(clean.raw,clean.w,clean.h);const b=fraud.layoutAnomalyFromRaw(fake.raw,fake.w,fake.h);
  assert.equal(a.flagged,false);assert.ok(b.layout_anomaly_score>=fraud.LAYOUT_THRESHOLD);assert.equal(b.flagged,true);
});

test('monthly audit selector is deterministic and stays within requested 10-15 percent band',()=>{
  const ids=Array.from({length:2000},(_,i)=>`cert-${i}`);const selected=ids.filter(id=>fraud.monthlyAuditSelected(id,'2026-09',.12)).length/ids.length;
  assert.ok(selected>=.10&&selected<=.15,`sample rate ${selected}`);assert.equal(fraud.monthlyAuditSelected('cert-42','2026-09',.12),fraud.monthlyAuditSelected('cert-42','2026-09',.12));
});

test('upload-to-analysis pipeline auto-clears clean proof and flags edited proof with ELA in R2',async()=>{
  const r2=mockR2();const oldEnv=globalThis.cloudflareEnv;globalThis.cloudflareEnv={CERTIFICATE_VAULT:r2,CERTIFICATE_FRAUD_QUEUE:{async send(){return {}}}};
  const studentId=`fraud-student-${Date.now()}`;await db.insert('students',{id:studentId,prn:`FR-${Date.now()}`,name:'Rahul Sharma',branch:'CT'});
  const originalOcr=fraud.runOcr;
  // Route service resolves the same cached module. Supply deterministic OCR by replacing Tesseract createWorker is not practical;
  // process the queued records explicitly with the recognizer after verifying non-blocking upload response.
  try{
    const cleanCert=await db.insert('certificates',{student_id:studentId,name:'Clean Certificate',issuer:'AIT',date:'2026-09-01',mode:'online',verification_status:'pending'});
    const cleanBytes=await jpegFixture();
    const upload=await request(app).post(`/api/student/certificate-evidence/${cleanCert.id}`).set(writeHeaders(token('student',{studentId}))).attach('evidence',cleanBytes,{filename:'clean.jpg',contentType:'image/jpeg'}).expect(202);
    assert.equal(upload.body.data.analysis_queue,'cloudflare_queue');
    await fraud.processCertificate(cleanCert.id,{recognizer:async()=> 'CERTIFICATE OF COMPLETION\nPRESENTED TO\nRAHUL SHARMA'});
    const clean=await db.selectOne('certificates',{id:cleanCert.id});assert.equal(clean.review_status,'auto_clear');assert.deepEqual(clean.flagged_reasons,[]);assert.ok(clean.phash);assert.ok(clean.ela_diff_path);assert.ok(r2.objects.has(clean.ela_diff_path));

    const editedCert=await db.insert('certificates',{student_id:studentId,name:'Edited Certificate',issuer:'AIT',date:'2026-09-02',mode:'online',verification_status:'pending'});
    await r2.put(`certificates/${studentId}/${editedCert.id}.jpg`,await jpegFixture({edited:true}),{httpMetadata:{contentType:'image/jpeg'}});
    await db.update('certificates',{id:editedCert.id},{evidence_path:`certificates/${studentId}/${editedCert.id}.jpg`,evidence_mime:'image/jpeg'});
    await fraud.processCertificate(editedCert.id,{recognizer:async()=> 'CERTIFICATE\nPRESENTED TO\nRAHUL SHARMA'});
    const edited=await db.selectOne('certificates',{id:editedCert.id});assert.equal(edited.review_status,'pending_review');assert.ok(edited.flagged_reasons.includes('possibly_edited'));assert.ok(edited.tamper_score>=fraud.TAMPER_THRESHOLD);assert.ok(r2.objects.has(edited.ela_diff_path));
    const admin=await request(app).get(`/api/admin/certificates/student/${studentId}`).set(writeHeaders(token('admin',{adminId:'fraud-admin'}))).expect(200);
    const listed=admin.body.data.find(x=>x.id===editedCert.id);assert.ok(listed.flagged_reasons.includes('possibly_edited'));assert.equal(listed.has_ela_diff,true);
  } finally {globalThis.cloudflareEnv=oldEnv;}
});


test('legacy evidence falls back to Supabase Storage when R2 object is absent', async()=>{
  const oldEnv=globalThis.cloudflareEnv; const oldIsLocal=db.isLocal; const oldClient=db.supabaseClient;
  const legacy=Buffer.from('legacy-certificate-bytes');
  globalThis.cloudflareEnv={CERTIFICATE_VAULT:{async get(){return null;}}};
  db.isLocal=()=>false;
  db.supabaseClient=()=>({storage:{from(bucket){assert.equal(bucket,'certificate-evidence');return {async download(path){assert.equal(path,'certificates/student/legacy.jpg');return {data:new Blob([legacy],{type:'image/jpeg'}),error:null};}};}}});
  try { const bytes=await fraud.readEvidence('certificates/student/legacy.jpg'); assert.deepEqual(Buffer.from(bytes),legacy); }
  finally { globalThis.cloudflareEnv=oldEnv; db.isLocal=oldIsLocal; db.supabaseClient=oldClient; }
});

test('backlog enqueue batches certificates that have proof but no fraud result', async()=>{
  const oldEnv=globalThis.cloudflareEnv; const sent=[];
  globalThis.cloudflareEnv={CERTIFICATE_FRAUD_QUEUE:{async sendBatch(messages){sent.push(...messages);}}};
  const studentId=`backfill-student-${Date.now()}`;
  const a=await db.insert('certificates',{student_id:studentId,name:'Backfill A',evidence_path:`certificates/${studentId}/a.jpg`,fraud_processed_at:null});
  const b=await db.insert('certificates',{student_id:studentId,name:'Backfill B',evidence_path:`certificates/${studentId}/b.jpg`,fraud_processed_at:null});
  try { const result=await fraud.enqueuePendingCertificates(100); const ids=sent.map(x=>x.body.certificateId); assert.ok(result.queued>=2); assert.ok(ids.includes(a.id)); assert.ok(ids.includes(b.id)); }
  finally { globalThis.cloudflareEnv=oldEnv; }
});

test('opening TPO certificate review queues unprocessed legacy proofs immediately', async()=>{
  const oldEnv=globalThis.cloudflareEnv; const queued=[];
  globalThis.cloudflareEnv={CERTIFICATE_FRAUD_QUEUE:{async send(message){queued.push(message);}}};
  const studentId=`review-backfill-${Date.now()}`;
  const cert=await db.insert('certificates',{student_id:studentId,name:'Legacy Review',evidence_path:`certificates/${studentId}/legacy.jpg`,verification_status:'pending',fraud_processed_at:null});
  try { await request(app).get(`/api/admin/certificates/student/${studentId}`).set(writeHeaders(token('admin',{adminId:'fraud-admin'}))).expect(200); assert.ok(queued.some(x=>x.certificateId===cert.id)); }
  finally { globalThis.cloudflareEnv=oldEnv; }
});


test('direct recovery processes pending certificate without queue dependency', async()=>{
  for(const row of await db.select('certificates')){ if(row.evidence_path && !row.fraud_processed_at) await db.update('certificates',{id:row.id},{fraud_processed_at:new Date().toISOString()}); }
  const student=await db.insert('students',{prn:'RECOVERY-1',name:'Recovery Student',dob:'2000-01-01',branch:'CT',class:'Final Year',year:'Final Year'});
  const cert=await db.insert('certificates',{student_id:student.id,name:'Recovery Test',issuer:'AIT',date:'2026-09-06',evidence_path:'certificates/recovery/test.jpg',evidence_mime:'image/jpeg',evidence_bytes:1,evidence_uploaded_at:new Date().toISOString(),verification_status:'pending',review_status:'pending_review'});
  const oldEnv=globalThis.cloudflareEnv; const jpeg=await jpegFixture({edited:false});
  globalThis.cloudflareEnv={CERTIFICATE_VAULT:{async get(){return {arrayBuffer:async()=>jpeg,httpMetadata:{contentType:'image/jpeg'}};},async put(){}}};
  try { const result=await fraud.processPendingCertificatesDirect(1,{recognizer:async()=> 'RECOVERY STUDENT'}); assert.equal(result.selected,1); assert.equal(result.processed,1); const updated=await db.selectOne('certificates',{id:cert.id}); assert.ok(updated.fraud_processed_at); }
  finally { globalThis.cloudflareEnv=oldEnv; }
});

test('recovery picks legacy runtime failures and preserves staff decisions', async()=>{
  const oldEnv=globalThis.cloudflareEnv;
  const student=await db.insert('students',{name:'Rahul Sharma'});
  const cert=await db.insert('certificates',{student_id:student.id,name:'Approved certificate',evidence_path:'approved.jpg',verification_status:'verified',review_status:'approved',verified_by:'staff-id',verification_note:'Checked with issuer',fraud_processing_error:'Worker is not defined',fraud_processed_at:'2026-09-06T10:00:00Z'});
  const r2=mockR2(); await r2.put('approved.jpg',await jpegFixture());
  const queued=[];
  globalThis.cloudflareEnv={CERTIFICATE_VAULT:r2,CERTIFICATE_FRAUD_QUEUE:{async sendBatch(rows){queued.push(...rows);}}};
  try {
    await fraud.enqueuePendingCertificates(100);
    assert.ok(queued.some(row=>row.body.certificateId===cert.id));
    await fraud.processCertificate(cert.id,{recognizer:async()=> 'PRESENTED TO\nRAHUL SHARMA'});
    const saved=await db.selectOne('certificates',{id:cert.id});
    assert.equal(saved.fraud_processing_error,null);
    assert.equal(saved.fraud_analysis_version,'cert-fraud-v2');
    assert.equal(saved.verification_status,'verified');
    assert.equal(saved.review_status,'approved');
    assert.equal(saved.verification_note,'Checked with issuer');
    assert.equal(saved.verified_by,'staff-id');
    await fraud.failAnalysis(cert.id,new Error('temporary failure'));
    assert.equal((await db.selectOne('certificates',{id:cert.id})).review_status,'approved');
  } finally {globalThis.cloudflareEnv=oldEnv;}
});

test('shared provider template alone does not flag a duplicate', async()=>{
  const oldEnv=globalThis.cloudflareEnv; const r2=mockR2();
  const {PhotonImage}=await import('@cf-wasm/photon');
  const source=PhotonImage.new_from_byteslice(await jpegFixture());
  let bytes; try {bytes=Buffer.from(source.get_bytes_jpeg(88));} finally {source.free();}
  const image=await fraud.analyzeImage(bytes);
  const student=await db.insert('students',{name:'Rahul Sharma'});
  await db.insert('certificates',{student_id:'another-student',evidence_path:'different.jpg',phash:image.phash,ocr_extracted_name:'Priya Patel'});
  const cert=await db.insert('certificates',{student_id:student.id,evidence_path:'same-template.jpg'});
  await r2.put('same-template.jpg',bytes); globalThis.cloudflareEnv={CERTIFICATE_VAULT:r2};
  try {
    const result=await fraud.processCertificate(cert.id,{recognizer:async()=> 'PRESENTED TO\nRAHUL SHARMA'});
    assert.ok(!result.flagged_reasons.includes('possible_duplicate'));
  } finally {globalThis.cloudflareEnv=oldEnv;}
});
