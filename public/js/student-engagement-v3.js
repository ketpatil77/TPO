(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const FEATURE_VERSION = '2026-09-02-engagement-v3';
  const token = () => localStorage.getItem('tpo_token');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let refreshTimer = null;
  let busy = false;
  let panelMode = null;
  let latest = null;

  const optionalSections = [
    { key:'no_internships', label:'Internships', tab:'internships', dataKey:'internships', points:'+6 each' },
    { key:'no_certificates', label:'Certificates', tab:'certificates', dataKey:'certificates', points:'Certificate scoring applies' },
    { key:'no_projects', label:'Projects', tab:'projects', dataKey:'projects', points:'+4 base, more with links' },
    { key:'no_research', label:'Research', tab:'research', dataKey:'research_papers', points:'+8 base when applicable' },
    { key:'no_competitions', label:'Competitions', tab:'competitions', dataKey:'competitions', points:'Points after verification' }
  ];

  async function api(path) {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token()}` } });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Could not load profile data.');
    return json.data;
  }

  function nameComplete(name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).length >= 3;
  }

  function semesterComplete(profile) {
    const student = profile.student || {};
    const semesters = student.cgpa_semesterwise || {};
    const start = (student.lateral_entry || profile.diploma) ? 3 : 1;
    const entered = [];
    for (let i = start; i <= 8; i++) if (Number(semesters[`sem${i}`]) > 0) entered.push(i);
    if (!entered.length) return false;
    const highest = Math.max(...entered);
    for (let i = start; i <= highest; i++) if (!(Number(semesters[`sem${i}`]) > 0)) return false;
    return true;
  }

  function buildModel(profile, competitions, declarations) {
    const student = profile.student || {};
    const core = [
      ['Full name', nameComplete(student.name), 'edit-profile'],
      ['Email', Boolean(String(student.email || '').trim()), 'edit-profile'],
      ['Phone', Boolean(String(student.phone || '').trim()), 'edit-profile'],
      ['Profile photo', Boolean(student.avatar_path), 'edit-profile'],
      ['SSC marks', Number(student.ssc_marks) > 0, 'edit-profile'],
      ['HSC / Diploma marks', Number(student.hsc_marks) > 0, 'edit-profile'],
      ['Semester CGPA', semesterComplete(profile), 'edit-profile'],
      ['Resume', Boolean(student.resume_url), 'edit-profile']
    ];
    const skillsComplete = (profile.skills || []).length > 0;
    const optional = optionalSections.map(section => {
      const records = section.dataKey === 'competitions' ? competitions : (profile[section.dataKey] || []);
      const declared = records.length === 0 && Boolean(declarations?.[section.key]);
      return { ...section, records: records.length, declared, resolved: records.length > 0 || declared };
    });
    const weightedDone = core.filter(item => item[1]).length * 2 + (skillsComplete ? 1 : 0) + optional.filter(item => item.resolved).length;
    const weightedTotal = core.length * 2 + 1 + optional.length;
    const percent = Math.round(weightedDone / weightedTotal * 100);
    return {
      core,
      optional,
      skillsComplete,
      missingCore: core.filter(item => !item[1]),
      unresolvedOptional: optional.filter(item => !item.resolved),
      percent,
      items: [...core, ['Skills', skillsComplete, 'edit-profile'], ...optional.map(item => [item.label, item.resolved, item.tab, item.declared])]
    };
  }

  function go(section) {
    const tab = document.querySelector(`[aria-controls="tab-${section}"]`);
    if (!tab) return;
    panelMode = null;
    tab.click();
    setTimeout(() => tab.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' }), 80);
  }

  function suggestions(model, profile) {
    const rows = [];
    model.missingCore.slice(0, 2).forEach(([label,,section]) => rows.push([`Complete ${label}`, 'Improves profile completeness', section]));
    if (!model.skillsComplete) rows.push(['Add relevant skills', '+0.5 each', 'edit-profile']);
    model.unresolvedOptional.forEach(item => rows.push([`Add ${item.label.toLowerCase()}`, item.points, item.tab]));
    return rows.slice(0, 6);
  }

  function renderPanel(card, model, profile) {
    card.querySelector('#profileQualityResult')?.remove();
    if (!panelMode) return;
    const host = document.createElement('div');
    host.id = 'profileQualityResult';
    host.className = 'profile-quality-result';
    host.style.gridColumn = '1 / -1';
    host.dataset.panelMode = panelMode;

    if (panelMode === 'quality') {
      host.innerHTML = model.items.map(([label, done,,,declared]) => `<div class="quality-row ${done ? 'good' : 'bad'}"><span>${esc(label)}</span><strong>${done ? (declared ? 'None declared' : 'Complete') : 'Needs attention'}</strong></div>`).join('');
    } else {
      const rows = suggestions(model, profile);
      host.innerHTML = `<div class="quality-row"><span><strong>Fastest legitimate ways to strengthen your score</strong></span><strong>Action</strong></div>${rows.length ? rows.map(([label,points,section]) => `<button type="button" class="quality-row" data-go="${esc(section)}" style="width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer"><span><strong>${esc(label)}</strong><br><small>${esc(points)}</small></span><strong>Open →</strong></button>`).join('') : '<div class="quality-row good"><span>Nothing unresolved right now.</span><strong>Complete</strong></div>'}`;
      host.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
    }
    card.appendChild(host);
  }

  function renderReadiness(model, profile) {
    const overview = document.getElementById('tab-overview');
    if (!overview) return;
    let card = document.getElementById('studentReadinessCard');
    let strip = document.getElementById('profileActionStrip');

    if (model.percent === 100) {
      if (card) card.hidden = true;
      if (strip) strip.hidden = true;
      return;
    }

    if (!card) {
      card = document.createElement('section');
      card.id = 'studentReadinessCard';
      card.className = 'glass-card student-readiness-card';
      overview.prepend(card);
    }
    card.hidden = false;
    const status = model.percent >= 90 ? 'Placement Ready' : model.percent >= 70 ? 'Strong profile' : model.percent >= 45 ? 'Building profile' : 'Needs attention';
    const updated = profile.student?.updated_at ? new Date(profile.student.updated_at) : null;
    const updatedText = updated && !Number.isNaN(updated.getTime()) ? `Updated ${updated.toLocaleDateString(undefined,{day:'numeric',month:'short'})}` : 'Keep details current';
    const unresolved = model.missingCore.length + (model.skillsComplete ? 0 : 1) + model.unresolvedOptional.length;
    card.innerHTML = `<div class="readiness-ring" style="--completion:${model.percent}"><strong>${model.percent}%</strong><span>complete</span></div><div class="readiness-copy"><span class="eyebrow">Placement readiness</span><h3>${status}</h3><p>${model.missingCore.length ? `${model.missingCore.length} important profile item${model.missingCore.length === 1 ? '' : 's'} need attention.` : 'Core details are complete. Resolve the remaining profile sections below.'}</p><div class="readiness-meta"><span class="readiness-chip ${model.missingCore.length ? 'warn' : 'good'}">${model.missingCore.length ? `${model.missingCore.length} required missing` : 'Core details complete'}</span><span class="readiness-chip">${updatedText}</span></div></div><div class="readiness-actions"><button class="btn btn-secondary btn-sm" id="profileQualityCheck" type="button">Profile check</button><button class="btn btn-primary btn-sm" id="improveMyRank" type="button">Improve my rank</button></div>`;
    card.querySelector('#profileQualityCheck').onclick = () => { panelMode = panelMode === 'quality' ? null : 'quality'; renderPanel(card, model, profile); };
    card.querySelector('#improveMyRank').onclick = () => { panelMode = panelMode === 'improve' ? null : 'improve'; renderPanel(card, model, profile); };
    renderPanel(card, model, profile);

    if (!strip) {
      strip = document.createElement('section');
      strip.id = 'profileActionStrip';
      strip.className = 'glass-card profile-action-strip';
      const rank = document.getElementById('overviewRankSpotlight');
      if (rank) rank.after(strip); else overview.appendChild(strip);
    }
    const actions = [
      ...model.missingCore.map(([label,,section]) => [label,section]),
      ...(model.skillsComplete ? [] : [['Skills','edit-profile']]),
      ...model.unresolvedOptional.map(item => [item.label,item.tab])
    ].slice(0,6);
    strip.hidden = actions.length === 0;
    if (actions.length) {
      strip.innerHTML = `<div class="profile-action-strip-copy"><strong>Finish your strongest profile</strong><span>${unresolved} section${unresolved === 1 ? '' : 's'} still need attention.</span></div><div class="profile-action-items">${actions.map(([label,section]) => `<button type="button" class="profile-action-pill" data-go="${esc(section)}">${esc(label)}</button>`).join('')}</div>`;
      strip.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
    }
  }

  function addNewBadge(button, key) {
    if (!button || button.querySelector('.student-new-badge')) return;
    const seenKey = `ait-feature-seen:${FEATURE_VERSION}:${key}`;
    const badge = document.createElement('span');
    badge.className = `student-new-badge${localStorage.getItem(seenKey) ? '' : ' is-fresh'}`;
    badge.textContent = 'NEW';
    button.appendChild(badge);
    button.addEventListener('click', () => { localStorage.setItem(seenKey,'1'); badge.classList.remove('is-fresh'); }, { passive:true });
  }

  function wireBadges() {
    addNewBadge(document.querySelector('[aria-controls="tab-competitions"]'), 'competitions');
    addNewBadge(document.querySelector('[aria-controls="tab-ranking"]'), 'ranking');
  }

  function installPointPreviews() {
    const definitions = [
      ['certForm','Certificate points','Certificates are rewarded progressively; earlier certificates carry more weight.'],
      ['projectForm','Project points','Projects earn a base score, with bonuses for valid repository and live links.'],
      ['internshipForm','Internship points','Each internship can add profile points when saved.'],
      ['researchForm','Research points','Research can earn base points plus valid DOI / paper-link bonuses.'],
      ['competitionForm','Competition points','Competition points become active after TPO/TPC verification.']
    ];
    definitions.forEach(([id,title,text]) => {
      const form = document.getElementById(id);
      if (!form || form.querySelector('.points-preview')) return;
      const submit = form.querySelector('button[type="submit"]');
      if (!submit) return;
      const note = document.createElement('div');
      note.className = 'points-preview';
      note.innerHTML = `<strong>${title}</strong> · ${text}`;
      submit.before(note);
    });
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    clearTimeout(refreshTimer);
    refreshTimer = null;
    try {
      const [profile, competitions, declarations] = await Promise.all([
        api('/api/student/profile'),
        api('/api/student/competitions').catch(() => []),
        api('/api/student/profile-declarations').catch(() => ({}))
      ]);
      const model = buildModel(profile, competitions, declarations);
      latest = { profile, competitions, declarations, model };
      wireBadges();
      renderReadiness(model, profile);
      installPointPreviews();
    } catch (error) {
      console.warn('Student engagement unavailable:', error.message);
    } finally {
      busy = false;
    }
  }

  function scheduleRefresh(delay = 250) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  function boot() {
    wireBadges();
    installPointPreviews();
    scheduleRefresh(180);
    const root = document.getElementById('dashboardContent') || document.body;
    new MutationObserver(() => { wireBadges(); installPointPreviews(); }).observe(root,{childList:true,subtree:true});
    document.addEventListener('click', event => {
      if (event.target.closest('button[type="submit"], .profile-none-btn')) scheduleRefresh(900);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
