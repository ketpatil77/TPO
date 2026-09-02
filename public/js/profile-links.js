(() => {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    const token = () => localStorage.getItem('tpo_token');
    let cachedLinks = { github_url: '', portfolio_url: '' };

    function csrfToken() {
        const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function api(path, options = {}) {
        const headers = { Authorization: `Bearer ${token()}`, ...(options.headers || {}) };
        const csrf = csrfToken();
        if (csrf && options.method && options.method !== 'GET') headers['x-csrf-token'] = csrf;
        const response = await fetch(path, { ...options, headers });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Request failed.');
        return json.data;
    }

    function ensureEditor() {
        if (document.getElementById('profileProfessionalLinks')) return true;
        const form = document.getElementById('profileForm');
        const saveBar = form?.querySelector('.profile-save-bar');
        if (!form || !saveBar) return false;

        const section = document.createElement('div');
        section.id = 'profileProfessionalLinks';
        section.style.gridColumn = '1 / -1';
        section.innerHTML = `
            <div class="profile-form-section-title"><span>04</span><div><strong>Professional links</strong><small>Show recruiters your code and portfolio</small></div></div>
            <div class="grid-2">
                <div class="form-group">
                    <label class="form-label" for="editGithubUrl">GitHub Profile</label>
                    <input type="url" id="editGithubUrl" class="form-input" maxlength="500" inputmode="url" autocomplete="url" placeholder="https://github.com/username">
                    <div class="form-hint">Optional. Add your public GitHub profile link.</div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="editPortfolioUrl">Portfolio Website</label>
                    <input type="url" id="editPortfolioUrl" class="form-input" maxlength="500" inputmode="url" placeholder="https://yourportfolio.com">
                    <div class="form-hint">Optional. Add your personal portfolio or project website.</div>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;align-items:center;gap:.75rem;margin-top:.25rem;">
                <span id="professionalLinksStatus" class="form-hint" role="status"></span>
                <button type="button" id="saveProfessionalLinks" class="btn btn-secondary btn-sm">Save professional links</button>
            </div>`;
        saveBar.before(section);
        document.getElementById('saveProfessionalLinks').addEventListener('click', saveLinks);
        return true;
    }

    function normalizedUrl(value) {
        try { return new URL(value).href; } catch (_) { return ''; }
    }

    function renderOverviewLinks() {
        const host = document.getElementById('overviewProfileLinks');
        if (!host) return;
        const entries = [
            ['GitHub', cachedLinks.github_url, 'github'],
            ['Portfolio', cachedLinks.portfolio_url, 'portfolio']
        ];

        entries.forEach(([label, value, key]) => {
            const managed = host.querySelector(`[data-professional-link="${key}"]`);
            if (!value) {
                managed?.remove();
                return;
            }

            const target = normalizedUrl(value);
            host.querySelectorAll('a:not([data-professional-link])').forEach(anchor => {
                if (anchor.textContent.trim().toLowerCase() === label.toLowerCase()) anchor.remove();
            });

            if (managed) {
                const alreadyCorrect = normalizedUrl(managed.href) === target && managed.textContent.trim() === label;
                if (alreadyCorrect) return;
                managed.href = value;
                managed.textContent = label;
                return;
            }

            const duplicate = [...host.querySelectorAll('a')].some(anchor => normalizedUrl(anchor.href) === target);
            if (duplicate) return;
            const anchor = document.createElement('a');
            anchor.className = 'btn btn-secondary btn-sm';
            anchor.dataset.professionalLink = key;
            anchor.href = value;
            anchor.target = '_blank';
            anchor.rel = 'noopener';
            anchor.textContent = label;
            host.appendChild(anchor);
        });
    }

    function validateGithub(input) {
        const value = input.value.trim();
        input.setCustomValidity('');
        if (!value) return true;
        try {
            const url = new URL(value);
            const host = url.hostname.toLowerCase();
            const valid = url.protocol === 'https:' && (host === 'github.com' || host === 'www.github.com') && url.pathname.split('/').filter(Boolean).length >= 1;
            if (!valid) input.setCustomValidity('Enter a valid GitHub profile URL such as https://github.com/username');
            return valid;
        } catch (_) {
            input.setCustomValidity('Enter a valid GitHub profile URL.');
            return false;
        }
    }

    async function loadLinks() {
        if (!ensureEditor()) return;
        try {
            cachedLinks = await api('/api/student/profile-links');
            const github = document.getElementById('editGithubUrl');
            const portfolio = document.getElementById('editPortfolioUrl');
            if (github && document.activeElement !== github) github.value = cachedLinks.github_url || '';
            if (portfolio && document.activeElement !== portfolio) portfolio.value = cachedLinks.portfolio_url || '';
            renderOverviewLinks();
        } catch (error) {
            console.warn('Professional links unavailable:', error.message);
        }
    }

    async function saveLinks() {
        const github = document.getElementById('editGithubUrl');
        const portfolio = document.getElementById('editPortfolioUrl');
        const button = document.getElementById('saveProfessionalLinks');
        const status = document.getElementById('professionalLinksStatus');
        if (!github || !portfolio || !button) return;
        if (!validateGithub(github) || !github.reportValidity() || !portfolio.reportValidity()) return;

        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Saving…';
        if (status) status.textContent = 'Saving professional links…';
        try {
            cachedLinks = await api('/api/student/profile-links', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ github_url: github.value.trim(), portfolio_url: portfolio.value.trim() })
            });
            github.value = cachedLinks.github_url || '';
            portfolio.value = cachedLinks.portfolio_url || '';
            renderOverviewLinks();
            if (status) status.textContent = 'Links saved.';
            window.showToast?.('Professional links updated.', 'success');
        } catch (error) {
            if (status) status.textContent = error.message;
            window.showToast?.(error.message, 'error') || alert(error.message);
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    function overviewNeedsSync(host) {
        return [
            ['github', cachedLinks.github_url],
            ['portfolio', cachedLinks.portfolio_url]
        ].some(([key, value]) => {
            const managed = host.querySelector(`[data-professional-link="${key}"]`);
            return value ? !managed || normalizedUrl(managed.href) !== normalizedUrl(value) : Boolean(managed);
        });
    }

    function boot() {
        ensureEditor();
        loadLinks();
        const overview = document.getElementById('overviewProfileLinks');
        if (overview) {
            new MutationObserver(() => {
                if (overviewNeedsSync(overview)) queueMicrotask(renderOverviewLinks);
            }).observe(overview, { childList: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
