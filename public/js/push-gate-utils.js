(function exposePushGateUtils(root) {
    function withTimeout(promise, milliseconds, message) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), milliseconds);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    const api = { withTimeout };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PushGateUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
