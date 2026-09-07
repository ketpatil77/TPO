const fs = require('fs');
const { execFileSync } = require('child_process');
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

let worker = `import { httpServerHandler } from 'cloudflare:node';\nimport { contentSecurityPolicy } from './security-headers.mjs';\n\nconst pageMap = new Map([\n    ['/', '/index.html'], ['/login', '/index.html'], ['/dashboard', '/dashboard.html'],\n    ['/admin', '/index.html'], ['/admin/login', '/index.html'], ['/admin/dashboard', '/admin-dashboard.html'],\n    ['/observer', '/index.html'], ['/observer/login', '/index.html'], ['/observer/dashboard', '/observer-dashboard.html']\n]);\n\nlet expressHandler;\n\nasync function ensureExpress(env) {\n    if (expressHandler) return expressHandler;\n    process.env.SUPABASE_URL = env.SUPABASE_URL;\n    process.env.SUPABASE_KEY = env.SUPABASE_KEY;\n    process.env.JWT_SECRET = env.JWT_SECRET;\n    globalThis.cloudflareEnv = env;\n    Object.assign(process.env, env);\n    const { default: app } = await import('../src/server.js');\n    const { default: db } = await import('../src/config/database.js');\n    db.init();\n    if (!db.isLocal()) db.supabaseClient().from('roster').select('id').limit(1).then(() => console.log('Supabase successfully warmed up in background on cold boot.')).catch(error => console.error('Supabase background warmup failed:', error));\n    app.listen(3000);\n    expressHandler = httpServerHandler({ port: 3000 });\n    return expressHandler;\n}\n\nfunction patchLoginHtml(html) {\n    let patched = html.replace(/\\/js\\/portal\\.js\\?v=[^"']+/g, '/js/portal.js?v=20260904-login-resilience1');\n    patched = patched.replace('</head>', '<script src="/js/student-login-resilience.js?v=20260904-login1" defer></script></head>');\n    return patched;\n}\n\nfunction patchDashboardHtml(html, assetPath) {\n    let patched = html.replace(/\\/js\\/portal-responsive\\.js\\?v=[^"']+/g, '/js/portal-responsive.js?v=20260904-interaction1');\n\n    if (assetPath !== '/dashboard.html') {\n        patched = patched.replace('</head>', '<script src="/js/request-budget.js?v=20260904-free-tier2"></script></head>');\n    }\n\n    if (assetPath === '/admin-dashboard.html') {\n        patched = patched.replace(/\\/js\\/admin-dashboard\\.js\\?v=[^"']+/g, '/js/admin-dashboard.js?v=20260902-student-activity1');\n        patched = patched.replace('</head>', '<link rel="stylesheet" href="/css/admin-alignment-20260814.css"><link rel="stylesheet" href="/css/student-activity-feed.css?v=20260902-live1"><script src="/js/student-activity-feed.js?v=20260902-live1" defer></script></head>');\n    }\n    if (assetPath === '/observer-dashboard.html') patched = patched.replace(/\\/js\\/observer-dashboard\\.js\\?v=[^"']+/g, '/js/observer-dashboard.js?v=20260819-ssc-hsc');\n    if (assetPath === '/dashboard.html') {\n        patched = patched.replace('</head>', '<link rel="stylesheet" href="/css/profile-requirements-20260814.css"><link rel="stylesheet" href="/css/student-projects-pro.css?v=20260904-projects2"><link rel="stylesheet" href="/css/student-feature-status.css?v=20260904-feature1"><link rel="stylesheet" href="/css/free-learning.css?v=20260906-catalog2"><link rel="stylesheet" href="/css/free-learning-v2.css?v=20260906-catalog2"><script src="/js/student-dashboard-interaction-hotfix.js?v=20260904-unlock6"></script><script src="/js/student-projects-pro.js?v=20260904-projects2" defer></script><script src="/js/student-feature-status.js?v=20260904-feature1" defer></script><script src="/js/free-learning-v2.js?v=20260906-catalog2" defer></script></head>');\n    }\n    return patched;\n}\n\nexport default {\n    async fetch(request, env, context) {\n        const url = new URL(request.url);\n        if (url.pathname.startsWith('/api/')) return (await ensureExpress(env)).fetch(request, env, context);\n        const assetPath = pageMap.get(url.pathname);\n        if (assetPath) {\n            url.pathname = assetPath;\n            const response = await env.ASSETS.fetch(new Request(url, request));\n            if (assetPath === '/index.html') return noStore(new Response(patchLoginHtml(await response.text()), { status: response.status, headers: response.headers }), env);\n            if (['/dashboard.html', '/admin-dashboard.html', '/observer-dashboard.html'].includes(assetPath)) return noStore(new Response(patchDashboardHtml(await response.text(), assetPath), { status: response.status, headers: response.headers }), env);\n            return noStore(response, env);\n        }\n        const response = await env.ASSETS.fetch(request);\n        return /\\.(?:html|js|css)$/i.test(url.pathname) ? noStore(response, env) : response;\n    },\n    async scheduled(event, env, context) {\n        try {\n            process.env.SUPABASE_URL = env.SUPABASE_URL; process.env.SUPABASE_KEY = env.SUPABASE_KEY; process.env.JWT_SECRET = env.JWT_SECRET; globalThis.cloudflareEnv = env; Object.assign(process.env, env);\n            const { default: db } = await import('../src/config/database.js'); db.init();\n            if (!db.isLocal()) { const { error } = await db.supabaseClient().from('roster').select('id').limit(1); if (error) throw error; console.log('Supabase keep-alive ping successful.'); }\n            if (event.cron === (env.PROOF_EXPIRY_CRON || '0 * * * *')) { const { default: proofExpiry } = await import('../src/services/proofExpiry.js'); console.log('Proof expiry cleanup complete:', JSON.stringify(await proofExpiry.runProofExpiryCleanup())); }\n            if (event.cron === (env.PUSH_REMINDER_CRON || '0 4 */3 * *')) { const { default: pushService } = await import('../src/services/incompleteProfilePush.js'); console.log('Incomplete-profile push job complete:', JSON.stringify(await pushService.runIncompleteProfilePushJob({ env }))); }\n        } catch (error) { console.error('Scheduled Worker job failed:', error); throw error; }\n    }\n};\n\nfunction noStore(response, env) {\n    const headers = new Headers(response.headers);\n    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0'); headers.set('Pragma', 'no-cache'); headers.set('Expires', '0'); headers.set('Content-Security-Policy', contentSecurityPolicy(env)); headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('X-Frame-Options', 'DENY'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');\n    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });\n}\n`;
write('worker/index.mjs', worker);

let wrangler = read('wrangler.jsonc');
wrangler = wrangler.replace(/\n\s*"ai": \{ "binding": "AI" \},?/, '');
wrangler = wrangler.replace(/\n\s*"MANUAL_AUDIT_CRON": "15 0 \* \* \*",?/, '');
wrangler = wrangler.replace(/\n\s*"FRAUD_RECOVERY_CRON": "\*\/10 \* \* \* \*",?/, '');
wrangler = wrangler.replace(/\n\s*"queues": \{\n\s*"producers": \[[\s\S]*?\n\s*\],\n\s*"consumers": \[[\s\S]*?\n\s*\]\n\s*\},/, '');
wrangler = wrangler.replace(/("triggers": \{\n\s*"crons": \[)[^\]]*(\])/, '$1"0 * * * *", "0 4 */3 * *"$2');
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

for (const f of ['public/admin-dashboard.html','public/dashboard.html','public/observer-dashboard.html']) {
  if (!fs.existsSync(path.join(root, f))) continue;
  const s = read(f).replace(/^.*tpo-certificate-review[^\n]*\n?/gmi, '');
  write(f, s);
}

execFileSync(process.execPath, ['-e', `for (const f of ['worker/index.mjs','src/server.js','src/routes/certificateEvidence.js']) { require('child_process').execFileSync(process.execPath,['--check',f],{stdio:'inherit'}); }`], { stdio:'inherit' });
execFileSync('npx', ['wrangler','types'], { stdio:'inherit' });

remove('.remove-certificate-fraud');
remove('.remove-certificate-fraud.cjs');
remove('.github/workflows/remove-certificate-fraud.yml');
remove('.tmp');
