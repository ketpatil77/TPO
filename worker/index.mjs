import { httpServerHandler } from 'cloudflare:node';
import { contentSecurityPolicy } from './security-headers.mjs';

const pageMap = new Map([
    ['/', '/index.html'], ['/login', '/index.html'], ['/dashboard', '/dashboard.html'],
    ['/admin', '/index.html'], ['/admin/login', '/index.html'], ['/admin/dashboard', '/admin-dashboard.html'],
    ['/observer', '/index.html'], ['/observer/login', '/index.html'], ['/observer/dashboard', '/observer-dashboard.html']
]);

let expressHandler;
export default {
    async fetch(request, env, context) {
        if (!expressHandler) {
            process.env.SUPABASE_URL = env.SUPABASE_URL;
            process.env.SUPABASE_KEY = env.SUPABASE_KEY;
            process.env.JWT_SECRET = env.JWT_SECRET;
            globalThis.cloudflareEnv = env;
            Object.assign(process.env, env);
            const { default: app } = await import('../src/server.js');
            const { default: db } = await import('../src/config/database.js');
            db.init();

            // Fire async database wakeup ping in background to avoid blocking the first user request
            if (!db.isLocal()) {
                db.supabaseClient().from('roster').select('id').limit(1).then(() => {
                    console.log('Supabase successfully warmed up in background on cold boot.');
                }).catch(e => {
                    console.error('Supabase background warmup failed:', e);
                });
            }

            app.listen(3000);
            expressHandler = httpServerHandler({ port: 3000 });
        }
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/')) return expressHandler.fetch(request, env, context);
        const assetPath = pageMap.get(url.pathname);
        if (assetPath) {
            url.pathname = assetPath;
            const response = await env.ASSETS.fetch(new Request(url, request));
            if (['/dashboard.html', '/admin-dashboard.html', '/observer-dashboard.html'].includes(assetPath)) {
                let html = await response.text();
                if (assetPath === '/admin-dashboard.html') {
                    html = html.replace(/\/js\/admin-dashboard\.js\?v=[^"']+/g, '/js/admin-dashboard.js?v=20260819-ssc-hsc');
                }
                if (assetPath === '/observer-dashboard.html') {
                    html = html.replace(/\/js\/observer-dashboard\.js\?v=[^"']+/g, '/js/observer-dashboard.js?v=20260819-ssc-hsc');
                }
                const rolePatch = assetPath === '/admin-dashboard.html' ? '<link rel="stylesheet" href="/css/admin-alignment-20260814.css">' : '';
                const profileRequirements = assetPath === '/dashboard.html' ? '<link rel="stylesheet" href="/css/profile-requirements-20260814.css">' : '';
                const patched = html.replace('</head>', `<link rel="stylesheet" href="/css/portal-layout-20260814.css?v=20260817-responsive1"><link rel="stylesheet" href="/css/portal-identifiers-20260814.css?v=20260817-responsive1"><script src="/js/responsive-tables.js?v=20260817-responsive1" defer></script>${profileRequirements}${rolePatch}</head>`);
                return noStore(new Response(patched, { status: response.status, headers: response.headers }), true, env);
            }
            return noStore(response, true, env);
        }
        const response = await env.ASSETS.fetch(request);
        return /\.(?:html|js|css)$/i.test(url.pathname) ? noStore(response, false, env) : response;
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
                const { data, error } = await db.supabaseClient().from('roster').select('id').limit(1);
                if (error) throw error;
                console.log('Supabase keep-alive ping successful.');
            }
        } catch (e) {
            console.error('Supabase keep-alive ping failed:', e);
        }
    }
};

function noStore(response, clearCache, env) {
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
