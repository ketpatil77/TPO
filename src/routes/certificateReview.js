const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { enqueueCertificateAnalysis } = require('../services/certificateFraudDetection');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const router = express.Router();
router.use(authenticateAdmin);

function bucket() { return globalThis.cloudflareEnv?.CERTIFICATE_VAULT || null; }
const reviewSchema = z.object({ status: z.enum(['pending', 'verified', 'rejected']), note: z.string().trim().max(500).optional().default('') }).strict();

function reviewFields(item) {
    return {
        id: item.id, student_id: item.student_id, name: item.name, issuer: item.issuer, date: item.date, mode: item.mode,
        has_proof: Boolean(item.evidence_path), evidence_bytes: item.evidence_bytes || null, evidence_uploaded_at: item.evidence_uploaded_at || null,
        verification_status: item.verification_status || 'pending', verification_note: item.verification_note || '', verified_at: item.verified_at || null,
        review_status: item.review_status || 'pending_review', flagged_reasons: Array.isArray(item.flagged_reasons) ? item.flagged_reasons : [],
        ocr_extracted_name: item.ocr_extracted_name || null, name_match_score: item.name_match_score ?? null,
        tamper_score: item.tamper_score ?? null, phash: item.phash || null, duplicate_of_cert_id: item.duplicate_of_cert_id || null,
        duplicate_matches: Array.isArray(item.duplicate_matches) ? item.duplicate_matches : [], layout_anomaly_score: item.layout_anomaly_score ?? null,
        has_ela_diff: Boolean(item.ela_diff_path), fraud_processed_at: item.fraud_processed_at || null,
        fraud_processing_error: item.fraud_processing_error || null, fraud_analysis_version: item.fraud_analysis_version || null
    };
}

router.get('/student/:studentId', async (req, res) => {
    try {
        const rows = await db.select('certificates', { student_id: req.params.studentId });
        const pending=(rows||[]).filter(item=>item.evidence_path && !item.fraud_processed_at);
        await Promise.allSettled(pending.map(item=>enqueueCertificateAnalysis(item.id)));
        return res.json({ success: true, data: (rows || []).map(reviewFields) });
    }
    catch (error) { console.error('Certificate review list failed:', error.message); return res.status(500).json({ success:false,error:{code:'CERTIFICATE_REVIEW_LIST_FAILED',message:'Could not load certificate proofs.'} }); }
});

async function streamR2(path, res, fallbackType='image/jpeg') {
    const r2=bucket(); let bytes=null; let contentType=fallbackType;
    if(r2?.get){ const object=await r2.get(path); if(object){ bytes=await object.arrayBuffer(); contentType=object.httpMetadata?.contentType||fallbackType; } }
    if(!bytes && !db.isLocal()){ const client=db.supabaseClient?.(); if(client?.storage){ const {data,error}=await client.storage.from('certificate-evidence').download(path); if(!error && data){ bytes=await data.arrayBuffer(); contentType=data.type||fallbackType; } } }
    if(!bytes) return res.status(404).json({success:false,error:{code:'EVIDENCE_MISSING',message:'Certificate proof file is unavailable.'}});
    res.setHeader('Content-Type',contentType); res.setHeader('Content-Length',String(bytes.byteLength)); res.setHeader('Cache-Control','private, no-store, max-age=0'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Content-Disposition','inline'); return res.end(Buffer.from(bytes));
}
router.get('/:id/proof', async (req,res)=>{ try { const c=await db.selectOne('certificates',{id:req.params.id}); if(!c?.evidence_path)return res.status(404).json({success:false,error:{code:'NO_EVIDENCE',message:'No certificate proof uploaded.'}}); return await streamR2(c.evidence_path,res,c.evidence_mime||'image/jpeg'); } catch(error){console.error('Certificate proof review open failed:',error.message);return res.status(500).json({success:false,error:{code:'CERTIFICATE_PROOF_OPEN_FAILED',message:'Could not open certificate proof.'}});} });
router.get('/:id/ela-diff', async (req,res)=>{ try { const c=await db.selectOne('certificates',{id:req.params.id}); if(!c?.ela_diff_path)return res.status(404).json({success:false,error:{code:'NO_ELA_DIFF',message:'ELA diff is not available.'}}); return await streamR2(c.ela_diff_path,res,'image/png'); } catch(error){console.error('ELA diff open failed:',error.message);return res.status(500).json({success:false,error:{code:'ELA_DIFF_OPEN_FAILED',message:'Could not open ELA diff.'}});} });

router.get('/manual-audit/queue', async (_req,res)=>{ try { const audits=(await db.select('certificate_manual_audits',{status:'pending'}))||[]; const rows=[]; for(const audit of audits){ const cert=await db.selectOne('certificates',{id:audit.certificate_id}); if(cert) rows.push({...audit,certificate:reviewFields(cert)}); } return res.json({success:true,data:rows}); } catch(error){return res.status(500).json({success:false,error:{code:'MANUAL_AUDIT_LIST_FAILED',message:'Could not load manual audit queue.'}});} });

router.post('/:id/review', validate(reviewSchema), async (req, res) => {
    try {
        const certificate = await db.selectOne('certificates', { id: req.params.id });
        if (!certificate) return res.status(404).json({ success:false,error:{code:'NOT_FOUND',message:'Certificate not found.'} });
        if (!certificate.evidence_path && req.body.status === 'verified') return res.status(400).json({success:false,error:{code:'PROOF_REQUIRED',message:'A certificate cannot be verified until proof is uploaded.'}});
        if (req.body.status === 'verified' && !certificate.fraud_processed_at) return res.status(409).json({success:false,error:{code:'FRAUD_ANALYSIS_PENDING',message:'Fraud checks must finish before certificate approval.'}});
        const now=new Date().toISOString(); const reviewStatus=req.body.status==='verified'?'approved':req.body.status==='rejected'?'rejected':'pending_review';
        const updated=await db.update('certificates',{id:certificate.id},{verification_status:req.body.status,review_status:reviewStatus,verification_note:req.body.note||null,verified_at:req.body.status==='pending'?null:now,verified_by:req.body.status==='pending'?null:req.admin.adminId});
        if(req.body.status==='verified' && (certificate.flagged_reasons||[]).length){ const month=now.slice(0,7); const existing=await db.selectOne('certificate_manual_audits',{certificate_id:certificate.id,audit_month:month,reason:'automated_flag'}); if(!existing) await db.insert('certificate_manual_audits',{certificate_id:certificate.id,student_id:certificate.student_id,audit_month:month,reason:'automated_flag',status:'completed',created_at:now,completed_at:now,completed_by:req.admin.adminId,note:req.body.note||null}); }
        try { const adminStudentsRouter=require('./adminStudents'); await adminStudentsRouter.clearStudentCache?.(); } catch(_) {}
        await db.logAudit('certificate_review','certificates',certificate.id,{student_id:certificate.student_id,status:req.body.status,review_status:reviewStatus,note:req.body.note||'',admin_id:req.admin.adminId,flagged_reasons:certificate.flagged_reasons||[]});
        return res.json({success:true,data:updated,message:`Certificate ${req.body.status}.`});
    } catch(error){ console.error('Certificate review update failed:',error.message); return res.status(500).json({success:false,error:{code:'CERTIFICATE_REVIEW_FAILED',message:'Could not update certificate verification.'}}); }
});
module.exports = router;
