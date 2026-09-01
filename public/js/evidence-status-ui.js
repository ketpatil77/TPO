(() => {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const token = () => localStorage.getItem('tpo_token');
    let profileData = null;
    let scheduled = false;
    let initialized = false;

    function statusLabel(status) {
        const value = ['verified', 'rejected'].includes(status) ? status : 'pending';
        return { value, label: value === 'verified' ? 'Verified for points' : value === 'rejected' ? 'Rejected' : 'Pending verification' };
    }

    function badge(status, note = '') {
        const meta = statusLabel(status);
        return `<span class="evidence-status-badge evidence-status-${meta.value}" title="${esc(note || (meta.value === 'pending' ? 'This record will not earn Profile Points until TPO/TPC verifies it.' : ''))}">${esc(meta.label)}</span>`;
    }

    function decorateCards(containerId, selector, records) {
        const host = document.getElementById(containerId);
        if (!host) return;
        const cards = [...host.querySelectorAll(selector)];
        cards.forEach((card, index) => {
            const record = records?.[index];
            if (!record) return;
            card.querySelector('.evidence-status-holder')?.remove();
            const holder = document.createElement('div');
            holder.className = 'evidence-status-holder';
            holder.innerHTML = badge(record.verification_status, record.verification_note);
            const head = card.querySelector('.item-details > div, .project-card-head > div:first-child, .project-card-head');
            (head || card).appendChild(holder);
        });
    }

    function decorateAcademic(student) {
        const target = document.getElementById('overallCgpaBadge') || document.getElementById('overviewCgpa')?.parentElement;
        if (!target || !student) return;
        document.getElementById('academicVerificationBadge')?.remove();
        const holder = document.createElement('span');
        holder.id = 'academicVerificationBadge';
        holder.className = 'evidence-status-inline';
        holder.innerHTML = badge(student.academic_verification_status, student.academic_verification_note);
        target.insertAdjacentElement('afterend', holder);
    }

    function decorateSkillSummary(skills) {
        const input = document.getElementById('editSkills');
        const group = input?.closest('.form-group');
        if (!group) return;
        group.querySelector('.skill-verification-summary')?.remove();
        const counts = (skills || []).reduce((acc, item) => {
            const state = statusLabel(item.verification_status).value;
            acc[state] = (acc[state] || 0) + 1;
            return acc;
        }, { verified: 0, pending: 0, rejected: 0 });
        const line = document.createElement('div');
        line.className = 'skill-verification-summary';
        line.innerHTML = `<strong>Skill verification:</strong> ${counts.verified} verified · ${counts.pending} pending${counts.rejected ? ` · ${counts.rejected} rejected` : ''}. Only verified skills can earn Profile Points.`;
        group.appendChild(line);
    }

    function decorate() {
        scheduled = false;
        if (!profileData) return;
        decorateAcademic(profileData.student);
        decorateCards('internshipsList', '.item-card', profileData.internships || []);
        decorateCards('certificatesList', '.item-card', profileData.certificates || []);
        decorateCards('projectsList', '.project-card', profileData.projects || []);
        decorateCards('researchList', '.research-card', profileData.research_papers || []);
        decorateSkillSummary(profileData.skills || []);
    }

    function scheduleDecorate() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(decorate);
    }

    async function load() {
        try {
            const response = await fetch('/api/student/profile', { headers: { Authorization: `Bearer ${token()}` } });
            const json = await response.json();
            if (!response.ok || !json.success) return;
            profileData = json.data;
            scheduleDecorate();
            ['internshipsList','certificatesList','projectsList','researchList'].forEach(id => {
                const host = document.getElementById(id);
                if (host && !host.dataset.evidenceObserver) {
                    host.dataset.evidenceObserver = 'true';
                    new MutationObserver(scheduleDecorate).observe(host, { childList: true, subtree: false });
                }
            });
        } catch (_) { /* Ranking still explains verification if this visual enhancement cannot load. */ }
    }

    function init() {
        if (initialized) return;
        initialized = true;
        load();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
        window.addEventListener('focus', load);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
