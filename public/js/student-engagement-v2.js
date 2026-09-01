(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const FEATURE_VERSION = '2026-09-02-engagement-v2';
  const token = () => localStorage.getItem('tpo_token');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  let profileData = null;
  let competitions = [];
  let refreshTimer = null;

  async function api(path) {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token()}` } });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Could not load profile data.');
    return json.data;
  }

  function nameParts(name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).length;
  }

  function expectedSemesters(student) {
    const year = String(student.year || '');
    const max = year === 'Final Year' ? 8 : year === 'Third Year' ? 6 : year === 'Second Year' ? 4 : 2;
    const start = student.lateral_entry ? 3 : 1;
    return { start, max };
  }

  function model(data, comps) {
    const s = data.student || {};
    const semesters = s.cgpa_semesterwise || {};
    const expected = expectedSemesters(s);
    const semesterComplete = Array.from({ length: Math.max(0, expected.max - expected.start + 1) }, (_, i) => expected.start + i)
      .every(i => Number(semesters[`sem${i}`]) > 0);

    const core = [
      ['Full name', nameParts(s.name) >= 3, 'edit-profile'],
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

    const weightedDone = core.filter(x => x[1]).length * 2 + enrichment.filter(x => x[1]).length;
    const weightedTotal = core.length * 2 + enrichment.length;
    return {
      core,
      enrichment,
      items: [...core, ...enrichment],
      missingCore: core.filter(x => !x[1]),
      missingEnrichment: enrichment.filter(x => !x[1]),
      percent: Math.round(weightedDone / weightedTotal * 100)
    };
  }

  function addNewBadge(button, key) {
    if (!button || button.querySelector('.student-new-badge')) return;
    const seenKey = `ait-feature-seen:${FEATURE_VERSION}:${key}`;
    const badge = document.createElement('span');
    badge.className = `student-new-badge${localStorage.getItem(seenKey) ? '' : ' is-fresh'}`;
    badge.textContent = 'NEW';
    button.appendChild(badge);
    button.addEventListener('click', () => {
      localStorage.setItem(seenKey, '1');
      badge.classList.remove('is-fresh');
    }, { passive: true });
  }

  function wireNewBadges() {
    addNewBadge(document.querySelector('[aria-controls="tab-competitions"]'), 'competitions');
    addNewBadge(document.querySelector('[aria-controls="tab-ranking"]'), 'ranking');
  }

  function setTabState(control, state) {
    const tab = document.querySelector(`[aria-controls="tab-${control}"]`);
    if (!tab) return;
    tab.classList.remove('profile-state-complete', 'profile-state-partial', 'profile-state-missing');
    tab.classList.add(`profile-state-${state}`);
    tab.title = state === 'complete' ? 'Section complete' : state === 'partial' ? 'Section partially complete' : 'Section needs attention';
  }

  function applySectionStates(m, data, comps) {
    setTabState('edit-profile', m.missingCore.length === 0 && (data.skills || []).length ? 'complete' : m.missingCore.length >= 4 ? 'missing' : 'partial');
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
    if (!tab) return;
    tab.click();
    setTimeout(() => tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 80);
  }

  function installReadiness(m, data) {
    const overview = document.getElementById('tab-overview');
    if (!overview) return;
    let card = document.getElementById('studentReadinessCard');
    if (!card) {
      card = document.createElement('section');
      card.id = 'studentReadinessCard';
      card.className = 'glass-card student-readiness-card';
      overview.prepend(card);
    }
    const status = m.percent >= 90 ? 'Placement Ready' : m.percent >= 70 ? 'Strong profile' : m.percent >= 45 ? 'Building profile' : 'Needs attention';
    const updated = data.student?.updated_at ? new Date(data.student.updated_at) : null;
    const updatedText = updated && !Number.isNaN(updated.getTime()) ? `Updated ${updated.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Keep details current';
    card.innerHTML = `<div class="readiness-ring" style="--completion:${m.percent}"><strong>${m.percent}%</strong><span>complete</span></div><div class="readiness-copy"><span class="eyebrow">Placement readiness</span><h3>${status}</h3><p>${m.missingCore.length ? `${m.missingCore.length} important profile item${m.missingCore.length === 1 ? '' : 's'} need attention.` : 'Your essential details are complete. Keep adding achievements to stay competitive.'}</p><div class="readiness-meta"><span class="readiness-chip ${m.missingCore.length ? 'warn' : 'good'}">${m.missingCore.length ? `${m.missingCore.length} required missing` : 'Core details complete'}</span><span class="readiness-chip">${updatedText}</span></div></div><div class="readiness-actions"><button class="btn btn-secondary btn-sm" id="profileQualityCheck">Profile check</button><button class="btn btn-primary btn-sm" id="improveMyRank">Improve my rank</button></div>`;
    document.getElementById('profileQualityCheck').onclick = () => showQuality(m);
    document.getElementById('improveMyRank').onclick = () => showImproveRank(m, data);
  }

  function installActionStrip(m) {
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
    const missing = [...m.missingCore, ...m.missingEnrichment].slice(0, 6);
    strip.hidden = !missing.length;
    if (!missing.length) return;
    strip.innerHTML = `<div class="profile-action-strip-copy"><strong>Finish your strongest profile</strong><span>${missing.length} section${missing.length === 1 ? '' : 's'} still need attention.</span></div><div class="profile-action-items">${missing.map(([label, , section]) => `<button type="button" class="profile-action-pill" data-go="${esc(section)}">${esc(label)}</button>`).join('')}</div>`;
    strip.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
  }

  function showQuality(m) {
    const existing = document.getElementById('profileQualityResult');
    if (existing) { existing.remove(); return; }
    const host = document.createElement('div');
    host.id = 'profileQualityResult';
    host.className = 'profile-quality-result';
    host.style.gridColumn = '1 / -1';
    host.innerHTML = m.items.map(([label, done]) => `<div class="quality-row ${done ? 'good' : 'bad'}"><span>${esc(label)}</span><strong>${done ? 'Complete' : 'Needs attention'}</strong></div>`).join('');
    document.getElementById('studentReadinessCard')?.appendChild(host);
  }

  function suggestions(m, data) {
    const rows = [];
    m.missingCore.slice(0, 2).forEach(([label, , section]) => rows.push([`Complete ${label}`, 'Improves profile completeness', section]));
    if (!data.student?.resume_url) rows.push(['Upload resume', '+3 profile points', 'edit-profile']);
    if (!(data.skills || []).length) rows.push(['Add relevant skills', '+0.5 each', 'edit-profile']);
    if (!(data.projects || []).length) rows.push(['Add your best project', '+4 base, more with links', 'projects']);
    if (!(data.certificates || []).length) rows.push(['Add certifications', 'Earlier certificates earn more', 'certificates']);
    if (!(data.internships || []).length) rows.push(['Add internship experience', '+6 each', 'internships']);
    if (!competitions.length) rows.push(['Add competition achievements', 'Points after verification', 'competitions']);
    if (!(data.research_papers || []).length) rows.push(['Add published research', '+8 base when applicable', 'research']);
    return rows.slice(0, 6);
  }

  function showImproveRank(m, data) {
    document.getElementById('profileQualityResult')?.remove();
    const host = document.createElement('div');
    host.id = 'profileQualityResult';
    host.className = 'profile-quality-result';
    host.style.gridColumn = '1 / -1';
    host.innerHTML = `<div class="quality-row"><span><strong>Fastest legitimate ways to strengthen your score</strong></span><strong>Action</strong></div>${suggestions(m, data).map(([label, points, section]) => `<button type="button" class="quality-row" data-go="${esc(section)}" style="width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer"><span><strong>${esc(label)}</strong><br><small>${esc(points)}</small></span><strong>Open →</strong></button>`).join('')}`;
    document.getElementById('studentReadinessCard')?.appendChild(host);
    host.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
  }

  function installPointPreviews() {
    const definitions = [
      ['certForm', 'Certificate points', 'Certificates are rewarded progressively; earlier certificates carry more weight.'],
      ['projectForm', 'Project points', 'Projects earn a base score, with bonuses for valid repository and live links.'],
      ['internshipForm', 'Internship points', 'Each internship can add profile points when saved.'],
      ['researchForm', 'Research points', 'Research can earn base points plus valid DOI / paper-link bonuses.'],
      ['competitionForm', 'Competition points', 'Competition points become active after TPO/TPC verification.']
    ];
    definitions.forEach(([id, title, text]) => {
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
      if (!target) box.innerHTML = `<div><strong>You’re #1 college-wide 👑</strong><br><span>Defend it by keeping your profile current.</span></div>`;
      else {
        const gap = Math.max(.01, Number(target.points) - Number(me.points));
        const pct = Math.max(8, Math.min(96, Math.round(Number(me.points) / (Number(target.points) || 1) * 100)));
        box.innerHTML = `<div><strong>${fmt(gap)} more points to challenge #${target.rank}</strong><br><span>${esc(target.name)}</span></div><div class="rank-next-progress"><i style="width:${pct}%"></i></div>`;
      }
      summary.appendChild(box);
      const hero = document.querySelector('.ranking-hero .eyebrow');
      if (hero && !document.getElementById('rankingSeason')) {
        const season = document.createElement('span');
        season.id = 'rankingSeason';
        season.className = 'readiness-chip';
        season.style.marginLeft = '.5rem';
        season.textContent = `${new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })} season`;
        hero.after(season);
      }
    } catch (_) {}
  }

  function maybeTour() {
    const key = `ait-feature-tour:${FEATURE_VERSION}`;
    if (localStorage.getItem(key)) return;
    const modal = document.createElement('div');
    modal.className = 'student-feature-tour';
    modal.innerHTML = `<section class="glass-card student-feature-tour-card"><div class="feature-tour-top"><div><span class="eyebrow">What’s new</span><h2>Your portal just got smarter</h2><p>Three quick changes worth knowing.</p></div><span class="student-new-badge is-fresh">NEW</span></div><div class="feature-tour-list"><div class="feature-tour-item"><div class="feature-tour-icon">🏆</div><div><strong>Profile Ranking</strong><span>See your standing, points and why you earned them.</span></div></div><div class="feature-tour-item"><div class="feature-tour-icon">🏅</div><div><strong>Competitions</strong><span>Add hackathons, Aavishkar, coding contests and other achievements.</span></div></div><div class="feature-tour-item"><div class="feature-tour-icon">✓</div><div><strong>Smart profile status</strong><span>Red needs attention, amber is partial, green means complete.</span></div></div></div><div class="feature-tour-footer"><button class="btn btn-primary" type="button">Explore portal</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('button').onclick = () => { localStorage.setItem(key, '1'); modal.remove(); };
  }

  async function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    try {
      profileData = await api('/api/student/profile');
      try { competitions = await api('/api/student/competitions'); } catch (_) { competitions = []; }
      const m = model(profileData, competitions);
      wireNewBadges();
      installReadiness(m, profileData);
      installActionStrip(m);
      applySectionStates(m, profileData, competitions);
      installPointPreviews();
      installRankTarget();
    } catch (error) {
      console.warn('Student engagement enhancements unavailable:', error);
    }
  }

  function scheduleRefresh(delay = 250) {
    if (refreshTimer) return;
    refreshTimer = setTimeout(refresh, delay);
  }

  function observeDynamicUi() {
    const root = document.getElementById('dashboardContent') || document.body;
    const observer = new MutationObserver(() => {
      wireNewBadges();
      installPointPreviews();
      installRankTarget();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function boot() {
    observeDynamicUi();
    wireNewBadges();
    installPointPreviews();
    scheduleRefresh(150);
    setTimeout(maybeTour, 650);
    document.addEventListener('click', event => {
      if (event.target.closest('button[type="submit"], .btn')) scheduleRefresh(900);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();