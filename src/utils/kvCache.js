// Zero-dependency KV Cache wrapper with local in-memory fallback for testing

const localCache = new Map();
const localTimers = new Map();

async function get(key) {
    if (globalThis.cloudflareEnv && globalThis.cloudflareEnv.TPO_CACHE) {
        try {
            return await globalThis.cloudflareEnv.TPO_CACHE.get(key);
        } catch (err) {
            console.error('KV Read Error:', err);
        }
    }
    return localCache.get(key) || null;
}

async function put(key, value, ttlSeconds = 120) {
    if (globalThis.cloudflareEnv && globalThis.cloudflareEnv.TPO_CACHE) {
        try {
            await globalThis.cloudflareEnv.TPO_CACHE.put(key, value, { expirationTtl: ttlSeconds });
            return;
        } catch (err) {
            console.error('KV Write Error:', err);
        }
    }
    localCache.set(key, value);
    if (localTimers.has(key)) {
        clearTimeout(localTimers.get(key));
    }
    const expiryTimer = setTimeout(() => {
        localCache.delete(key);
        localTimers.delete(key);
    }, ttlSeconds * 1000);
    expiryTimer.unref?.();
    localTimers.set(key, expiryTimer);
}

async function deleteKey(key) {
    if (globalThis.cloudflareEnv && globalThis.cloudflareEnv.TPO_CACHE) {
        try {
            await globalThis.cloudflareEnv.TPO_CACHE.delete(key);
            return;
        } catch (err) {
            console.error('KV Delete Error:', err);
        }
    }
    if (localTimers.has(key)) {
        clearTimeout(localTimers.get(key));
        localTimers.delete(key);
    }
    localCache.delete(key);
}

async function clearPattern(pattern) {
    if (globalThis.cloudflareEnv && globalThis.cloudflareEnv.TPO_CACHE) {
        try {
            const list = await globalThis.cloudflareEnv.TPO_CACHE.list({ prefix: pattern });
            for (const key of list.keys) {
                await globalThis.cloudflareEnv.TPO_CACHE.delete(key.name);
            }
            return;
        } catch (err) {
            console.error('KV List/Clear Error:', err);
        }
    }
    for (const key of localCache.keys()) {
        if (key.startsWith(pattern)) {
            if (localTimers.has(key)) {
                clearTimeout(localTimers.get(key));
                localTimers.delete(key);
            }
            localCache.delete(key);
        }
    }
}

module.exports = {
    get,
    put,
    delete: deleteKey,
    clearPattern
};
