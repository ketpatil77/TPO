import { httpServerHandler } from 'cloudflare:node';
import app from '../src/server.js';

app.listen(3000);
const expressHandler = httpServerHandler({ port: 3000 });
const pageMap = new Map([
    ['/', '/login.html'], ['/login', '/login.html'], ['/dashboard', '/dashboard.html'],
    ['/admin', '/admin-login.html'], ['/admin/login', '/admin-login.html'], ['/admin/dashboard', '/admin-dashboard.html']
]);

export default {
    async fetch(request, env, context) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/')) return expressHandler.fetch(request, env, context);
        const assetPath = pageMap.get(url.pathname);
        if (assetPath) {
            url.pathname = assetPath;
            return env.ASSETS.fetch(new Request(url, request));
        }
        return env.ASSETS.fetch(request);
    }
};
