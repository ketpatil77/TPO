(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const token = () => localStorage.getItem('tpo_token');
  let timer = null;

  async function api(path) {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token()}` } });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Request failed');
    return json.data;
  }

  function semesterStatus(data) {
    const s = data.student || {};
    const semesters = s.cgpa_semesterwise || {};
    const start = (s.lateral_entry || data.diploma) ? 3 : 1;
    const entered = [];
    for (let i = start; i <= 8; i++) {
      if (Number(semesters[`sem${i}`]) > 0) entered.push(i);
    }
    if (!entered.length) return false;
    const highest = Math.max(...entered);
    for (let i = start; i <= highest; i++) {
      if (!(Number(semesters[`sem${i}`]) > 0)) return false;
    }
    return true;
  }

  function nameParts(name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).length;
  }

  function buildModel(data, comps) {
    const s = data.student || {};
    const core = [
      ['Full name', nameParts(s.name) >= 3, 'edit-profile'],
      ['Email', Boolean(String(s.email || '').trim()), 'edit-profile'],
      ['Phone', Boolean(String(s.phone || '').trim()), 'edit-profile'],
      ['Profile photo', Boolean(s.avatar_path), 'edit-profile'],
      ['SSC marks', Number(s.ssc_marks) > 0, 'edit-profile'],
      ['HSC / Diploma marks', Number(s.hsc_marks) > 0, 'edit-profile'],
      ['Semester CGPA', semesterStatus(data), 'edit-profile'],
      ['Resume', Boolean(s.resume_url), 'edit-profile']
    ];
    const enrichment = [
      ['Skills', (data.skills || []).length > 0, 'edit-profile'],
      ['Internships', (data.internships || []).length > 0, 'internships'],
      ['Certificates', (data.certificates || []).length > 0, 'certificates'],
      ['Projects', (data.projects || []).length > 0, 'projects'],
      ['Research', (data.research_papers || []).length > 0, 'research'],
      ['Competitions', (comps || []).length > 0, 'competitions']
    ];
    const missingCore = core.filter(item => !item[1]);
    const missingEnrichment = enrichment.filter(item => !item[1]);
    const weightedDone = core.filter(item => item[1]).length * 2 + enrichment.filter(item => item[1]).length;
    const percent = Math.round(weightedDone / (core.length * 2 + enrichment.length) * 100);
    return { core, enrichment, missingCore, missingEnrichment, percent };
  }

  function setTabState(control, state) {
    const tab = document.querySelector(`[aria-controls="tab-${control}"]`);
    if (!tab) return;
    tab.classList.remove('profile-state-complete', 'profile-state-partial', 'profile-state-missing');
    tab.classList.add(`profile-state-${state}`);
    tab.title = state === 'complete' ? 'Section complete' : state === 'partial' ? 'Section partially complete' : 'Section needs attention';
  }

  function patchUi(model, data) {
    const card = document.getElementById('studentReadinessCard');
    if (card) {
      const ring = card.querySelector('.readiness-ring');
      if (ring) {
        ring.style.setProperty('--completion', model.percent);
        const value = ring.querySelector('strong');
        if (value) value.textContent = `${model.percent}%`;
      }
      const status = model.percent >= 90 ? 'Placement Ready' : model.percent >= 70 ? 'Strong profile' : model.percent >= 45 ? 'Building profile' : 'Needs attention';
      const heading = card.querySelector('.readiness-copy h3');
      if (heading) heading.textContent = status;
      const message = card.querySelector('.readiness-copy p');
      if (message) message.textContent = model.missingCore.length
        ? `${model.missingCore.length} important profile item${model.missingCore.length === 1 ? '' : 's'} need attention.`
        : 'Your essential details are complete. Keep adding achievements to stay competitive.';
      const chip = card.querySelector('.readiness-meta .readiness-chip');
      if (chip) {
        chip.classList.toggle('warn', model.missingCore.length > 0);
        chip.classList.toggle('good', model.missingCore.length === 0);
        chip.textContent = model.missingCore.length ? `${model.missingCore.length} required missing` : 'Core details complete';
      }
      card.querySelectorAll('.quality-row').forEach(row => {
        const label = row.querySelector('span')?.textContent?.trim();
        if (label === 'Semester CGPA') {
          const complete = !model.missingCore.some(item => item[0] === 'Semester CGPA');
          row.classList.toggle('good', complete);
          row.classList.toggle('bad', !complete);
          const state = row.querySelector('strong:last-child');
          if (state) state.textContent = complete ? 'Complete' : 'Needs attention';
        }
      });
    }

    const strip = document.getElementById('profileActionStrip');
    if (strip) {
      const semesterMissing = model.missingCore.some(item => item[0] === 'Semester CGPA');
      strip.querySelectorAll('.profile-action-pill').forEach(button => {
        if (button.textContent.trim() === 'Semester CGPA' && !semesterMissing) button.remove();
      });
      const count = strip.querySelectorAll('.profile-action-pill').length;
      const copy = strip.querySelector('.profile-action-strip-copy span');
      if (copy) copy.textContent = `${count} section${count === 1 ? '' : 's'} still need attention.`;
      strip.hidden = count === 0;
    }

    setTabState('edit-profile', model.missingCore.length === 0 && (data.skills || []).length ? 'complete' : model.missingCore.length >= 4 ? 'missing' : 'partial');
  }

  async function refresh() {
    timer = null;
    try {
      const data = await api('/api/student/profile');
      let comps = [];
      try { comps = await api('/api/student/competitions'); } catch (_) {}
      patchUi(buildModel(data, comps), data);
    } catch (_) {}
  }

  function schedule(delay = 250) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }

  function boot() {
    schedule(350);
    const root = document.getElementById('dashboardContent') || document.body;
    new MutationObserver(() => schedule(120)).observe(root, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      if (event.target.closest('button[type="submit"], .btn')) schedule(900);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();