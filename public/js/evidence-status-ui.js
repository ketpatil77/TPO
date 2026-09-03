(() => {
    if (!document.body.classList.contains('student-dashboard-page')) return;

    const obsoleteSelectors = [
        '#academicVerificationBadge',
        '.evidence-status-inline',
        '.evidence-status-holder',
        '.skill-verification-summary'
    ];
    let queued = false;

    function loadStyles() {
        if (document.querySelector('link[data-evidence-ui-polish]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/evidence-ui-polish.css?v=20260903-1';
        link.dataset.evidenceUiPolish = 'true';
        document.head.appendChild(link);
    }

    function studentData() {
        try {
            return typeof currentStudentData !== 'undefined' && currentStudentData ? currentStudentData : null;
        } catch (_) {
            return null;
        }
    }

    function normalizeStatus(value) {
        const status = String(value || 'pending').toLowerCase();
        if (status === 'approved') return 'verified';
        return ['verified', 'rejected', 'pending'].includes(status) ? status : 'pending';
    }

    function statusInfo(item) {
        if (!item?.evidence_path) {
            return { state: 'missing', text: 'Proof required · 0 points' };
        }
        const status = normalizeStatus(item.verification_status);
        if (status === 'verified') {
            const reviewer = String(item.verified_role || '').toLowerCase() === 'tpc' ? 'TPC' : 'TPO';
            return { state: 'verified', text: `Verified by ${reviewer} · points active` };
        }
        if (status === 'rejected') return { state: 'rejected', text: 'Verification rejected · 0 points' };
        return { state: 'pending', text: 'Awaiting verification · 0 points' };
    }

    function setStateChip(card, item, kind) {
        const info = statusInfo(item);
        card.dataset.evidenceState = info.state;
        card.classList.add('evidence-polished-card');

        let chip = kind === 'certificate'
            ? card.querySelector('.certificate-proof-state')
            : card.querySelector('.internship-proof-chip');
        if (!chip) {
            chip = document.createElement('span');
            const details = card.querySelector('.item-details') || card;
            details.appendChild(chip);
        }
        const classes = `${kind === 'certificate' ? 'certificate-proof-state' : 'internship-proof-chip'} evidence-state-chip is-${info.state}`;
        if (chip.className !== classes) chip.className = classes;
        if (chip.textContent !== info.text) chip.textContent = info.text;
        chip.setAttribute('aria-label', info.text);

        const proofButton = card.querySelector(kind === 'certificate' ? '.certificate-vault-actions .btn:first-child' : '.internship-proof-action');
        if (proofButton && item?.evidence_path && proofButton.textContent.trim() !== 'View proof') proofButton.textContent = 'View proof';
    }

    function polishCards() {
        obsoleteSelectors.forEach(selector => document.querySelectorAll(selector).forEach(node => node.remove()));
        const data = studentData();
        if (!data) return;

        const certificateCards = [...document.querySelectorAll('#certificatesList .item-card')];
        const certificates = Array.isArray(data.certificates) ? data.certificates : [];
        certificateCards.forEach((card, index) => {
            const item = certificates[index];
            if (item) setStateChip(card, item, 'certificate');
        });

        const internshipCards = [...document.querySelectorAll('#internshipsList .item-card')];
        const internships = Array.isArray(data.internships) ? data.internships : [];
        internshipCards.forEach((card, index) => {
            const item = internships[index];
            if (item) setStateChip(card, item, 'internship');
        });
    }

    function queuePolish() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            polishCards();
        });
    }

    function init() {
        loadStyles();
        polishCards();
        new MutationObserver(queuePolish).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('focus', queuePolish);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) queuePolish(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
