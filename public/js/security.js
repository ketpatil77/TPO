(function () {
    localStorage.removeItem('tpo_token');
    localStorage.removeItem('tpo_admin_token');
    localStorage.removeItem('tpo_student');
    const nativeFetch = window.fetch.bind(window);
    function cookie(name) {
        const part = document.cookie.split('; ').find(value => value.startsWith(`${name}=`));
        return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
    }
    window.fetch = function secureFetch(input, init = {}) {
        const method = String(init.method || 'GET').toUpperCase();
        const headers = new Headers(init.headers || {});
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            const token = cookie('csrfToken');
            if (token) headers.set('X-CSRF-Token', token);
        }
        return nativeFetch(input, { ...init, headers, credentials: 'same-origin' });
    };
    window.apiError = data => data?.error?.message || data?.error || 'Request failed.';
})();
