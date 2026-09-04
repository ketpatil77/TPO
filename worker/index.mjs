import { httpServerHandler } from 'cloudflare:node';
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
    if (!db.isLocal()) {
        db.supabaseClient().from('roster').select('id').limit(1).then(() => {
            console.log('Supabase successfully warmed up in background on cold boot.');
        }).catch(error => console.error('Supabase background warmup failed:', error));
    }
    app.listen(3000);
    expressHandler = httpServerHandler({ port: 3000 });
    return expressHandler;
}

function patchDashboardHtml(html, assetPath) {
    let patched = html.replace(/\/js\/portal-responsive\.js\?v=[^"']+/g, '/js/portal-responsive.js?v=20260903-global-integrity1');
    patched = patched.replace('</head>', '<script src="/js/request-budget.js?v=20260904-free-tier2"></script></head>');
    if (assetPath === '/admin-dashboard.html') {
        patched = patched.replace(/\/js\/admin-dashboard\.js\?v=[^"']+/g, '/js/admin-dashboard.js?v=20260902-student-activity1');
        patched = patched.replace('</head>', '<link rel="stylesheet" href="/css/admin-alignment-20260814.css"><link rel="stylesheet" href="/css/student-activity-feed.css?v=20260902-live1"><script src="/js/student-activity-feed.js?v=20260902-live1" defer></script></head>');
    }
    if (assetPath === '/observer-dashboard.html') {
        patched = patched.replace(/\/js\/observer-dashboard\.js\?v=[^"']+/g, '/js/observer-dashboard.js?v=20260819-ssc-hsc');
    }
    if (assetPath === '/dashboard.html') {
        patched = patched.replace('</head>', '<link rel="stylesheet" href="/css/profile-requirements-20260814.css"><link rel="stylesheet" href="/css/student-projects-pro.css?v=20260904-projects2"><link rel="stylesheet" href="/css/student-feature-status.css?v=20260904-feature1"><script src="/js/notification-settings-recovery.js?v=20260904-settings1" defer></script><script src="/js/student-projects-pro.js?v=20260904-projects2" defer></script><script src="/js/student-feature-status.js?v=20260904-feature1" defer></script></head>');
    }
    return patched;
}

export default {
    async fetch(request, env, context) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/')) {
            const handler = await ensureExpress(env);
            return handler.fetch(request, env, context);
        }

        const assetPath = pageMap.get(url.pathname);
        if (assetPath) {
            url.pathname = assetPath;
            const response = await env.ASSETS.fetch(new Request(url, request));
            if (['/dashboard.html', '/admin-dashboard.html', '/observer-dashboard.html'].includes(assetPath)) {
                const patched = patchDashboardHtml(await response.text(), assetPath);
                return noStore(new Response(patched, { status: response.status, headers: response.headers }), env);
            }
            return noStore(response, env);
        }

        const response = await env.ASSETS.fetch(request);
        return /\.(?:html|js|css)$/i.test(url.pathname) ? noStore(response, env) : response;
    },

    async scheduled(event, env, context) {
        try {
            process.env.SUPABASE_URL = env.SUPABASE_URL;
            process.env.SUPABASE_KEY = env.SUPABASE_KEY;
            process.env.JWT_SECRET = env.JWT_SECRET;
            globalThis.cloudflareEnv = env;
            Object.assign(process.env, env);
            const { default: db } = await import('../src/config/database.js');
            db.init();
            if (!db.isLocal()) {
                const { error } = await db.supabaseClient().from('roster').select('id').limit(1);
                if (error) throw error;
                console.log('Supabase keep-alive ping successful.');
            }
            if (event.cron === (env.PROOF_EXPIRY_CRON || '0 * * * *')) {
                const { default: proofExpiry } = await import('../src/services/proofExpiry.js');
                const result = await proofExpiry.runProofExpiryCleanup();
                console.log('Proof expiry cleanup complete:', JSON.stringify(result));
            }
            if (event.cron === (env.PUSH_REMINDER_CRON || '0 4 */3 * *')) {
                const { default: pushService } = await import('../src/services/incompleteProfilePush.js');
                const result = await pushService.runIncompleteProfilePushJob({ env });
                console.log('Incomplete-profile push job complete:', JSON.stringify(result));
            }
        } catch (error) {
            console.error('Scheduled Worker job failed:', error);
            throw error;
        }
    }
};

function noStore(response, env) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    headers.set('Content-Security-Policy', contentSecurityPolicy(env));
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
