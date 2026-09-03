(() => {
    if (window.PortalOperationFeedback) return;

    const previousFetch = window.fetch.bind(window);
    let activeCount = 0;
    let hideTimer = null;
    let slowTimer = null;
    let currentMessage = 'Working…';

    function ensureUi() {
        let host = document.getElementById('portalOperationFeedback');
        if (host) return host;

        const style = document.createElement('style');
        style.textContent = `
            #portalOperationFeedback{
                position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:100000;
                display:flex;align-items:center;gap:10px;max-width:min(92vw,420px);min-width:190px;
                padding:10px 14px;border:1px solid var(--border-color,rgba(255,255,255,.16));border-radius:12px;
                background:color-mix(in srgb,var(--bg-card,#151b27) 94%,black 6%);color:var(--text-heading,#fff);
                box-shadow:0 14px 38px rgba(0,0,0,.3);font-size:.82rem;font-weight:700;line-height:1.2;
                opacity:0;transform:translate(-50%,12px);pointer-events:none;visibility:hidden;
                transition:opacity .16s ease,transform .16s ease,visibility .16s ease;
            }
            #portalOperationFeedback.is-visible{opacity:1;transform:translate(-50%,0);visibility:visible}
            #portalOperationFeedback .portal-operation-spinner{
                width:18px;height:18px;flex:0 0 18px;border:2px solid color-mix(in srgb,currentColor 28%,transparent);
                border-top-color:var(--workspace-accent,var(--accent,#7dd3fc));border-radius:50%;animation:portal-operation-spin .72s linear infinite;
            }
            #portalOperationFeedback .portal-operation-copy{min-width:0}
            #portalOperationFeedback .portal-operation-message{display:block;white-space:normal;overflow-wrap:anywhere}
            #portalOperationFeedback .portal-operation-detail{display:block;margin-top:2px;color:var(--text-muted,#9ca3af);font-size:.67rem;font-weight:500}
            @keyframes portal-operation-spin{to{transform:rotate(360deg)}}
            @media(max-width:520px){#portalOperationFeedback{bottom:max(12px,env(safe-area-inset-bottom));max-width:calc(100vw - 24px);min-width:0;width:max-content;padding:9px 12px;font-size:.76rem}}
            @media(prefers-reduced-motion:reduce){#portalOperationFeedback{transition:none}#portalOperationFeedback .portal-operation-spinner{animation-duration:1.5s}}
        `;
        document.head.appendChild(style);

        host = document.createElement('div');
        host.id = 'portalOperationFeedback';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'true');
        host.innerHTML = '<span class="portal-operation-spinner" aria-hidden="true"></span><span class="portal-operation-copy"><span class="portal-operation-message">Working…</span><span class="portal-operation-detail">Please keep this page open.</span></span>';
        document.body.appendChild(host);
        return host;
    }

    function setCopy(message, detail = 'Please keep this page open.') {
        const host = ensureUi();
        host.querySelector('.portal-operation-message').textContent = message || 'Working…';
        host.querySelector('.portal-operation-detail').textContent = detail || '';
    }

    function show(message) {
        window.clearTimeout(hideTimer);
        window.clearTimeout(slowTimer);
        currentMessage = message || 'Working…';
        activeCount += 1;
        const host = ensureUi();
        setCopy(currentMessage);
        host.classList.add('is-visible');
        slowTimer = window.setTimeout(() => {
            if (activeCount > 0) setCopy(currentMessage, 'Still working. Slow connections can take a few seconds.');
        }, 1800);
    }

    function hide() {
        activeCount = Math.max(0, activeCount - 1);
        if (activeCount > 0) return;
        window.clearTimeout(slowTimer);
        hideTimer = window.setTimeout(() => {
            if (activeCount === 0) ensureUi().classList.remove('is-visible');
        }, 180);
    }

    function update(message, detail) {
        currentMessage = message || currentMessage;
        if (activeCount > 0) setCopy(currentMessage, detail);
    }

    function classify(input, init = {}) {
        let raw = typeof input === 'string' ? input : input?.url || '';
        if (!raw) return null;
        let url;
        try { url = new URL(raw, window.location.origin); } catch (_) { return null; }
        if (url.origin !== window.location.origin) return null;

        const path = url.pathname;
        const method = String(init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();

        if (method === 'POST' && /^\/api\/student\/certificate-evidence\/[^/]+$/.test(path)) return 'Uploading certificate proof…';
        if (method === 'GET' && /^\/api\/student\/certificate-evidence\/[^/]+$/.test(path)) return 'Loading certificate proof…';
        if ((method === 'POST' || method === 'PUT') && /^\/api\/student\/certificates(?:\/[^/]+)?$/.test(path)) return 'Saving certificate…';

        if (method === 'POST' && /^\/api\/student\/internship-evidence\/[^/]+$/.test(path)) return 'Uploading internship proof…';
        if (method === 'GET' && /^\/api\/student\/internship-evidence\/[^/]+$/.test(path)) return 'Loading internship proof…';
        if ((method === 'POST' || method === 'PUT') && /^\/api\/student\/internships(?:\/[^/]+)?$/.test(path)) return 'Saving internship…';

        if (method === 'GET' && /^\/api\/(?:admin|observer)\/proof-review\/(?:certificate|internship)\/[^/]+\/proof$/.test(path)) return 'Loading proof…';
        if (method === 'POST' && /^\/api\/(?:admin|observer)\/proof-review\/(?:certificate|internship)\/[^/]+\/review$/.test(path)) {
            try {
                const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
                if (body?.status === 'approved') return 'Approving proof…';
                if (body?.status === 'rejected') return 'Rejecting proof…';
            } catch (_) {}
            return 'Saving proof review…';
        }
        return null;
    }

    window.fetch = async function portalFeedbackFetch(input, init = {}) {
        const message = classify(input, init);
        if (!message) return previousFetch(input, init);
        show(message);
        try {
            return await previousFetch(input, init);
        } finally {
            hide();
        }
    };

    window.PortalOperationFeedback = { show, hide, update };
})();
