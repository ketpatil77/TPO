(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const token = () => localStorage.getItem('tpo_token');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const FEATURE_VERSION = '2026-09-02-engagement-v1';
  let profileData = null;
  let competitions = [];
  let lastComplete = new Map();

  async function api(path) {
    const response = await fetch(path, { headers:{ Authorization:`Bearer ${token()}` } });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Could not load profile data.');
    return json.data;
  }

  function addNewBadge(button, key) {
    if (!button || button.querySelector('.student-new-badge')) return;
    const seenKey = `ait-feature-seen:${FEATURE_VERSION}:${key}`;
    const badge = document.createElement('span');
    badge.className = `student-new-badge${localStorage.getItem(seenKey) ? '' : ' is-fresh'}`;
    badge.textContent = 'NEW';
    badge.setAttribute('aria-label', 'New feature');
    button.appendChild(badge);
    button.addEventListener('click', () => {
      localStorage.setItem(seenKey, '1');
      badge.classList.remove('is-fresh');
    }, { passive:true });
  }

  function wireNewBadges() {
    addNewBadge(document.querySelector('[aria-controls="tab-competitions"]'), 'competitions');
    addNewBadge(document.querySelector('[aria-controls="tab-ranking"]'), 'ranking');
  }

  function countNameParts(name) { return String(name || '').trim().split(/\s+/).filter(Boolean).length; }
  function semExpected(student) {
    const year = String(student.year || '');
    const max = year === 'Final Year' ? 8 : year === 'Third Year' ? 6 : year === 'Second Year' ? 4 : 2;
    const start = student.lateral_entry ? 3 : 1;
    return { start, max };
  }

  function completionModel(data, comps) {
    const s = data.student || {};
    const sem = s.cgpa_semesterwise || {};
    const expected = semExpected(s);
    const semesterComplete = Array.from({length:Math.max(0, expected.max - expected.start + 1)}, (_,i) => expected.start + i)
      .every(i => Number(sem[`sem${i}`]) > 0);
    const core = [
      ['Full name', countNameParts(s.name) >= 3, 'edit-profile'],
      ['Email', Boolean(String(s.email || '').trim()), 'edit-profile'],
      ['Phone', Boolean(String(s.phone || '').trim()), 'edit-profile'],
      ['Profile photo', Boolean(s.avatar_path), 'edit-profile'],
      ['SSC marks', Number(s.ssc_marks) > 0, 'edit-profile'],
      ['HSC / Diploma marks', Number(s.hsc_marks) > 0, 'edit-profile'],
      ['Semester CGPA', semesterComplete, 'edit-profile'],
      ['Resume', Boolean(s.resume_url), 'edit-profile']
    ];
    const enrichment = [
      ['Skills', (data.skills || []).length > 0, 'edit-profile'],
      ['Internships', (data.internships || []).length > 0, 'internships'],
      ['Certificates', (data.certificates || []).length > 0, 'certificates'],
      ['Projects', (data.projects || []).length > 0, 'projects'],
      ['Research', (data.research_papers || []).length > 0, 'research'],
      ['Competitions', comps.length > 0, 'competitions']
    ];
    const items = [...core, ...enrichment];
    const weightedDone = core.filter(x=>x[1]).length * 2 + enrichment.filter(x=>x[1]).length;
    const weightedTotal = core.length * 2 + enrichment.length;
    return { core, enrichment, items, percent:Math.round((weightedDone / weightedTotal) * 100), missingCore:core.filter(x=>!x[1]), missingEnrichment:enrichment.filter(x=>!x[1]) };
  }

  function setTabState(control, state) {
    const tab = document.querySelector(`[aria-controls="tab-${control}"]`);
    if (!tab) return;
    tab.classList.remove('profile-state-complete','profile-state-partial','profile-state-missing');
    tab.classList.add(`profile-state-${state}`);
    tab.title = state === 'complete' ? 'Section complete' : state === 'partial' ? 'Section partially complete' : 'Section needs attention';
    const previous = lastComplete.get(control);
    if (previous === false && state === 'complete') {
      tab.classList.add('section-complete-flash');
      setTimeout(()=>tab.classList.remove('section-complete-flash'), 900);
    }
    lastComplete.set(control, state === 'complete');
  }

  function applySectionStates(model, data, comps) {
    setTabState('edit-profile', model.missingCore.length === 0 && (data.skills || []).length ? 'complete' : model.missingCore.length >= 4 ? 'missing' : 'partial');
    setTabState('internships', (data.internships || []).length ? 'complete' : 'missing');
    setTabState('certificates', (data.certificates || []).length ? 'complete' : 'missing');
    setTabState('projects', (data.projects || []).length ? 'complete' : 'missing');
    setTabState('research', (data.research_papers || []).length ? 'complete' : 'missing');
    setTabState('competitions', comps.length ? 'complete' : 'missing');
    const diploma = document.querySelector('[aria-controls="tab-diploma"]');
    if (diploma) setTabState('diploma', data.student?.lateral_entry ? (data.diploma ? 'complete' : 'partial') : 'complete');
  }

  function go(section) {
    const tab = document.querySelector(`[aria-controls="tab-${section}"]`);
    if (tab) { tab.click(); setTimeout(()=>tab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}), 80); }
  }

  function installActionStrip(model) {
    const overview = document.getElementById('tab-overview');
    if (!overview) return;
    let strip = document.getElementById('profileActionStrip');
    if (!strip) {
      strip = document.createElement('section');
      strip.id = 'profileActionStrip';
      strip.className = 'glass-card profile-action-strip';
      const rank = document.getElementById('overviewRankSpotlight');
      if (rank) rank.after(strip); else overview.prepend(strip);
    }
    const missing = [...model.missingCore, ...model.missingEnrichment].slice(0,6);
    strip.hidden = !missing.length;
    if (!missing.length) return;
    strip.innerHTML = `<div class="profile-action-strip-copy"><strong>Finish your strongest profile</strong><span>${missing.length} useful section${missing.length===1?'':'s'} still need attention.</span></div><div class="profile-action-items">${missing.map(([label,,section])=>`<button type="button" class="profile-action-pill" data-go="${esc(section)}">${esc(label)}</button>`).join('')}</div>`;
    strip.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
  }

  function installReadiness(model, data) {
    const overview = document.getElementById('tab-overview');
    if (!overview) return;
    let card = document.getElementById('studentReadinessCard');
    if (!card) {
      card = document.createElement('section');
      card.id = 'studentReadinessCard';
      card.className = 'glass-card student-readiness-card';
      overview.prepend(card);
    }
    const status = model.percent >= 90 ? 'Placement Ready' : model.percent >= 70 ? 'Strong profile' : model.percent >= 45 ? 'Building profile' : 'Needs attention';
    const missing = model.missingCore.length;
    const updated = data.student?.updated_at ? new Date(data.student.updated_at) : null;
    const updatedText = updated && !Number.isNaN(updated.getTime()) ? `Updated ${updated.toLocaleDateString(undefined,{day:'numeric',month:'short'})}` : 'Keep details current';
    card.innerHTML = `<div class="readiness-ring" style="--completion:${model.percent}"><strong>${model.percent}%</strong><span>complete</span></div><div class="readiness-copy"><span class="eyebrow">Placement readiness</span><h3>${status}</h3><p>${missing ? `${missing} important profile item${missing===1?'':'s'} need attention.` : 'Your essential profile details are complete. Keep adding achievements to stay competitive.'}</p><div class="readiness-meta"><span class="readiness-chip ${missing?'warn':'good'}">${missing?`${missing} required missing`:'Core details complete'}</span><span class="readiness-chip">${updatedText}</span></div></div><div class="readiness-actions"><button class="btn btn-secondary btn-sm" id="profileQualityCheck">Profile check</button><button class="btn btn-primary btn-sm" id="improveMyRank">Improve my rank</button></div>`;
    document.getElementById('profileQualityCheck').onclick = () => showQuality(model);
    document.getElementById('improveMyRank').onclick = () => showImproveRank(model, data);
  }

  function showQuality(model) {
    const existing = document.getElementById('profileQualityResult');
    if (existing) { existing.remove(); return; }
    const card = document.getElementById('studentReadinessCard');
    const result = document.createElement('div');
    result.id = 'profileQualityResult';
    result.className = 'profile-quality-result';
    result.style.gridColumn = '1 / -1';
    result.innerHTML = model.items.map(([label,done])=>`<div class="quality-row ${done?'good':'bad'}"><span>${esc(label)}</span><strong>${done?'Complete':'Needs attention'}</strong></div>`).join('');
    card.appendChild(result);
  }

  function suggestionRows(model, data) {
    const rows = [];
    if (!data.student?.resume_url) rows.push(['Upload resume','+3 profile points','edit-profile']);
    if (!(data.skills||[]).length) rows.push(['Add relevant skills','+0.5 each, up to scoring limit','edit-profile']);
    if (!(data.projects||[]).length) rows.push(['Add your best project','+4 base, more with repo/live links','projects']);
    if (!(data.certificates||[]).length) rows.push(['Add certifications','First certificates earn the most points','certificates']);
    if (!(data.internships||[]).length) rows.push(['Add internship experience','+6 each','internships']);
    if (!competitions.length) rows.push(['Add competition achievements','Points count after verification','competitions']);
    if (!(data.research_papers||[]).length) rows.push(['Add published research','+8 base when applicable','research']);
    model.missingCore.slice(0,2).forEach(([label,,section]) => rows.unshift([`Complete ${label}`,'Improves profile completeness',section]));
    return rows.slice(0,6);
  }

  function showImproveRank(model, data) {
    let host = document.getElementById('profileQualityResult');
    if (host) host.remove();
    host = document.createElement('div');
    host.id = 'profileQualityResult';
    host.className = 'profile-quality-result';
    host.style.gridColumn = '1 / -1';
    const rows = suggestionRows(model,data);
    host.innerHTML = `<div class="quality-row"><span><strong>Fastest legitimate ways to strengthen your score</strong></span><strong>Action</strong></div>${rows.map(([label,points,section])=>`<button type="button" class="quality-row" data-go="${esc(section)}" style="width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer"><span><strong>${esc(label)}</strong><br><small>${esc(points)}</small></span><strong>Open →</strong></button>`).join('')}`;
    document.getElementById('studentReadinessCard').appendChild(host);
    host.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>go(button.dataset.go));
  }

  async function installRankTarget() {
    const summary = document.getElementById('rankingMySummary');
    if (!summary || summary.querySelector('.rank-next-card')) return;
    try {
      const data = await api('/api/student/rankings-view/profile?branch=all&year=all');
      const me = data.current;
      if (!me) return;
      const target = data.rows.find(row => row.rank < me.rank && Number(row.points) > Number(me.points));
      const box = document.createElement('div');
      box.className = 'rank-next-card';
      if (!target) {
        box.innerHTML = `<div><strong>You’re #1 college-wide 👑</strong><br><span>Defend it by keeping your profile current.</span></div>`;
      } else {
        const gap = Math.max(.01, Number(target.points)-Number(me.points));
        const pct = Math.max(8, Math.min(96, Math.round((Number(me.points)/(Number(target.points)||1))*100)));
        box.innerHTML = `<div><strong>${fmt(gap)} more points to challenge #${target.rank}</strong><br><span>${esc(target.name)}</span></div><div class="rank-next-progress" aria-label="Progress to next rank"><i style="width:${pct}%"></i></div>`;
      }
      summary.appendChild(box);
      const hero = document.querySelector('.ranking-hero .eyebrow');
      if (hero && !document.getElementById('rankingSeason')) {
        const season = document.createElement('span');
        season.id = 'rankingSeason';
        season.className = 'readiness-chip';
        season.style.marginLeft = '.5rem';
        season.textContent = `${new Date().toLocaleString(undefined,{month:'long',year:'numeric'})} season`;
        hero.after(season);
      }
    } catch (_) { /* ranking remains fully usable without guidance */ }
  }

  function installPointPreviews() {
    const definitions = [
      ['certForm','Certificate points','Certificates are rewarded progressively; earlier certificates carry more weight.'],
      ['projectForm','Project points','Projects earn a base score, with additional points for valid repository and live links.'],
      ['internshipForm','Internship points','Each internship can add profile points when saved.'],
      ['researchForm','Research points','Published research can earn base points plus valid DOI / paper-link bonuses.'],
      ['competitionForm','Competition points','Competition points become active after TPO/TPC verification.']
    ];
    definitions.forEach(([id,title,text])=>{
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

  function maybeTour() {
    const key = `ait-feature-tour:${FEATURE_VERSION}`;
    if (localStorage.getItem(key)) return;
    const modal = document.createElement('div');
    modal.className = 'student-feature-tour';
    modal.innerHTML = `<section class="glass-card student-feature-tour-card"><div class="feature-tour-top"><div><span class="eyebrow">What’s new</span><h2>Your portal just got smarter</h2><p>Three quick changes worth knowing. No twelve-slide onboarding ceremony.</p></div><span class="student-new-badge is-fresh">NEW</span></div><div class="feature-tour-list"><div class="feature-tour-item"><div class="feature-tour-icon">🏆</div><div><strong>Profile Ranking</strong><span>See your standing, points and exactly why you earned them.</span></div></div><div class="feature-tour-item"><div class="feature-tour-icon">🏅</div><div><strong>Competitions</strong><span>Add hackathons, Aavishkar, coding contests and other achievements for verification.</span></div></div><div class="feature-tour-item"><div class="feature-tour-icon">✓</div><div><strong>Smart profile status</strong><span>Red needs attention, amber is partial, green means the section is complete.</span></div></div></div><div class="feature-tour-footer"><button class="btn btn-primary" type="button">Explore portal</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('button').onclick = () => { localStorage.setItem(key,'1'); modal.remove(); };
  }

  async function refresh() {
    try {
      profileData = await api('/api/student/profile');
      try { competitions = await api('/api/student/competitions'); } catch (_) { competitions = []; }
      const model = completionModel(profileData, competitions);
      wireNewBadges();
      installReadiness(model, profileData);
      installActionStrip(model);
      applySectionStates(model, profileData, competitions);
      installPointPreviews();
      installRankTarget();
    } catch (_) { /* enhancement must never break the base dashboard */ }
  }

  function observeDynamicUi() {
    const root = document.getElementById('dashboardContent') || document.body;
    const observer = new MutationObserver(() => {
      wireNewBadges();
      installPointPreviews();
      installRankTarget();
    });
    observer.observe(root,{childList:true,subtree:true});
  }

  document.addEventListener('DOMContentLoaded', () => {
    observeDynamicUi();
    setTimeout(() => { refresh(); maybeTour(); }, 700);
    document.addEventListener('click', event => {
      if (event.target.closest('button[type="submit"], .btn')) setTimeout(refresh, 900);
    });
  });
})();
