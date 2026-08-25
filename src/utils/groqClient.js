const crypto = require('crypto');
const kvCache = require('./kvCache');

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;

/**
 * Call Groq API with automatic retries, backoff, timeout handling, and caching.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options
 */
async function callGroqJson(systemPrompt, userPrompt, options = {}) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return null; // Signals fallback to deterministic parsing
    }

    // Check cache
    const cacheKey = `groq_parse:${crypto.createHash('md5').update(`${systemPrompt}:${userPrompt}`).digest('hex')}`;
    const cached = await kvCache.get(cacheKey);
    if (cached) {
        try {
            return typeof cached === 'string' ? JSON.parse(cached) : cached;
        } catch {
            // cache miss / invalid json
        }
    }

    let attempt = 0;
    let lastError = null;
    const fetchImpl = options.fetchImpl || fetch;
    const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const random = options.random || Math.random;

    while (attempt < MAX_RETRIES) {
        attempt++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

        try {
            const res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: options.model || GROQ_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: options.temperature || 0.1,
                    max_tokens: options.maxTokens || 1000
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (res.status === 429 || res.status >= 500) {
                const backoffMs = Math.pow(2, attempt) * 500 + random() * 200;
                console.warn(`[GROQ] Rate limit/Server error (${res.status}). Retrying in ${Math.round(backoffMs)}ms (attempt ${attempt}/${MAX_RETRIES})...`);
                await sleep(backoffMs);
                continue;
            }

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Groq API error ${res.status}: ${errText}`);
            }

            const data = await res.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error('Groq returned empty response content.');

            const parsed = JSON.parse(content);
            // Cache successful result for 24 hours
            await kvCache.put(cacheKey, JSON.stringify(parsed), 86400);
            return parsed;
        } catch (err) {
            clearTimeout(timeoutId);
            lastError = err;
            if (err.name === 'AbortError') {
                console.warn(`[GROQ] Timeout after ${GROQ_TIMEOUT_MS}ms (attempt ${attempt}/${MAX_RETRIES}).`);
            } else {
                console.warn(`[GROQ] Request failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
            }
            if (attempt < MAX_RETRIES) {
                const backoffMs = Math.pow(2, attempt) * 500;
                await sleep(backoffMs);
            }
        }
    }

    console.error('[GROQ] All retry attempts failed. Falling back to rule-based parser.', lastError?.message);
    return null;
}

module.exports = { callGroqJson };
