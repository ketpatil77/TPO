(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const token = () => localStorage.getItem('tpo_token');
  let timer = null;
  let busy = false;

  const optionalSections = [
    { key:'no_certificates', label:'Certifications', singular:'certification', tab:'certificates', panel:'tab-certificates', list:'certificatesList', dataKey:'certificates' },
    { key:'no_projects', label:'Projects', singular:'project', tab:'projects', panel:'tab-projects', list:'projectsList', dataKey:'projects' },
    { key:'no_research', label:'Research papers', singular:'research paper', tab:'research', panel:'tab-research', list:'researchList', dataKey:'research_papers' },
    { key:'no_internships', label:'Internships', singular:'internship', tab:'internships', panel:'tab-internships', list:'internshipsList', dataKey:'internships' },
    { key:'no_competitions', label:'Competitions', singular:'competition', tab:'competitions', panel:'tab-competitions', list:'competitionsList', dataKey:'competitions' }
  ];

  function csrfToken() {
    const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  async function api(path, options = {}) {
    const headers = { Authorization:`Bearer ${token()}`, ...(options.headers || {}) };
    const csrf = csrfToken();
    if (csrf && options.method && options.method !== 'GET') headers['x-csrf-token'] = csrf;
    const response = await fetch(path, { ...options, headers });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Request failed');
    return json.data;
  }

  function semesterComplete(data) {
    const s = data.student || {};
    const semesters = s.cgpa_semesterwise || {};
    const start = (s.lateral_entry || data.diploma) ? 3 : 1;
    const entered = [];
    for (let i = start; i <= 8; i++) if (Number(semesters[`sem${i}`]) > 0) entered.push(i);
    if (!entered.length) return false;
    const highest = Math.max(...entered);
    for (let i = start; i <= highest; i++) if (!(Number(semesters[`sem${i}`]) > 0)) return false;
    return true;
  }

  function nameComplete(name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).length >= 3;
  }

  function setTabState(control, state, declared = false) {
    const tab = document.querySelector(`[aria-controls="tab-${control}"]`);
    if (!tab) return;
    tab.classList.remove('profile-state-complete','profile-state-partial','profile-state-missing','profile-state-declared');
    if (declared) {
      tab.classList.add('profile-state-declared');
      tab.title = 'No record currently declared';
    } else {
      tab.classList.add(`profile-state-${state}`);
      tab.title = state === 'complete' ? 'Section complete' : state === 'partial' ? 'Section partially complete' : 'Section needs attention';
    }
  }

  function buildModel(profile, comps, declarations) {
    const s = profile.student || {};
    const core = [
      ['Full name', nameComplete(s.name), 'edit-profile'],
      ['Email', Boolean(String(s.email || '').trim()), 'edit-profile'],
      ['Phone', Boolean(String(s.phone || '').trim()), 'edit-profile'],
      ['Profile photo', Boolean(s.avatar_path), 'edit-profile'],
      ['SSC marks', Number(s.ssc_marks) > 0, 'edit-profile'],
      ['HSC / Diploma marks', Number(s.hsc_marks) > 0, 'edit-profile'],
      ['Semester CGPA', semesterComplete(profile), 'edit-profile'],
      ['Resume', Boolean(s.resume_url), 'edit-profile']
    ];
    const skillsComplete = (profile.skills || []).length > 0;
    const resolvedOptional = new Map();
    optionalSections.forEach(section => {
      const records = section.dataKey === 'competitions' ? comps : (profile[section.dataKey] || []);
      resolvedOptional.set(section.tab, { resolved: records.length > 0 || Boolean(declarations[section.key]), records: records.length, declared: records.length === 0 && Boolean(declarations[section.key]), section });
    });
    const optionalDone = [...resolvedOptional.values()].filter(item => item.resolved).length;
    const weightedDone = core.filter(item => item[1]).length * 2 + (skillsComplete ? 1 : 0) + optionalDone;
    const weightedTotal = core.length * 2 + 1 + optionalSections.length;
    return {
      core,
      missingCore: core.filter(item => !item[1]),
      skillsComplete,
      resolvedOptional,
      percent: Math.round(weightedDone / weightedTotal * 100)
    };
  }

  async function saveDeclaration(key, value) {
    return api('/api/student/profile-declarations', {
      method:'PUT',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ [key]: value })
    });
  }

  function declarationControl(item, declarations) {
    const panel = document.getElementById(item.section.panel);
    if (!panel) return;
    let box = panel.querySelector(`[data-profile-none="${item.section.key}"]`);
    if (item.records > 0) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'profile-none-declaration';
      box.dataset.profileNone = item.section.key;
      const header = panel.querySelector('.section-header');
      if (header) header.after(box); else panel.prepend(box);
    }
    const declared = Boolean(declarations[item.section.key]);
    box.classList.toggle('is-declared', declared);
    box.innerHTML = `<div class="profile-none-declaration-copy"><strong>${declared ? `No ${item.section.label.toLowerCase()} currently` : `Nothing to add here right now?`}</strong><span>${declared ? `This section is treated as resolved for profile completion. It gives zero leaderboard points.` : `If you genuinely have no ${item.section.label.toLowerCase()}, declare it once so the portal stops asking for it.`}</span></div><button type="button" class="btn btn-secondary btn-sm profile-none-btn ${declared ? 'is-declared' : ''}">${declared ? 'Undo declaration' : `I have no ${item.section.singular}`}</button>`;
    box.querySelector('button').onclick = async () => {
      const button = box.querySelector('button');
      button.disabled = true;
      try {
        await saveDeclaration(item.section.key, !declared);
        window.showToast?.(!declared ? `${item.section.label}: marked as none currently.` : `${item.section.label}: declaration removed.`, 'success');
        schedule(50);
      } catch (error) {
        window.showToast?.(error.message, 'error') || alert(error.message);
      } finally {
        button.disabled = false;
      }
    };
  }

  async function clearStaleDeclarations(model, declarations) {
    const changes = {};
    for (const item of model.resolvedOptional.values()) {
      if (item.records > 0 && declarations[item.section.key]) changes[item.section.key] = false;
    }
    if (!Object.keys(changes).length) return declarations;
    try {
      return await api('/api/student/profile-declarations', {
        method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(changes)
      });
    } catch (_) {
      return declarations;
    }
  }

  function patchReadiness(model) {
    const card = document.getElementById('studentReadinessCard');
    const strip = document.getElementById('profileActionStrip');

    if (model.percent === 100) {
      if (card) card.hidden = true;
      if (strip) strip.hidden = true;
      return;
    }
    if (card) {
      card.hidden = false;
      const ring = card.querySelector('.readiness-ring');
      if (ring) {
        ring.style.setProperty('--completion', model.percent);
        const value = ring.querySelector('strong');
        if (value) value.textContent = `${model.percent}%`;
      }
      const heading = card.querySelector('.readiness-copy h3');
      if (heading) heading.textContent = model.percent >= 90 ? 'Placement Ready' : model.percent >= 70 ? 'Strong profile' : model.percent >= 45 ? 'Building profile' : 'Needs attention';
      const message = card.querySelector('.readiness-copy p');
      if (message) message.textContent = model.missingCore.length ? `${model.missingCore.length} important profile item${model.missingCore.length === 1 ? '' : 's'} need attention.` : 'Core details are complete. Resolve the remaining profile sections below.';
      const chip = card.querySelector('.readiness-meta .readiness-chip');
      if (chip) {
        chip.classList.toggle('warn', model.missingCore.length > 0);
        chip.classList.toggle('good', model.missingCore.length === 0);
        chip.textContent = model.missingCore.length ? `${model.missingCore.length} required missing` : 'Core details complete';
      }
    }

    const semesterMissing = model.missingCore.some(item => item[0] === 'Semester CGPA');
    document.querySelectorAll('#profileQualityResult .quality-row').forEach(row => {
      const text = row.textContent || '';
      if (!semesterMissing && /Semester CGPA/i.test(text)) row.remove();
      for (const item of model.resolvedOptional.values()) {
        if (item.declared && new RegExp(item.section.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i').test(text)) {
          row.classList.remove('bad'); row.classList.add('good');
          const state = row.querySelector('strong:last-child');
          if (state) state.textContent = 'None declared';
        }
      }
    });

    if (strip) {
      strip.hidden = false;
      strip.querySelectorAll('.profile-action-pill').forEach(button => {
        const label = button.textContent.trim();
        if (label === 'Semester CGPA' && !semesterMissing) button.remove();
        for (const item of model.resolvedOptional.values()) {
          if (item.resolved && label.toLowerCase().startsWith(item.section.label.toLowerCase().split(' ')[0])) button.remove();
        }
      });
      const count = strip.querySelectorAll('.profile-action-pill').length;
      const copy = strip.querySelector('.profile-action-strip-copy span');
      if (copy) copy.textContent = `${count} section${count === 1 ? '' : 's'} still need attention.`;
      strip.hidden = count === 0;
    }
  }

  function patchTabs(model) {
    setTabState('edit-profile', model.missingCore.length === 0 && model.skillsComplete ? 'complete' : model.missingCore.length >= 4 ? 'missing' : 'partial');
    for (const [tab, item] of model.resolvedOptional.entries()) {
      setTabState(tab, item.resolved ? 'complete' : 'missing', item.declared);
    }
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    timer = null;
    try {
      const [profile, declarations, comps] = await Promise.all([
        api('/api/student/profile'),
        api('/api/student/profile-declarations').catch(() => ({})),
        api('/api/student/competitions').catch(() => [])
      ]);
      let model = buildModel(profile, comps, declarations);
      const cleaned = await clearStaleDeclarations(model, declarations);
      model = buildModel(profile, comps, cleaned);
      patchReadiness(model);
      patchTabs(model);
      for (const item of model.resolvedOptional.values()) declarationControl(item, cleaned);
    } catch (error) {
      console.warn('Profile declaration UI unavailable:', error.message);
    } finally {
      busy = false;
    }
  }

  function schedule(delay = 180) {
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }

  function boot() {
    schedule(300);

    // Refresh only after actions that can actually change profile state.
    // The previous whole-dashboard MutationObserver created a feedback loop:
    // refresh -> DOM mutation -> observer -> refresh, continuously burning the main thread.
    document.addEventListener('click', event => {
      if (event.target.closest('.profile-none-btn, button[type="submit"], .item-actions .btn, .record-actions .btn')) schedule(700);
    });

    // When the user returns to the tab, do one cheap state sync instead of polling.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule(120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
