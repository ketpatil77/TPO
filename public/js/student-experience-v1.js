(() => {
  if (window.PortalStudentExperience) return;
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const STORAGE_PREFIX = 'ait-student-experience:';
  const SUCCESS_MESSAGES = ['Saved and ready.', 'Update locked in.', 'Profile refreshed.', 'That change is live.'];
  let currentContext = null;
  let currentCompletion = null;
  let audioContext = null;
  let successCursor = 0;

  function storageKey(name, studentId = '') { return `${STORAGE_PREFIX}${studentId}:${name}`; }
  function userMuted() { return localStorage.getItem(storageKey('muted')) === '1'; }
  function muted() { return userMuted(); }
  function setMuted(value, button = null) { localStorage.setItem(storageKey('muted'), value ? '1' : '0'); renderMuteToggle(button); }

  function tone(kind = 'soft') {
    if (muted()) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'milestone' ? 620 : 520, now);
      if (kind === 'milestone') oscillator.frequency.exponentialRampToValueAtTime(820, now + .18);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'milestone' ? .045 : .028, now + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'milestone' ? .22 : .12));
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + (kind === 'milestone' ? .24 : .14));
    } catch (_) {}
  }

  function haptic(kind = 'soft') {
    if (muted() || reduceMotion() || !navigator.vibrate) return;
    navigator.vibrate(kind === 'milestone' ? 90 : 60);
  }

  function feedback(kind = 'soft') { tone(kind); haptic(kind); }

  function renderMuteToggle(existingButton = null) {
    if (!document.body.classList.contains('student-dashboard-page')) return;
    const nav = document.querySelector('.navbar-inner > div:last-child');
    if (!nav) return;
    let button = existingButton || document.getElementById('experienceMuteToggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'experienceMuteToggle';
      button.type = 'button';
      button.className = 'experience-mute-toggle';
      nav.insertBefore(button, document.getElementById('logoutBtn'));
      button.addEventListener('click', () => { const next = !userMuted(); setMuted(next, button); });
    }
    const isMuted = userMuted();
    button.setAttribute('aria-label', isMuted ? 'Turn on portal sounds and haptics' : 'Mute portal sounds and haptics');
    button.setAttribute('aria-pressed', String(isMuted));
    button.innerHTML = isMuted
      ? '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 4c1 1 1 5 0 6m3-9c3 3 3 9 0 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function timeGreeting(name) {
    const hour = new Date().getHours();
    const label = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const first = String(name || 'there').trim().split(/\s+/)[0] || 'there';
    return `${label}, ${first}.`;
  }

  function completionModel(profile) {
    const student = profile?.student || {};
    const core = [student.name, student.email, student.phone, student.avatar_path, student.ssc_marks, student.hsc_marks, student.resume_url];
    const completeCore = core.filter(value => value !== null && value !== undefined && String(value).trim() !== '').length;
    const enrichment = ['skills','internships','certificates','projects','research_papers'].filter(key => (profile?.[key] || []).length > 0).length;
    return Math.round(((completeCore * 2 + enrichment) / (core.length * 2 + 5)) * 100);
  }

  function mood(percent) { return percent >= 90 ? 'ready' : percent >= 70 ? 'strong' : percent >= 45 ? 'building' : 'needs'; }

  function applyFrame(element, context, { allowTriple = true } = {}) {
    if (!element || !context) return;
    element.classList.remove('rank-frame','rank-frame-gold','rank-frame-silver','rank-frame-bronze','rank-frame-triple');
    let frame = context.frame || 'none';
    if (frame === 'triple' && !allowTriple) frame = 'gold';
    if (frame !== 'none') element.classList.add('rank-frame', `rank-frame-${frame}`);
    element.dataset.triple = String(context.frame === 'triple');
    const branch = String(context.branch || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-');
    if (branch) element.dataset.branchFrame = branch;
  }

  function installStudentAvatar(profile, context, percent) {
    const avatar = document.getElementById('studentAvatar');
    if (!avatar) return;
    applyFrame(avatar, context);
    // The rank frame shares the avatar element with the signed background image.
    // Re-run the existing loader after decorating so mobile Chromium never leaves the blank fallback painted.
    if (typeof window.loadStudentAvatar === 'function') window.loadStudentAvatar();
    avatar.dataset.rankReveal = 'true';
    avatar.tabIndex = 0;
    avatar.setAttribute('role', 'button');
    avatar.setAttribute('aria-expanded', 'false');
    avatar.setAttribute('aria-label', 'Show rank and profile completion');
    let reveal = avatar.querySelector('.rank-photo-reveal');
    if (!reveal) { reveal = document.createElement('span'); reveal.className = 'rank-photo-reveal'; avatar.appendChild(reveal); }
    reveal.textContent = context?.college_rank ? `#${context.college_rank} college · ${percent}% complete` : `${percent}% complete`;
    const toggle = () => {
      const open = !avatar.classList.contains('is-rank-reveal-open');
      avatar.classList.toggle('is-rank-reveal-open', open);
      avatar.setAttribute('aria-expanded', String(open));
    };
    if (!avatar.dataset.rankRevealBound) {
      avatar.dataset.rankRevealBound = '1';
      avatar.addEventListener('click', toggle);
      avatar.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    }
  }

  function installGreeting(profile) {
    const info = document.querySelector('.header-banner .student-info');
    if (!info) return;
    let greeting = document.getElementById('experienceGreeting');
    if (!greeting) { greeting = document.createElement('span'); greeting.id = 'experienceGreeting'; greeting.className = 'experience-greeting'; info.appendChild(greeting); }
    greeting.textContent = timeGreeting(profile?.student?.name);
  }

  function friendlyEmptyHtml(title, copy, icon = 'certificate') {
    const paths = {
      certificate:'<path d="M7 3h10v18l-5-3-5 3V3Zm2 4h6M9 11h6"/>',
      briefcase:'<path d="M8 7V5h8v2m-12 0h16v12H4V7Zm0 5h16M10 12v2h4v-2"/>',
      folder:'<path d="M3 7h7l2 2h9v10H3V7Z"/>',
      file:'<path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6"/>'
    };
    return `<div class="friendly-empty"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[icon] || paths.file}</svg><strong>${esc(title)}</strong><p>${esc(copy)}</p></div>`;
  }

  function installEmptyStates(profile) {
    const sections = [
      ['certificatesList', profile.certificates, 'No certificates yet', 'Add a genuine course or credential when you have one. Verification keeps the leaderboard fair.', 'certificate'],
      ['internshipsList', profile.internships, 'No internships yet', 'Your first internship can go here when you are ready to document it.', 'briefcase'],
      ['projectsList', profile.projects, 'No projects yet', 'Build something useful, then add the project and evidence here.', 'folder'],
      ['researchList', profile.research_papers, 'No research papers yet', 'Published work will appear here when you add it.', 'file']
    ];
    sections.forEach(([id, items, title, copy, icon]) => {
      const host = document.getElementById(id);
      if (host && (!items || items.length === 0)) host.innerHTML = friendlyEmptyHtml(title, copy, icon);
    });
  }

  function installSinceLast(profile, context, competitions, notifications) {
    const overview = document.getElementById('tab-overview');
    if (!overview) return;
    const studentId = profile.student?.id || '';
    const lastVisitRaw = localStorage.getItem(storageKey('last-visit', studentId));
    const lastVisit = lastVisitRaw ? new Date(lastVisitRaw) : null;
    const previousStatuses = JSON.parse(localStorage.getItem(storageKey('verification-snapshot', studentId)) || '{}');
    const records = [...(profile.certificates || []), ...(profile.internships || []), ...(competitions || [])];
    let verificationChanges = 0;
    const nextStatuses = {};
    records.forEach(item => {
      if (!item?.id) return;
      const status = item.verification_status || 'pending';
      nextStatuses[item.id] = status;
      if (previousStatuses[item.id] && previousStatuses[item.id] !== status) verificationChanges += 1;
    });
    const newMatches = lastVisit ? (notifications || []).filter(item => {
      const created = new Date(item.created_at || 0);
      const text = `${item.title || ''} ${item.message || ''}`;
      return created > lastVisit && /\b(job|drive|match|opportunit|placement)\b/i.test(text);
    }).length : 0;
    const movement = Number(context?.rank_movement || 0);
    let card = document.getElementById('sinceLastVisitCard');
    if (!card) { card = document.createElement('section'); card.id = 'sinceLastVisitCard'; card.className = 'glass-card since-last-card'; overview.prepend(card); }
    const visitedLabel = lastVisit ? `Since ${lastVisit.toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}` : 'First visit snapshot';
    const hasChanges = newMatches > 0 || movement !== 0 || verificationChanges > 0;
    card.classList.toggle('is-quiet', !hasChanges);
    if (!hasChanges) {
      card.innerHTML = `<div class="since-last-summary"><span class="eyebrow">Since you last visited</span><h3>Nothing new since your last visit</h3><p>${esc(visitedLabel)} · Your placement, rank and verification snapshot is unchanged.</p></div>`;
    } else {
      card.innerHTML = `<div><span class="eyebrow">Since you last visited</span><h3>Here is what changed</h3><p>${esc(visitedLabel)}</p></div><div class="readiness-chip">Live snapshot</div><div class="since-last-grid"><div class="since-last-item"><strong>${newMatches}</strong><span>new placement/JD updates</span></div><div class="since-last-item"><strong>${movement === 0 ? '—' : movement > 0 ? `↑ ${movement}` : `↓ ${Math.abs(movement)}`}</strong><span>rank movement</span></div><div class="since-last-item"><strong>${verificationChanges}</strong><span>verification changes</span></div></div>`;
    }
    localStorage.setItem(storageKey('verification-snapshot', studentId), JSON.stringify(nextStatuses));
    localStorage.setItem(storageKey('last-visit', studentId), new Date().toISOString());
  }

  function milestoneCheck(context) {
    if (!context?.student_id) return;
    const key = storageKey('rank-frame', context.student_id);
    const previous = localStorage.getItem(key);
    const current = `${context.frame}:${context.college_rank}:${context.branch_rank}:${context.class_year_rank}`;
    if (previous && previous !== current && ['gold','silver','bronze','triple'].includes(context.frame)) feedback('milestone');
    localStorage.setItem(key, current);
  }

  function wrapSuccessToasts() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (typeof window.showToast !== 'function') { if (attempts > 80) clearInterval(timer); return; }
      clearInterval(timer);
      if (window.showToast.__experienceWrapped) return;
      const original = window.showToast;
      const wrapped = function(message, type = 'info') {
        let output = message;
        if (type === 'success' && typeof message === 'string' && /\b(saved successfully|successfully saved|updated successfully|uploaded successfully)\b/i.test(message)) {
          output = SUCCESS_MESSAGES[successCursor++ % SUCCESS_MESSAGES.length];
        }
        return original(output, type);
      };
      wrapped.__experienceWrapped = true;
      window.showToast = wrapped;
    }, 50);
  }

  function wrapFetchFeedback() {
    if (!document.body.classList.contains('student-dashboard-page') || window.fetch.__experienceWrapped) return;
    const original = window.fetch.bind(window);
    const wrapped = async function(input, init = {}) {
      const response = await original(input, init);
      try {
        const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
        const method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
        if (response.ok && ((method === 'PUT' && url.pathname === '/api/student/profile') || (method === 'POST' && /\/api\/student\/certificate-evidence\//.test(url.pathname)))) {
          feedback('soft');
        }
      } catch (_) {}
      return response;
    };
    wrapped.__experienceWrapped = true;
    window.fetch = wrapped;
  }

  async function api(path, tokenKey = 'tpo_token') {
    const headers = {};
    const token = localStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { headers, cache:'no-store' });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Request failed');
    return json.data;
  }

  async function bootStudent() {
    renderMuteToggle();
    wrapSuccessToasts();
    wrapFetchFeedback();
    try {
      const [profile, context, competitions, notifications] = await Promise.all([
        api('/api/student/profile'), api('/api/student/engagement/context'), api('/api/student/competitions').catch(() => []), api('/api/student/workflow/notifications').catch(() => [])
      ]);
      currentContext = context;
      currentCompletion = completionModel(profile);
      document.body.dataset.profileMood = mood(currentCompletion);
      installGreeting(profile);
      installStudentAvatar(profile, context, currentCompletion);
      installEmptyStates(profile);
      installSinceLast(profile, context, competitions, notifications);
      milestoneCheck(context);
    } catch (error) { console.warn('Student experience enhancements unavailable:', error.message); }
  }

  function initials(name) { return String(name || 'Student').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase(); }

  async function decorateCandidateProfile(student, role) {
    const root = document.querySelector('.candidate-profile-v2');
    const hero = root?.querySelector('.candidate-profile-hero');
    if (!hero || hero.querySelector('.candidate-rank-avatar')) return;
    const avatar = document.createElement('button');
    avatar.type = 'button';
    avatar.className = 'candidate-rank-avatar';
    avatar.setAttribute('aria-label', `Show ${student.name || 'student'} rank frame`);
    avatar.innerHTML = `<img alt="${esc(student.name || 'Student')} profile picture" src="/api/${role === 'admin' ? 'admin' : 'observer'}/student-avatars/${encodeURIComponent(student.id)}"><span class="candidate-avatar-fallback">${esc(initials(student.name))}</span>`;
    const img = avatar.querySelector('img');
    const fallback = avatar.querySelector('.candidate-avatar-fallback');
    img.addEventListener('load', () => { fallback.hidden = true; });
    img.addEventListener('error', () => { img.hidden = true; fallback.hidden = false; });
    hero.classList.add('has-rank-avatar');
    hero.prepend(avatar);
    try {
      const context = await api(`/api/${role === 'admin' ? 'admin' : 'observer'}/engagement/students/${encodeURIComponent(student.id)}`, role === 'admin' ? 'tpo_admin_token' : 'tpo_observer_token');
      const allowTriple = role !== 'observer';
      applyFrame(avatar, context, { allowTriple });
      const copy = hero.querySelector('h2')?.parentElement;
      if (copy) {
        const badge = document.createElement('span');
        badge.className = 'candidate-rank-badge';
        badge.textContent = `College #${context.college_rank || '—'} · Branch #${context.branch_rank || '—'} · Class/year #${context.class_year_rank || '—'}`;
        copy.appendChild(badge);
      }
      if (context.frame === 'triple' && role === 'admin') {
        const toggle = () => avatar.classList.toggle('is-rank-reveal-open');
        avatar.addEventListener('click', toggle);
      }
    } catch (_) { /* candidate profile stays usable without decorative rank data */ }
  }

  function installLoginAmbient() {
    if (!document.body.classList.contains('unified-auth-shell')) return;
    const saveData = navigator.connection?.saveData;
    const lowMemory = Number(navigator.deviceMemory || 4) <= 2;
    if (saveData || lowMemory) return;
    const story = document.querySelector('.portal-story');
    if (!story || story.querySelector('.login-ambient')) return;
    const ambient = document.createElement('div');
    ambient.className = 'login-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    const positions = [[8,16],[20,72],[34,32],[47,84],[58,18],[69,61],[81,38],[91,76],[15,47],[41,58],[74,12],[88,52]];
    ambient.innerHTML = positions.map(([x,y], index) => `<i style="left:${x}%;top:${y}%;animation-delay:-${index * .37}s"></i>`).join('');
    story.prepend(ambient);
  }

  function boot() {
    installLoginAmbient();
    if (document.body.classList.contains('student-dashboard-page')) bootStudent();
  }

  window.PortalStudentExperience = { applyFrame, decorateCandidateProfile, feedback, installLoginAmbient };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
