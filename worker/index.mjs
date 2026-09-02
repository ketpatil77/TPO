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
                if (assetPath === '/dashboard.html') {
                    html = html.replace(/\/js\/portal-responsive\.js\?v=[^"']+/g, '/js/portal-responsive.js?v=20260902-ranking-compact1');
                }
                if (assetPath === '/admin-dashboard.html') {
                    html = html.replace(/\/js\/admin-dashboard\.js\?v=[^"']+/g, '/js/admin-dashboard.js?v=20260819-ssc-hsc');
                }
                if (assetPath === '/observer-dashboard.html') {
                    html = html.replace(/\/js\/observer-dashboard\.js\?v=[^"']+/g, '/js/observer-dashboard.js?v=20260819-ssc-hsc');
                }
                const rolePatch = assetPath === '/admin-dashboard.html' ? '<link rel="stylesheet" href="/css/admin-alignment-20260814.css">' : '';
                const profileRequirements = assetPath === '/dashboard.html' ? '<link rel="stylesheet" href="/css/profile-requirements-20260814.css">' : '';
                const rankingV3Patch = assetPath === '/dashboard.html' ? `<style>
#tab-ranking .leaderboard-entry-details{margin:0!important;padding:0 12px 12px!important;text-align:center!important}
#tab-ranking .leaderboard-entry-details>summary{width:100%!important;display:flex!important;justify-content:center!important;align-items:center!important;min-height:34px!important;text-align:center!important}
#tab-ranking .ranking-score-explainer{max-width:760px!important;margin:8px auto!important;padding:10px 12px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px 12px!important;flex-wrap:wrap!important;text-align:center!important;min-height:0!important}
#tab-ranking .ranking-score-explainer>span{display:none!important}
#tab-ranking .ranking-breakdown-grid-v3{max-width:760px!important;margin:8px auto 0!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important}
#tab-ranking .ranking-category-score{min-height:48px!important;padding:8px 10px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;text-align:left!important}
#tab-ranking .ranking-category-score em{display:none!important}
#tab-ranking .ranking-explanation-list,#tab-ranking .ranking-exact-details{display:none!important}
@media(max-width:760px){
  #tab-ranking .leaderboard-entry-details{padding:0 10px 10px!important}
  #tab-ranking .ranking-score-explainer{margin:6px auto!important;padding:8px 10px!important}
  #tab-ranking .ranking-score-explainer>strong{font-size:15px!important}
  #tab-ranking .ranking-breakdown-grid-v3{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}
  #tab-ranking .ranking-category-score{min-height:42px!important;padding:7px 9px!important;border-radius:10px!important}
  #tab-ranking .ranking-category-score small{font-size:10px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
  #tab-ranking .ranking-category-score strong{font-size:14px!important}
}
</style><script>
window.addEventListener('load', function () {
  ['#academicVerificationBadge','.evidence-status-inline','.evidence-status-holder','.skill-verification-summary'].forEach(function (selector) {
    document.querySelectorAll(selector).forEach(function (node) { node.remove(); });
  });
  document.querySelectorAll('.tabs-nav [aria-controls="tab-ranking"]').forEach(function (node) { node.remove(); });
  document.querySelectorAll('#tab-ranking').forEach(function (node) { node.remove(); });
  document.querySelectorAll('#overviewRankSpotlight').forEach(function (node) { node.remove(); });
  var cleanup = document.createElement('script');
  cleanup.src = '/js/evidence-status-ui.js?v=20260901-cleanup-only1';
  cleanup.setAttribute('data-obsolete-evidence-cleanup', 'true');
  document.body.appendChild(cleanup);
  var script = document.createElement('script');
  script.src = '/js/profile-ranking.js?v=20260902-compact-score1';
  script.setAttribute('data-ranking-authoritative-v3', 'true');
  document.body.appendChild(script);

  function compactScoreDetails(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.leaderboard-entry-details').forEach(function (details) {
      var summary = details.querySelector(':scope > summary');
      if (summary) summary.textContent = 'Score breakdown';
      var explainer = details.querySelector(':scope > .ranking-score-explainer');
      if (explainer) {
        explainer.querySelectorAll(':scope > span').forEach(function (node) { node.remove(); });
        var total = Array.from(explainer.children).find(function (node) { return node.tagName === 'STRONG' && !node.classList.contains('potential'); });
        if (total) total.textContent = total.textContent.replace(/\s*points?\s*$/i, ' pts');
      }
      var grid = details.querySelector(':scope > .ranking-breakdown-grid-v3');
      if (grid) {
        grid.querySelectorAll('.ranking-category-score').forEach(function (card) {
          var score = parseFloat((card.querySelector('strong') || {}).textContent || '0') || 0;
          var pending = card.classList.contains('has-pending');
          if (score <= 0 && !pending) card.remove();
          var state = card.querySelector('em');
          if (state && !pending) state.remove();
        });
      }
      details.querySelectorAll(':scope > .ranking-explanation-list,:scope > .ranking-exact-details').forEach(function (node) { node.remove(); });
    });
  }

  var rankingObserver = new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) compactScoreDetails(node);
      });
    });
  });
  rankingObserver.observe(document.body, { childList: true, subtree: true });
  compactScoreDetails(document);
});
</script>` : '';
                let patched = html.replace('</head>', `<link rel="stylesheet" href="/css/portal-layout-20260814.css?v=20260817-responsive1"><link rel="stylesheet" href="/css/portal-identifiers-20260814.css?v=20260817-responsive1"><script src="/js/responsive-tables.js?v=20260817-responsive1" defer></script>${profileRequirements}${rolePatch}<link rel="stylesheet" href="/css/portal-responsive.css?v=20260902-ranking-compact1"></head>`);
                if (rankingV3Patch) patched = patched.replace('</body>', `${rankingV3Patch}</body>`);
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
                const { error } = await db.supabaseClient().from('roster').select('id').limit(1);
                if (error) throw error;
                console.log('Supabase keep-alive ping successful.');
            }
            if (event.cron === (env.PUSH_REMINDER_CRON || '0 4 */3 * *')) {
                const { default: pushService } = await import('../src/services/incompleteProfilePush.js');
                const result = await pushService.runIncompleteProfilePushJob({ env });
                console.log('Incomplete-profile push job complete:', JSON.stringify(result));
            }
        } catch (e) {
            console.error('Scheduled Worker job failed:', e);
            throw e;
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
