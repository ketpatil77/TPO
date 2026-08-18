import { httpServerHandler } from 'cloudflare:node';

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
            Object.assign(process.env, env);
            const { default: app } = await import('../src/server.js');
            const { default: db } = await import('../src/config/database.js');
            db.init();
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
                const html = await response.text();
                const rolePatch = assetPath === '/admin-dashboard.html' ? '<link rel="stylesheet" href="/css/admin-alignment-20260814.css">' : '';
                const profileRequirements = assetPath === '/dashboard.html' ? '<link rel="stylesheet" href="/css/profile-requirements-20260814.css">' : '';
                const patched = html.replace('</head>', `<link rel="stylesheet" href="/css/portal-layout-20260814.css?v=20260817-responsive1"><link rel="stylesheet" href="/css/portal-identifiers-20260814.css?v=20260817-responsive1"><script src="/js/responsive-tables.js?v=20260817-responsive1" defer></script>${profileRequirements}${rolePatch}</head>`);
                return noStore(new Response(patched, { status: response.status, headers: response.headers }), true);
            }
            return noStore(response, true);
        }
        const response = await env.ASSETS.fetch(request);
        return /\.(?:html|js|css)$/i.test(url.pathname) ? noStore(response, false) : response;
    }
};

function noStore(response, clearCache) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    if (clearCache) headers.set('Clear-Site-Data', '"cache"');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
