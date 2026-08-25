(function () {
    const onDashboard = ['/dashboard','/admin/dashboard','/observer/dashboard'].includes(location.pathname);
    if (!onDashboard) {
        localStorage.removeItem('tpo_token');
        localStorage.removeItem('tpo_admin_token');
        localStorage.removeItem('tpo_student');
    }
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

        const tpoToken = localStorage.getItem('tpo_token');
        const adminToken = localStorage.getItem('tpo_admin_token');
        const observerToken = localStorage.getItem('tpo_observer_token');

        if (tpoToken) headers.set('Authorization', `Bearer ${tpoToken}`);
        else if (adminToken) headers.set('Authorization', `Bearer ${adminToken}`);
        else if (observerToken) headers.set('Authorization', `Bearer ${observerToken}`);

        return nativeFetch(input, { ...init, headers, credentials: 'same-origin' }).then(response => {
            const onDashboard = ['/dashboard','/admin/dashboard','/observer/dashboard'].includes(location.pathname);
            if (response.status === 401 && onDashboard) {
                sessionStorage.clear();
                location.replace('/?session=expired');
            }
            return response;
        });
    };
    window.apiError = data => data?.error?.message || data?.error || 'Request failed.';
})();
