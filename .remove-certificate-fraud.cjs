const fs = require('fs');
const path = require('path');
const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);
const remove = p => { const f = path.join(root, p); if (fs.existsSync(f)) fs.rmSync(f); };

let server = read('src/server.js');
server = server.replace("const certificateReviewRoutes = require('./routes/certificateReview');\n", '');
server = server.replace("app.use('/api/admin/certificates', certificateReviewRoutes);\n", '');
write('src/server.js', server);

let evidence = read('src/routes/certificateEvidence.js');
evidence = evidence.replace("const { enqueueCertificateAnalysis } = require('../services/certificateFraudDetection');\n", '');
evidence = evidence.replace(/\n\s*review_status: 'pending_review',\n\s*flagged_reasons: \[\],\n\s*fraud_processed_at: null,\n\s*fraud_processing_error: null,\n\s*duplicate_of_cert_id: null,\n\s*duplicate_matches: \[\],\n\s*ocr_extracted_name: null,\n\s*name_match_score: null,\n\s*tamper_score: null,\n\s*phash: null,\n\s*layout_anomaly_score: null,\n\s*ela_diff_path: null/g, '');
evidence = evidence.replace(/\n\s*const analysis_queue = await enqueueCertificateAnalysis\(certificate\.id\);/, '');
evidence = evidence.replace(/message: certificate\.evidence_path \? 'Certificate proof replaced and queued for fraud checks\.' : 'Certificate proof uploaded and queued for fraud checks\.'/g, "message: certificate.evidence_path ? 'Certificate proof replaced.' : 'Certificate proof uploaded.'");
evidence = evidence.replace(/, analysis_queue \}\}/g, ' }}');
write('src/routes/certificateEvidence.js', evidence);

let worker = read('worker/index.mjs');
worker = worker.replace(/,\n\s*async queue\(batch, env\) \{[\s\S]*?\n\s*\},\n\s*async scheduled/, ',\n    async scheduled');
worker = worker.replace(/\s*const \{ default: fraud \} = await import\('\.\.\/src\/services\/certificateFraudDetection\.js'\);\s*console\.log\('Certificate fraud backlog enqueue complete:', JSON\.stringify\(await fraud\.enqueuePendingCertificates\(100\)\)\);/g, '');
worker = worker.replace(/\s*if \(event\.cron === \(env\.FRAUD_RECOVERY_CRON \|\| '\*\/10 \* \* \* \*'\)\) \{[\s\S]*?\n\s*\}/, '');
worker = worker.replace(/\s*if \(event\.cron === \(env\.MANUAL_AUDIT_CRON \|\| '15 0 \* \* \*'\)\) \{[\s\S]*?\n\s*\}/, '');
write('worker/index.mjs', worker);

let wrangler = read('wrangler.jsonc');
wrangler = wrangler.replace(/\n\s*"ai": \{ "binding": "AI" \ },?/, '');
wrangler = wrangler.replace(/\n\s*"MANUAL_AUDIT_CRON": "15 0 \* \* \*",?/, '');
wrangler = wrangler.replace(/\n\s*"FRAUD_RECOVERY_CRON": "\*\/10 \* \* \* \*",?/, '');
wrangler = wrangler.replace(/\n\s*"queues": \{\n\s*"producers": \[[\s\S]*?\n\s*\],\n\s*"consumers": \[[\s\S]*?\n\s*\]\n\s*\},/, '');
wrangler = wrangler.replace(/"triggers": \{\n\s*"crons": \[(.*?)\]\n\s*\}/s, (m, inner) => {
  const entries = inner.split(',').map(v => v.trim()).filter(v => !/15 0 \* \* \*/.test(v) && !/\*\/10 \* \* \* \*/.test(v));
  return `"triggers": {\n    "crons": [${entries.join(', ')}]\n  }`;
});
write('wrangler.jsonc', wrangler);

let pkg = JSON.parse(read('package.json'));
delete pkg.dependencies['@cf-wasm/photon'];
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

for (const f of [
  'src/services/certificateFraudDetection.js',
  'src/routes/certificateReview.js',
  'public/js/tpo-certificate-review.js',
  'public/css/tpo-certificate-review.css',
  'test/certificate-fraud-detection.test.js',
  'test/certificate-fraud-ui.test.js',
  'test/certificate-ocr-runtime.test.js',
  'supabase/migrations/20260906094500_add_certificate_fraud_detection.sql',
  'supabase/migrations/20260907045611_preserve_certificate_reviews_during_analysis.sql'
]) remove(f);

write('supabase/migrations/20260907110000_remove_certificate_fraud_detection.sql', `create or replace function public.reset_profile_evidence_verification()\nreturns trigger language plpgsql as $$fn$$\nbegin\n  if (to_jsonb(new) - array['verification_status','verified_by','verified_role','verified_at','verification_note'])\n     is distinct from\n     (to_jsonb(old) - array['verification_status','verified_by','verified_role','verified_at','verification_note']) then\n    new.verification_status := 'pending';\n    new.verified_by := null;\n    new.verified_role := null;\n    new.verified_at := null;\n    new.verification_note := null;\n  end if;\n  return new;\nend\n$$fn$$;\n\ndrop index if exists public.certificates_phash_idx;\ndrop index if exists public.certificates_review_status_idx;\ndrop index if exists public.certificate_manual_audits_queue_idx;\ndrop table if exists public.certificate_manual_audits;\nalter table public.certificates\n  drop column if exists ocr_extracted_name,\n  drop column if exists name_match_score,\n  drop column if exists tamper_score,\n  drop column if exists phash,\n  drop column if exists duplicate_of_cert_id,\n  drop column if exists duplicate_matches,\n  drop column if exists layout_anomaly_score,\n  drop column if exists review_status,\n  drop column if exists flagged_reasons,\n  drop column if exists ela_diff_path,\n  drop column if exists fraud_processed_at,\n  drop column if exists fraud_processing_error,\n  drop column if exists fraud_analysis_version;\n\ndrop type if exists public.certificate_review_status;\n`);

for (const candidate of fs.readdirSync(path.join(root, 'public'))) {
  // no-op: only concrete references are removed below
}
function stripFraudAssetRefs(file) {
  let s = read(file);
  s = s.replace(/^.*tpo-certificate-review[^\n]*\n?/gmi, '');
  s = s.replace(/^.*student-engagement[^\n]*\n?/gmi, line => file.includes('admin-dashboard') || file.includes('admin') ? (line.includes('student-engagement') ? '' : line) : line);
  write(file, s);
}
for (const f of ['public/admin-dashboard.html','public/dashboard.html','public/observer-dashboard.html']) stripFraudAssetRefs(f);

// Remove generated fraud-only type bindings by regenerating from the cleaned Wrangler config.
try { require('child_process').execFileSync('npx', ['wrangler','types'], { stdio:'inherit' }); } catch (e) { console.error('wrangler types generation failed:', e.message); process.exitCode=1; }

remove('.remove-certificate-fraud');
remove('.remove-certificate-fraud.cjs');
remove('.github/workflows/remove-certificate-fraud.yml');
