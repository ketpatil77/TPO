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

let database = read('src/config/database.js');
database = database.replace(/, certificate_manual_audits: \[\]/, '');
database = database.replace(/,'certificate_manual_audits'/g, '');
write('src/config/database.js', database);

let portalResponsive = read('public/js/portal-responsive.js');
portalResponsive = portalResponsive.replace(/^\s*loadStylesheet\('\/css\/tpo-certificate-review\.css[^\n]*\n?/gmi, '');
portalResponsive = portalResponsive.replace(/^\s*loadScript\('\/js\/tpo-certificate-review\.js[^\n]*\n?/gmi, '');
write('public/js/portal-responsive.js', portalResponsive);

// Remove only the certificate-specific verification tab from the TPO dashboard.
let admin = read('public/admin-dashboard.html');
admin = admin.replace(/\n?\s*<[^>]*id=["']certificate[^>]*verification[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
admin = admin.replace(/^.*tpo-certificate-review[^\n]*\n?/gmi, '');
write('public/admin-dashboard.html', admin);

let worker = `import { httpServerHandler } from 'cloudflare:node';
import { contentSecurityPolicy } from './security-headers.mjs';

const pageMap = new Map([
    ['/', '/index.html'], ['/login', '/index.html'], ['/dashboard', '/dashboard.html'],
    ['/admin', '/index.html'], ['/admin/login', '/index.html'], ['/admin/dashboard', '/admin-dashboard.html'],
    ['/observer', '/index.html'], ['/observer/login', '/index.html'], ['/observer/dashboard', '/observer-dashboard.html']
]);

let expressHandler;

async function ensureExpress(env) {
    if (expressHandler) return expressHandler;
    process.env.SUPABASE_URL = env.SUPABASE_URL;
    process.env.SUPABASE_KEY = env.SUPABASE_KEY;
    process.env.JWT_SECRET = env.JWT_SECRET;
    globalThis.cloudflareEnv = env;
    Object.assign(process.env, env);
    const { default: app } = await import('../src/server.js');
    const { default: db } = await import('../src/config/database.js');
    db.init();
    if (!db.isLocal()) db.supabaseClient().from('roster').select('id').limit(1).then(() => console.log('Supabase successfully warmed up in background on cold boot.')).catch(error => console.error('Supabase background warmup failed:', error));
    app.listen(3000);
    expressHandler = httpServerHandler({ port: 3000 });
    return expressHandler;
}

function patchLoginHtml(html) { return html.replace(/\\/js\\/portal\\.js\\?v=[^"']+/g, '/js/portal.js?v=20260904-login-resilience1'); }
function patchDashboardHtml(html, assetPath) {
    let patched = html.replace(/\\/js\\/portal-responsive\\.js\\?v=[^"']+/g, '/js/portal-responsive.js?v=20260904-interaction1');
    if (assetPath !== '/dashboard.html') patched = patched.replace('</head>', '<script src="/js/request-budget.js?v=20260904-free-tier2"></script></head>');
    if (assetPath === '/admin-dashboard.html') {
        patched = patched.replace(/\\/js\\/admin-dashboard\\.js\\?v=[^"']+/g, '/js/admin-dashboard.js?v=20260902-student-activity1');
        patched = patched.replace('</head>', '<link rel="stylesheet" href="/css/admin-alignment-20260814.css"><link rel="stylesheet" href="/css/student-activity-feed.css?v=20260902-live1"><script src="/js/student-activity-feed.js?v=20260902-live1" defer></script></head>');
    }
    if (assetPath === '/observer-dashboard.html') patched = patched.replace(/\\/js\\/observer-dashboard\\.js\\?v=[^"']+/g, '/js/observer-dashboard.js?v=20260819-ssc-hsc');
    if (assetPath === '/dashboard.html') patched = patched.replace('</head>', '<link rel="stylesheet" href="/css/profile-requirements-20260814.css"><link rel="stylesheet" href="/css/student-projects-pro.css?v=20260904-projects2"><link rel="stylesheet" href="/css/student-feature-status.css?v=20260904-feature1"><link rel="stylesheet" href="/css/free-learning.css?v=20260906-catalog2"><link rel="stylesheet" href="/css/free-learning-v2.css?v=20260906-catalog2"><script src="/js/student-dashboard-interaction-hotfix.js?v=20260904-unlock6"></script><script src="/js/student-projects-pro.js?v=20260904-projects2" defer></script><script src="/js/student-feature-status.js?v=20260904-feature1" defer></script><script src="/js/free-learning-v2.js?v=20260906-catalog2" defer></script></head>');
    return patched;
}

export default {
    async fetch(request, env, context) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/')) return (await ensureExpress(env)).fetch(request, env, context);
        const assetPath = pageMap.get(url.pathname);
        if (assetPath) {
            url.pathname = assetPath;
            const response = await env.ASSETS.fetch(new Request(url, request));
            if (assetPath === '/index.html') return noStore(new Response(patchLoginHtml(await response.text()), { status: response.status, headers: response.headers }), env);
            if (['/dashboard.html', '/admin-dashboard.html', '/observer-dashboard.html'].includes(assetPath)) return noStore(new Response(patchDashboardHtml(await response.text(), assetPath), { status: response.status, headers: response.headers }), env);
            return noStore(response, env);
        }
        const response = await env.ASSETS.fetch(request);
        return /\\.(?:html|js|css)$/i.test(url.pathname) ? noStore(response, env) : response;
    },
    async scheduled(event, env, context) {
        try {
            process.env.SUPABASE_URL = env.SUPABASE_URL; process.env.SUPABASE_KEY = env.SUPABASE_KEY; process.env.JWT_SECRET = env.JWT_SECRET; globalThis.cloudflareEnv = env; Object.assign(process.env, env);
            const { default: db } = await import('../src/config/database.js'); db.init();
            if (!db.isLocal()) { const { error } = await db.supabaseClient().from('roster').select('id').limit(1); if (error) throw error; console.log('Supabase keep-alive ping successful.'); }
            if (event.cron === (env.PROOF_EXPIRY_CRON || '0 * * * *')) { const { default: proofExpiry } = await import('../src/services/proofExpiry.js'); console.log('Proof expiry cleanup complete:', JSON.stringify(await proofExpiry.runProofExpiryCleanup())); }
            if (event.cron === (env.PUSH_REMINDER_CRON || '0 4 */3 * *')) { const { default: pushService } = await import('../src/services/incompleteProfilePush.js'); console.log('Incomplete-profile push job complete:', JSON.stringify(await pushService.runIncompleteProfilePushJob({ env }))); }
        } catch (error) { console.error('Scheduled Worker job failed:', error); throw error; }
    }
};

function noStore(response, env) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0'); headers.set('Pragma', 'no-cache'); headers.set('Expires', '0'); headers.set('Content-Security-Policy', contentSecurityPolicy(env)); headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('X-Frame-Options', 'DENY'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=());
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
`;
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

write('supabase/migrations/20260907110000_remove_certificate_fraud_detection.sql', `create or replace function public.reset_profile_evidence_verification()\nreturns trigger language plpgsql as $$fn$$\nbegin\n  if (to_jsonb(new) - array['verification_status','verified_by','verified_role','verified_at','verification_note'])\n     is distinct from\n     (to_jsonb(old) - array['verification_status','verified_by','verified_role','verified_at','verification_note']) then\n    new.verification_status := 'pending'; new.verified_by := null; new.verified_role := null; new.verified_at := null; new.verification_note := null;\n  end if;\n  return new;\nend\n$$fn$$;\n\ndrop index if exists public.certificates_phash_idx;\ndrop index if exists public.certificates_review_status_idx;\ndrop index if exists public.certificate_manual_audits_queue_idx;\ndrop table if exists public.certificate_manual_audits;\nalter table public.certificates\n  drop column if exists ocr_extracted_name, drop column if exists name_match_score, drop column if exists tamper_score,\n  drop column if exists phash, drop column if exists duplicate_of_cert_id, drop column if exists duplicate_matches,\n  drop column if exists layout_anomaly_score, drop column if exists review_status, drop column if exists flagged_reasons,\n  drop column if exists ela_diff_path, drop column if exists fraud_processed_at, drop column if exists fraud_processing_error,\n  drop column if exists fraud_analysis_version;\n\ndrop type if exists public.certificate_review_status;\n`);

remove('.remove-certificate-fraud');
remove('.remove-certificate-fraud.cjs');
remove('.github/workflows/remove-certificate-fraud.yml');
remove('.tmp');
