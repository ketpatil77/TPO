export function contentSecurityPolicy(env = {}) {
    let supabaseOrigin = '';
    try {
        const url = new URL(env.SUPABASE_URL || '');
        if (url.protocol === 'https:') supabaseOrigin = url.origin;
    } catch (_) {
        // Missing or invalid configuration must not broaden image access.
    }

    return [
        "default-src 'self'",
        "base-uri 'self'",
        "connect-src 'self' https://challenges.cloudflare.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "frame-src https://challenges.cloudflare.com",
        `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
        "object-src 'none'",
        "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "upgrade-insecure-requests"
    ].join('; ');
}
