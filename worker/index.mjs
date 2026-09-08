import { httpServerHandler } from 'cloudflare:node';
import { contentSecurityPolicy } from './security-headers.mjs';

const pageMap = new Map([
    ['/','/index.html'], ['/login','/index.html'], ['/dashboard','/dashboard.html'],
    ['/admin','/index.html'], ['/admin/login','/index.html'], ['/admin/dashboard','/admin-dashboard.html'],
    ['/observer','/index.html'], ['/observer/login','/index.html'], ['/observer/dashboard','/observer-dashboard.html']
]);

let expressHandler;
async function ensureExpress(env) {
    if (expressHandler) return expressHandler;
    process.env.SUPABASE_URL = env.SUPABASE_URL; process.env.SUPABASE_KEY = env.SUPABASE_KEY; process.env.JWT_SECRET = env.JWT_SECRET;
    globalThis.cloudflareEnv = env; Object.assign(process.env, env);
    const { default: app } = await import('../src/server.js');
    const { default: db } = await import('../src/config/database.js');
    db.init();
    if (!db.isLocal()) db.supabaseClient().from('roster').select('id').limit(1).then(() => console.log('Supabase successfully warmed up in background on cold boot.')).catch(error => console.error('Supabase background warmup failed:', error));
    app.listen(3000); expressHandler = httpServerHandler({ port: 3000 }); return expressHandler;
}
function patchLoginHtml(html) {
    let patched = html.replace(/\/js\/portal\.js\?v=[^"']+/g, '/js/portal.js?v=20260904-login-resilience1');
    patched = patched.replace('</head>', '<script src="/js/student-login-resilience.js?v=20260904-login1" defer></script></head>');
    return patched;
}
const studentNavbarCriticalCss = `
<style id="student-navbar-critical">
/* Exactly two columns: brand on the left, controls on the right. */
.student-dashboard-page .navbar,.student-dashboard-page nav.navbar{position:relative!important;display:block!important;width:100%!important;height:54px!important;min-height:54px!important;max-height:54px!important;padding:5px 0!important;margin:0!important;overflow:hidden!important;box-sizing:border-box!important}
.student-dashboard-page .navbar-inner,.student-dashboard-page .container.navbar-inner{display:grid!important;flex-direction:row!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-rows:1fr!important;align-items:center!important;width:100%!important;max-width:none!important;min-width:0!important;height:44px!important;padding:0 10px!important;margin:0!important;gap:8px!important;overflow:hidden!important;box-sizing:border-box!important}
.student-dashboard-page .navbar-inner>div:first-child{grid-column:1!important;grid-row:1!important;display:flex!important;flex-direction:row!important;align-items:center!important;gap:8px!important;width:100%!important;min-width:0!important;max-width:none!important;height:44px!important;overflow:hidden!important;white-space:nowrap!important}
.student-dashboard-page .navbar-inner>div:first-child>div:first-child{flex:0 0 30px!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:30px!important;min-height:30px!important;max-height:30px!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:0!important;margin:0!important;overflow:hidden!important;box-sizing:border-box!important;font-size:13px!important;line-height:1!important}
.student-dashboard-page .navbar-inner>div:first-child>div:last-child{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-width:0!important;width:auto!important;max-width:100%!important;height:32px!important;justify-content:center!important;align-items:flex-start!important;overflow:hidden!important;white-space:nowrap!important}
.student-dashboard-page .navbar-inner>div:first-child>div:last-child>div{display:block!important;width:100%!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
.student-dashboard-page .navbar-inner>div:last-child{grid-column:2!important;grid-row:1!important;display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;width:auto!important;min-width:0!important;max-width:184px!important;height:44px!important;padding:0!important;margin:0!important;overflow:hidden!important;white-space:nowrap!important}
.student-dashboard-page .navbar-inner>div:last-child>.theme-toggle,.student-dashboard-page .navbar-inner>div:last-child>#notificationBell{display:grid!important;place-items:center!important;flex:0 0 30px!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:30px!important;min-height:30px!important;max-height:30px!important;padding:0!important;margin:0!important;border:0!important;transform:none!important;box-sizing:border-box!important;overflow:hidden!important}
.student-dashboard-page .navbar-inner>div:last-child>.theme-toggle svg,.student-dashboard-page .navbar-inner>div:last-child>#notificationBell svg{display:block!important;width:18px!important;height:18px!important;max-width:18px!important;max-height:18px!important}
.student-dashboard-page .navbar-inner>div:last-child>div:has(#navStudentAvatar){display:flex!important;flex:0 0 48px!important;width:48px!important;min-width:48px!important;max-width:48px!important;height:30px!important;align-items:center!important;justify-content:center!important;gap:3px!important;padding:2px 4px 2px 2px!important;margin:0!important;box-sizing:border-box!important;overflow:hidden!important}
.student-dashboard-page .navbar-inner #navStudentAvatar{display:flex!important;flex:0 0 20px!important;width:20px!important;min-width:20px!important;max-width:20px!important;height:20px!important;min-height:20px!important;max-height:20px!important}
.student-dashboard-page .navbar-inner #navStudentPrn{display:block!important;flex:1 1 auto!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:9px!important;line-height:1!important}
.student-dashboard-page .navbar-inner>div:last-child>div:not(:has(#navStudentAvatar)){flex:0 0 1px!important;width:1px!important;min-width:1px!important;max-width:1px!important;height:18px!important;padding:0!important;margin:0 1px!important}
.student-dashboard-page .navbar-inner #logoutBtn{display:flex!important;flex:0 0 54px!important;width:54px!important;min-width:54px!important;max-width:54px!important;height:32px!important;min-height:32px!important;max-height:32px!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:3px!important;padding:4px!important;margin:0!important;box-sizing:border-box!important;white-space:nowrap!important;overflow:hidden!important;font-size:10px!important;line-height:1!important}
.student-dashboard-page .navbar-inner #logoutBtn svg{display:block!important;width:13px!important;height:13px!important;max-width:13px!important;max-height:13px!important;flex:0 0 13px!important}
@media(max-width:760px){.student-dashboard-page .navbar-inner{height:42px!important;padding:0 7px!important}.student-dashboard-page .navbar{height:52px!important;min-height:52px!important;max-height:52px!important}.student-dashboard-page .navbar-inner>div:last-child{max-width:174px!important}}
@media(max-width:480px){.student-dashboard-page .navbar-inner{height:40px!important;padding:0 5px!important;gap:4px!important}.student-dashboard-page .navbar{height:50px!important;min-height:50px!important;max-height:50px!important}.student-dashboard-page .navbar-inner>div:first-child{height:40px!important;gap:7px!important}.student-dashboard-page .navbar-inner>div:first-child>div:first-child{flex-basis:28px!important;width:28px!important;min-width:28px!important;max-width:28px!important;height:28px!important;min-height:28px!important;max-height:28px!important;font-size:12px!important;border-radius:7px!important}.student-dashboard-page .navbar-inner>div:first-child>div:last-child{height:30px!important}.student-dashboard-page .navbar-inner>div:first-child>div:last-child>div{font-size:13px!important}.student-dashboard-page .navbar-inner>div:first-child>div:last-child>div+div{font-size:10px!important}.student-dashboard-page .navbar-inner>div:last-child{max-width:164px!important;height:40px!important;gap:1px!important}.student-dashboard-page .navbar-inner>div:last-child>.theme-toggle,.student-dashboard-page .navbar-inner>div:last-child>#notificationBell{flex-basis:28px!important;width:28px!important;min-width:28px!important;max-width:28px!important;height:28px!important;min-height:28px!important;max-height:28px!important}.student-dashboard-page .navbar-inner>div:last-child>div:has(#navStudentAvatar){flex-basis:44px!important;width:44px!important;min-width:44px!important;max-width:44px!important}.student-dashboard-page .navbar-inner #logoutBtn{flex-basis:48px!important;width:48px!important;min-width:48px!important;max-width:48px!important;height:30px!important;min-height:30px!important;max-height:30px!important;font-size:9px!important}}
@media(max-width:380px){.student-dashboard-page .navbar-inner{padding:0 3px!important}.student-dashboard-page .navbar-inner>div:last-child{max-width:156px!important}.student-dashboard-page .navbar-inner>div:first-child>div:first-child{flex-basis:26px!important;width:26px!important;min-width:26px!important;max-width:26px!important;height:26px!important;min-height:26px!important;max-height:26px!important}.student-dashboard-page .navbar-inner>div:last-child>.theme-toggle,.student-dashboard-page .navbar-inner>div:last-child>#notificationBell{flex-basis:26px!important;width:26px!important;min-width:26px!important;max-width:26px!important;height:26px!important;min-height:26px!important;max-height:26px!important}.student-dashboard-page .navbar-inner>div:last-child>div:has(#navStudentAvatar){flex-basis:42px!important;width:42px!important;min-width:42px!important;max-width:42px!important}.student-dashboard-page .navbar-inner #logoutBtn{flex-basis:46px!important;width:46px!important;min-width:46px!important;max-width:46px!important;font-size:9px!important}}
</style>`;
function patchDashboardHtml(html, assetPath) {
    let patched = html.replace(/\/js\/portal\.responsive\.js\?v=[^"']+/g, '/js/portal-responsive.js?v=20260908-navbar4');
    if (assetPath !== '/dashboard.html') patched = patched.replace('</head>', '<script src="/js/request-budget.js?v=20260904-free-tier2"></script></head>');
    if (assetPath === '/admin-dashboard.html') {
        patched = patched.replace(/\/js\/admin-dashboard\.js\?v=[^"']+/g, '/js/admin-dashboard.js?v=20260902-student-activity1');
        patched = patched.replace('</head>', '<link rel="stylesheet" href="/css/admin-alignment-20260814.css"><link rel="stylesheet" href="/css/admin-two-column-20260908.css"><link rel="stylesheet" href="/css/student-activity-feed.css?v=20260902-live1"><script src="/js/student-activity-feed.js?v=20260902-live1" defer></script></head>');
    }
    if (assetPath === '/observer-dashboard.html') patched = patched.replace(/\/js\/observer-dashboard\.js\?v=[^"']+/g, '/js/observer-dashboard.js?v=20260819-ssc-hsc');
    if (assetPath === '/dashboard.html') patched = patched.replace('</head>', `${studentNavbarCriticalCss}<link rel="stylesheet" href="/css/student-navbar-final.css?v=20260908-navbar8"><link rel="stylesheet" href="/css/profile-requirements-20260814.css"><link rel="stylesheet" href="/css/student-projects-pro.css?v=20260904-projects2"><link rel="stylesheet" href="/css/student-feature-status.css?v=20260904-feature1"><link rel="stylesheet" href="/css/free-learning.css?v=20260906-catalog2"><link rel="stylesheet" href="/css/free-learning-v2.css?v=20260906-catalog2"><script src="/js/student-dashboard-interaction-hotfix.js?v=20260904-unlock6"></script><script src="/js/student-projects-pro.js?v=20260904-projects2" defer></script><script src="/js/student-feature-status.js?v=20260904-feature1" defer></script><script src="/js/free-learning-v2.js?v=20260906-catalog2" defer></script></head>`);
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
            if (['/dashboard.html','/admin-dashboard.html','/observer-dashboard.html'].includes(assetPath)) return noStore(new Response(patchDashboardHtml(await response.text(), assetPath), { status: response.status, headers: response.headers }), env);
            return noStore(response, env);
        }
        const response = await env.ASSETS.fetch(request);
        return /\.(?:html|js|css)$/i.test(url.pathname) ? noStore(response, env) : response;
    },
    async scheduled(event, env, context) {
        try {
            process.env.SUPABASE_URL = env.SUPABASE_URL; process.env.SUPABASE_KEY = env.SUPABASE_KEY; process.env.JWT_SECRET = env.JWT_SECRET; globalThis.cloudflareEnv = env; Object.assign(process.env, env);
            const { default: db } = await import('../src/config/database.js'); db.init();
            if (!db.isLocal()) { const { error } = await db.supabaseClient().from('roster').select('id').limit(1); if (error) throw error; console.log('Supabase keep-alive ping successful.'); }
            if (event.cron === (env.PROOF_EXPIRY_CRON || '0 * * * *')) { const { default: proofExpiry } = await import('../src/services/proofExpiry.js'); console.log('Proof expiry cleanup complete:', JSON.stringify(await proofExpiry.runProofExpiryCleanup())); }
            if (event.cron === (env.PUSH_REMINDER_CRON || '0 4 */3 * *')) { const { default: pushService } = await import('../src/services/incompleteProfilePush.js'); console.log('Incomplete-profile push job complete:', JSON.stringify(await pushService.runIncompleteProfilePushJob({ env }))); }
        } catch (error) { console.error('Scheduled Worker job failed:', error); throw error; }
    },
    async queue(batch, env, context) { console.log(`Ignored ${batch.messages?.length || 0} queue message(s); certificate-fraud processing has been removed.`); }
};
function noStore(response, env) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0'); headers.set('Pragma','no-cache'); headers.set('Expires','0'); headers.set('Content-Security-Policy',contentSecurityPolicy(env)); headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains'); headers.set('X-Content-Type-Options','nosniff'); headers.set('X-Frame-Options','DENY'); headers.set('Referrer-Policy','strict-origin-when-cross-origin'); headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};
