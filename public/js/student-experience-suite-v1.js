(() => {
  if (!document.body.classList.contains('student-dashboard-page') || window.__aitStudentExperienceSuiteV1) return;
  window.__aitStudentExperienceSuiteV1 = true;

  const token = () => localStorage.getItem('tpo_token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const state = { home: null, ranking: null, rankHistory: [], loading: false, notificationGrouping: false };
  let notificationTimer = null;
  let opportunityTimer = null;

  function authHeaders(extra = {}) {
    return { ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...extra };
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      ...options,
      headers: authHeaders(options.headers || {})
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) throw new Error(json?.error?.message || json?.error || 'Request failed.');
    return json.data;
  }

  function timeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function relativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { day:'numeric', month:'short' });
  }

  function goTab(tab) {
    if (tab === 'inbox') {
      if (typeof window.openNotificationCenter === 'function') window.openNotificationCenter();
      else document.getElementById('notificationBell')?.click();
      return;
    }
    let button = null;
    if (tab === 'ranking') {
      button = document.querySelector('.tabs-nav .tab-btn[aria-controls="tab-ranking"]') || document.querySelector('.tabs-nav .tab-btn[aria-controls="tab-ranking-lazy"]');
    } else {
      button = document.querySelector(`.tabs-nav .tab-btn[aria-controls="tab-${String(tab).replace(/[^a-z0-9-]/gi, '')}"]`);
    }
    if (button) {
      button.click();
      setTimeout(() => document.getElementById(`tab-${tab}`)?.scrollIntoView({ block:'start', behavior:'smooth' }), 60);
    }
  }

  function statusText(stateName) {
    return stateName === 'strong' ? 'Strong' : stateName === 'partial' ? 'Build' : 'Needs work';
  }

  function rankingStorageKey() {
    const student = state.home?.bundle?.student || {};
    return `ait-rank-history:${student.id || student.prn || 'student'}`;
  }

  function storeRankSnapshot(current, cohortSize) {
    if (!current) return [];
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(rankingStorageKey()) || '[]');
      if (!Array.isArray(history)) history = [];
    } catch (_) { history = []; }

    const today = new Date().toISOString().slice(0, 10);
    const entry = { date: today, rank: num(current.rank), points: num(current.points), cohort: num(cohortSize) };
    const existing = history.findIndex(item => item.date === today);
    if (existing >= 0) history[existing] = entry;
    else history.push(entry);
    history = history.filter(item => item?.date && num(item.rank) > 0).slice(-30);
    try { localStorage.setItem(rankingStorageKey(), JSON.stringify(history)); } catch (_) {}
    state.rankHistory = history;
    return history;
  }

  function rankMovement() {
    const history = state.rankHistory;
    if (!state.ranking || history.length < 2) return { label:'Baseline saved', direction:'flat', value:0 };
    const current = history[history.length - 1];
    const previous = [...history].reverse().find(item => item.date !== current.date) || history[history.length - 2];
    const change = num(previous.rank) - num(current.rank);
    return {
      label: change > 0 ? `↑${change} rank${change === 1 ? '' : 's'}` : change < 0 ? `↓${Math.abs(change)} rank${Math.abs(change) === 1 ? '' : 's'}` : 'No rank change',
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      value: change
    };
  }

  function rankSparkline() {
    const history = state.rankHistory;
    if (history.length < 2) return '<div class="exp-spark-empty">Rank history starts from this device today.</div>';
    const rows = history.slice(-7);
    const ranks = rows.map(item => num(item.rank));
    const max = Math.max(...ranks);
    const min = Math.min(...ranks);
    const span = Math.max(1, max - min);
    const points = rows.map((item, index) => {
      const x = rows.length === 1 ? 50 : (index / (rows.length - 1)) * 100;
      const y = 8 + ((num(item.rank) - min) / span) * 34;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="exp-rank-spark" viewBox="0 0 100 50" preserveAspectRatio="none" aria-label="Recent rank movement"><polyline points="${points}" fill="none" vector-effect="non-scaling-stroke"></polyline></svg>`;
  }

  function bestOpportunity() {
    const rows = state.home?.opportunities || [];
    return rows.find(item => item.status === 'open' && item.eligibility?.eligible && !item.application)
      || rows.find(item => item.status === 'open' && item.eligibility?.eligible)
      || rows[0]
      || null;
  }

  function opportunityCard(item) {
    if (!item) return `<div class="exp-empty"><strong>No matching drive right now</strong><span>New placement opportunities will surface here automatically.</span></div>`;
    const match = num(item.eligibility?.score);
    const missing = item.eligibility?.missing_required || [];
    const matched = item.eligibility?.matched_skills || [];
    const deadline = item.deadline ? new Date(item.deadline) : null;
    const deadlineText = deadline && !Number.isNaN(deadline.getTime())
      ? deadline.toLocaleDateString(undefined, { day:'numeric', month:'short' })
      : '';
    return `<div class="exp-opportunity-main">
      <div class="exp-opportunity-head"><div><strong>${esc(item.company || 'Placement drive')}</strong><span>${esc(item.role || 'Opportunity')}</span></div><b>${match}%</b></div>
      <div class="exp-opportunity-meta"><span class="${item.eligibility?.eligible ? 'good' : 'warn'}">${item.eligibility?.eligible ? 'Eligible' : 'Check eligibility'}</span>${deadlineText ? `<span>Deadline ${esc(deadlineText)}</span>` : ''}${item.application ? `<span>Applied · ${esc(item.application.status || 'submitted')}</span>` : ''}</div>
      <div class="exp-match-skills">${matched.slice(0, 4).map(skill => `<span class="good">✓ ${esc(skill)}</span>`).join('')}${missing.slice(0, 3).map(skill => `<span class="missing">Missing ${esc(skill)}</span>`).join('')}</div>
    </div>`;
  }

  function readinessRows() {
    const breakdown = state.home?.readiness?.breakdown || {};
    return Object.entries(breakdown).map(([, row]) => {
      const pct = row.max ? Math.round(row.score / row.max * 100) : 0;
      return `<div class="exp-readiness-row"><div><span>${esc(row.label)}</span><strong>${row.score}/${row.max}</strong></div><div class="exp-progress"><i style="--value:${pct}%"></i></div></div>`;
    }).join('');
  }

  function achievementsHtml() {
    const rows = [...(state.home?.achievements || [])];
    const me = state.ranking;
    if (me) {
      if (num(me.rank) > 0 && num(me.rank) <= 3 && !rows.some(item => item.key === 'top-3')) {
        rows.unshift({ key:'top-3', label:'Top 3', detail:`College-wide rank #${me.rank}.`, tier:'elite' });
      } else if (num(me.rank) > 0 && num(me.cohort_size) > 0 && me.rank / me.cohort_size <= .1 && !rows.some(item => item.key === 'top-10-percent')) {
        rows.unshift({ key:'top-10-percent', label:'Top 10%', detail:`Rank #${me.rank} of ${me.cohort_size}.`, tier:'elite' });
      }
    }
    if (!rows.length) return '<div class="exp-empty"><strong>Your first milestone is close</strong><span>Complete profile sections and verified work to unlock achievements.</span></div>';
    return rows.slice(0, 6).map(item => `<div class="exp-achievement ${esc(item.tier || 'standard')}"><span aria-hidden="true">${item.tier === 'elite' ? '★' : item.tier === 'verified' ? '✓' : '◆'}</span><div><strong>${esc(item.label)}</strong><small>${esc(item.detail || '')}</small></div></div>`).join('');
  }

  function strengthHtml() {
    return (state.home?.strength || []).map(item => `<button type="button" class="exp-strength ${esc(item.state)}" data-exp-tab="${esc(item.tab)}"><span>${esc(item.label)}</span><strong>${statusText(item.state)}</strong><small>${item.score}/${item.max}</small></button>`).join('');
  }

  function activityHtml() {
    const rows = state.home?.activity || [];
    if (!rows.length) return '<div class="exp-empty"><strong>No recent profile activity</strong><span>Your profile changes and milestones will appear here.</span></div>';
    return rows.slice(0, 5).map(item => `<div class="exp-activity-item"><span class="exp-activity-dot" aria-hidden="true"></span><div><strong>${esc(item.summary || `${item.category || 'Profile'} ${item.action || 'updated'}`)}</strong><small>${esc(item.category || 'Profile')} · ${esc(relativeTime(item.created_at))}</small></div></div>`).join('');
  }

  function renderCommandCenter() {
    const overview = document.getElementById('tab-overview');
    if (!overview || !state.home) return;
    let shell = document.getElementById('studentCommandCenter');
    if (!shell) {
      shell = document.createElement('section');
      shell.id = 'studentCommandCenter';
      shell.className = 'student-command-center';
      overview.prepend(shell);
    }

    const student = state.home.bundle?.student || {};
    const firstName = String(student.name || 'Student').trim().split(/\s+/)[0] || 'Student';
    const movement = rankMovement();
    const next = state.home.next_action || {};
    const opportunity = bestOpportunity();
    const ranking = state.ranking;
    const rankValue = ranking ? `#${num(ranking.rank) || '—'}` : '…';
    const pointsValue = ranking ? num(ranking.points).toFixed(1).replace(/\.0$/, '') : '…';

    shell.innerHTML = `
      <div class="exp-hero">
        <div class="exp-hero-copy"><span class="exp-kicker"><b>NEW</b> Student Command Center</span><h1>${timeGreeting()}, ${esc(firstName)}</h1><p>Your placement profile, opportunities and progress in one view.</p></div>
        <div class="exp-hero-actions"><button class="btn btn-secondary btn-sm" type="button" data-exp-action="share">Share profile</button><button class="btn btn-primary btn-sm" type="button" data-exp-action="copilot">Career AI</button></div>
      </div>

      <div class="exp-metrics" aria-label="Student career metrics">
        <button class="exp-metric" type="button" data-exp-tab="ranking"><span>College rank</span><strong id="expMetricRank">${rankValue}</strong><small class="${movement.direction}">${esc(movement.label)}</small></button>
        <button class="exp-metric" type="button" data-exp-tab="ranking"><span>Profile points</span><strong id="expMetricPoints">${pointsValue}</strong><small>${ranking?.pending_points ? `+${esc(ranking.pending_points)} pending` : 'Audited scoring'}</small></button>
        <button class="exp-metric" type="button" data-exp-tab="edit-profile"><span>Profile</span><strong>${num(state.home.completion)}%</strong><small>${state.home.completion >= 90 ? 'Strong completion' : 'Keep building'}</small></button>
        <button class="exp-metric" type="button" data-exp-action="readiness"><span>Career readiness</span><strong>${num(state.home.readiness?.score)}/100</strong><small>${state.home.readiness?.score >= 80 ? 'Placement ready' : 'Improve weakest area'}</small></button>
      </div>

      <div class="exp-primary-grid">
        <article class="glass-card exp-next-card">
          <div class="exp-card-heading"><div><span class="eyebrow">Next best action</span><h2>${esc(next.title || 'Keep your profile current')}</h2></div><span class="exp-priority-dot"></span></div>
          <p>${esc(next.detail || '')}</p>
          <button class="btn btn-primary btn-sm" type="button" data-exp-tab="${esc(next.tab || 'overview')}">Do this now</button>
        </article>

        <article class="glass-card exp-readiness-card">
          <div class="exp-card-heading"><div><span class="eyebrow">Career readiness</span><h2>${num(state.home.readiness?.score)}/100</h2></div><button class="exp-text-btn" type="button" data-exp-action="readiness">Full breakdown</button></div>
          <div class="exp-readiness-preview">${Object.values(state.home.readiness?.breakdown || {}).sort((a,b)=>(a.score/a.max)-(b.score/b.max)).slice(0,3).map(row => `<div><span>${esc(row.label)}</span><strong>${row.score}/${row.max}</strong></div>`).join('')}</div>
          <p class="exp-muted">Focus first on the lowest category instead of trying to improve everything at once.</p>
        </article>
      </div>

      <div class="exp-secondary-grid">
        <article class="glass-card exp-panel exp-opportunity-card">
          <div class="exp-card-heading"><div><span class="eyebrow">Best match</span><h3>Opportunity for you</h3></div><button class="exp-text-btn" type="button" data-exp-tab="opportunities">View all</button></div>
          ${opportunityCard(opportunity)}
          ${opportunity ? `<button class="exp-link-row" type="button" data-exp-tab="opportunities">Why I match <span>→</span></button>` : ''}
        </article>

        <article class="glass-card exp-panel">
          <div class="exp-card-heading"><div><span class="eyebrow">Momentum</span><h3>Rank movement</h3></div><span class="exp-rank-chip ${movement.direction}">${esc(movement.label)}</span></div>
          ${rankSparkline()}
          <p class="exp-muted">${ranking ? `Current rank #${ranking.rank} of ${ranking.cohort_size}. History builds automatically as you use the portal.` : 'Ranking is loading in the background.'}</p>
        </article>

        <article class="glass-card exp-panel exp-achievement-panel">
          <div class="exp-card-heading"><div><span class="eyebrow">Milestones</span><h3>Achievements</h3></div></div>
          <div class="exp-achievement-grid">${achievementsHtml()}</div>
        </article>

        <article class="glass-card exp-panel exp-strength-panel">
          <div class="exp-card-heading"><div><span class="eyebrow">Profile map</span><h3>Profile strength</h3></div></div>
          <div class="exp-strength-grid">${strengthHtml()}</div>
        </article>

        <article class="glass-card exp-panel exp-activity-panel">
          <div class="exp-card-heading"><div><span class="eyebrow">Your history</span><h3>Recent activity</h3></div></div>
          <div class="exp-activity-list">${activityHtml()}</div>
        </article>
      </div>`;

    wireCommandActions(shell);
  }

  function wireCommandActions(root) {
    root.querySelectorAll('[data-exp-tab]').forEach(button => {
      button.addEventListener('click', () => goTab(button.dataset.expTab));
    });
    root.querySelectorAll('[data-exp-action="readiness"]').forEach(button => button.addEventListener('click', openReadiness));
    root.querySelector('[data-exp-action="share"]')?.addEventListener('click', openShare);
    root.querySelector('[data-exp-action="copilot"]')?.addEventListener('click', openCopilot);
  }

  function ensureModalStyle(modal) {
    modal.classList.add('experience-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
  }

  function openReadiness() {
    let modal = document.getElementById('experienceReadinessModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'experienceReadinessModal';
      modal.className = 'modal-backdrop';
      ensureModalStyle(modal);
      modal.innerHTML = `<section class="glass-card modal-card exp-modal-card"><div class="modal-header"><div><span class="eyebrow">Career readiness</span><h3>What makes up your score</h3></div><button class="close-btn" type="button" aria-label="Close">&times;</button></div><div id="experienceReadinessBody"></div></section>`;
      document.body.appendChild(modal);
      modal.querySelector('.close-btn').onclick = () => modal.classList.remove('active');
      modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('active'); });
    }
    modal.querySelector('#experienceReadinessBody').innerHTML = `<div class="exp-readiness-score"><strong>${num(state.home?.readiness?.score)}</strong><span>/100</span></div><div class="exp-readiness-rows">${readinessRows()}</div><p class="exp-muted">Readiness is a guidance score built from academics, resume, skills, experience, projects, verified credentials and professional links. Placement eligibility is still determined by each drive's actual criteria.</p>`;
    modal.classList.add('active');
    modal.querySelector('.close-btn')?.focus();
  }

  function openShare() {
    let modal = document.getElementById('experienceShareModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'experienceShareModal';
      modal.className = 'modal-backdrop';
      ensureModalStyle(modal);
      modal.innerHTML = `<section class="glass-card modal-card exp-modal-card"><div class="modal-header"><div><span class="eyebrow">Verified portfolio</span><h3>Share your AIT profile</h3><p class="section-note">Creates a 30-day public link with career-safe profile data. Phone, email and private evidence files are not exposed.</p></div><button class="close-btn" type="button" aria-label="Close">&times;</button></div><div id="experienceShareBody"><button id="experienceGenerateShare" class="btn btn-primary" type="button">Create share link</button></div></section>`;
      document.body.appendChild(modal);
      modal.querySelector('.close-btn').onclick = () => modal.classList.remove('active');
      modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('active'); });
      modal.querySelector('#experienceGenerateShare').onclick = generateShare;
    }
    modal.classList.add('active');
    modal.querySelector('#experienceGenerateShare')?.focus();
  }

  async function generateShare() {
    const body = document.getElementById('experienceShareBody');
    if (!body) return;
    body.innerHTML = '<div class="exp-loading">Creating secure profile link…</div>';
    try {
      const data = await api('/api/student/experience/share', { method:'POST' });
      const url = new URL(data.path, location.origin).href;
      body.innerHTML = `<label class="form-label" for="experienceShareUrl">Public profile link</label><div class="exp-share-row"><input id="experienceShareUrl" class="form-input" readonly value="${esc(url)}"><button id="experienceCopyShare" class="btn btn-primary" type="button">Copy</button></div><small class="form-help">Expires in ${esc(data.expires_in_days)} days. Only share it with people you want to view your portfolio.</small>`;
      body.querySelector('#experienceCopyShare').onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          if (typeof window.showToast === 'function') window.showToast('Profile link copied.', 'success');
        } catch (_) {
          body.querySelector('#experienceShareUrl').select();
          document.execCommand?.('copy');
        }
      };
    } catch (error) {
      body.innerHTML = `<div class="form-error">${esc(error.message)}</div><button id="experienceGenerateShare" class="btn btn-primary" type="button">Try again</button>`;
      body.querySelector('#experienceGenerateShare').onclick = generateShare;
    }
  }

  function openCopilot() {
    let modal = document.getElementById('experienceCopilotModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'experienceCopilotModal';
      modal.className = 'modal-backdrop';
      ensureModalStyle(modal);
      modal.innerHTML = `<section class="glass-card modal-card exp-modal-card exp-copilot-card"><div class="modal-header"><div><span class="eyebrow">Career AI</span><h3>Ask Career Copilot</h3><p class="section-note">Answers use your actual placement profile and visible opportunity data.</p></div><button class="close-btn" type="button" aria-label="Close">&times;</button></div><div class="exp-copilot-prompts"><button type="button">How do I improve my readiness?</button><button type="button">Which skills am I missing?</button><button type="button">What should I improve in my resume?</button><button type="button">How do Profile Points work?</button></div><div id="experienceCopilotAnswer" class="exp-copilot-answer"><strong>Ask something about your placement profile.</strong><span>I will not invent jobs, credentials or scores.</span></div><form id="experienceCopilotForm" class="exp-copilot-form"><label class="sr-only" for="experienceCopilotInput">Career question</label><input id="experienceCopilotInput" class="form-input" maxlength="800" placeholder="Ask about your profile, skills, jobs or ranking…" required><button class="btn btn-primary" type="submit">Ask</button></form></section>`;
      document.body.appendChild(modal);
      modal.querySelector('.close-btn').onclick = () => modal.classList.remove('active');
      modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('active'); });
      modal.querySelectorAll('.exp-copilot-prompts button').forEach(button => button.onclick = () => {
        modal.querySelector('#experienceCopilotInput').value = button.textContent;
        askCopilot(button.textContent);
      });
      modal.querySelector('#experienceCopilotForm').onsubmit = event => {
        event.preventDefault();
        askCopilot(modal.querySelector('#experienceCopilotInput').value.trim());
      };
    }
    modal.classList.add('active');
    modal.querySelector('#experienceCopilotInput')?.focus();
  }

  async function askCopilot(question) {
    if (!question) return;
    const answer = document.getElementById('experienceCopilotAnswer');
    const submit = document.querySelector('#experienceCopilotForm button[type="submit"]');
    if (!answer) return;
    answer.innerHTML = '<div class="exp-loading">Reviewing your profile…</div>';
    if (submit) submit.disabled = true;
    try {
      const data = await api('/api/student/experience/copilot', {
        method:'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ question })
      });
      answer.innerHTML = `<p>${esc(data.answer)}</p>${data.actions?.length ? `<div class="exp-copilot-actions">${data.actions.map(item => `<button class="btn btn-secondary btn-sm" type="button" data-exp-tab="${esc(item.tab || 'overview')}">${esc(item.label || 'Open')}</button>`).join('')}</div>` : ''}<small>${data.source === 'ai' ? 'Career AI · grounded in portal data' : 'Portal guidance · deterministic fallback'}</small>`;
      answer.querySelectorAll('[data-exp-tab]').forEach(button => button.onclick = () => {
        document.getElementById('experienceCopilotModal')?.classList.remove('active');
        goTab(button.dataset.expTab);
      });
    } catch (error) {
      answer.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function ensureMobileDock() {
    if (document.getElementById('studentMobileDock')) return;
    const dock = document.createElement('nav');
    dock.id = 'studentMobileDock';
    dock.className = 'student-mobile-dock';
    dock.setAttribute('aria-label', 'Primary student navigation');
    const icon = name => ({
      home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/></svg>',
      jobs:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6V4h6v2m-11 4h16v10H4Zm0 0 8 5 8-5"/></svg>',
      rank:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4a4 4 0 0 1-8 0Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 0v5m-4 3h8"/></svg>',
      inbox:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4Zm0 9h5l2 2h2l2-2h5"/></svg>',
      profile:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
    }[name]);
    dock.innerHTML = [
      ['overview','Home','home'],
      ['opportunities','Jobs','jobs'],
      ['ranking','Rank','rank'],
      ['inbox','Inbox','inbox'],
      ['edit-profile','Profile','profile']
    ].map(([tab,label,key]) => `<button type="button" data-exp-tab="${tab}">${icon(key)}<span>${label}</span>${tab === 'inbox' ? '<b id="mobileDockUnread" hidden></b>' : ''}</button>`).join('');
    document.body.appendChild(dock);
    dock.querySelectorAll('[data-exp-tab]').forEach(button => button.onclick = () => goTab(button.dataset.expTab));
    syncDock();
  }

  function syncDock() {
    const dock = document.getElementById('studentMobileDock');
    if (!dock) return;
    const active = document.querySelector('.tab-content.active')?.id?.replace(/^tab-/, '') || 'overview';
    dock.querySelectorAll('button').forEach(button => {
      const tab = button.dataset.expTab;
      button.classList.toggle('active', tab === active || (tab === 'ranking' && active === 'ranking-lazy'));
    });
    const source = document.getElementById('bellUnreadCount');
    const target = document.getElementById('mobileDockUnread');
    if (source && target) {
      const count = num(source.textContent);
      target.textContent = count > 99 ? '99+' : String(count);
      target.hidden = count <= 0;
    }
  }

  function classifyNotificationText(title, message) {
    const text = `${title || ''} ${message || ''}`.toLowerCase();
    if (/verify|verified|certificate|proof|evidence/.test(text)) return 'Verification';
    if (/drive|placement|job|application|interview|offer|company/.test(text)) return 'Placements';
    if (/rank|point|leaderboard/.test(text)) return 'Ranking';
    if (/profile|resume|skill|correction/.test(text)) return 'Profile';
    return 'General';
  }

  function dateBucket(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Earlier';
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(date); d.setHours(0,0,0,0);
    const days = Math.round((today - d) / 86400000);
    if (days <= 0) return 'Today';
    if (days <= 7) return 'Earlier this week';
    return 'Earlier';
  }

  function decorateNotifications() {
    if (state.notificationGrouping) return;
    const list = document.getElementById('studentNotifications');
    if (!list) return;
    state.notificationGrouping = true;
    try {
      list.querySelectorAll('[data-exp-date-header]').forEach(node => node.remove());
      let lastBucket = '';
      [...list.querySelectorAll('.notification-item')].forEach(card => {
        if (card.dataset.browserAlertControl === 'true' || card.dataset.importantInboxSummary === 'true') return;
        const title = card.querySelector('h4')?.textContent || '';
        const message = card.querySelector('p')?.textContent || '';
        const priority = card.querySelector('.notification-priority');
        if (priority && !card.querySelector('.exp-notification-category')) {
          const chip = document.createElement('span');
          chip.className = 'exp-notification-category';
          chip.textContent = classifyNotificationText(title, message);
          priority.after(chip);
        }
        const time = card.querySelector('time');
        const bucket = dateBucket(time ? new Date(time.textContent) : null);
        if (bucket !== lastBucket) {
          const header = document.createElement('div');
          header.className = 'exp-notification-date';
          header.dataset.expDateHeader = 'true';
          header.textContent = bucket;
          card.before(header);
          lastBucket = bucket;
        }
      });
    } finally {
      state.notificationGrouping = false;
    }
    syncDock();
  }

  function scheduleNotificationDecorate() {
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(decorateNotifications, 50);
  }

  function enhanceOpportunities() {
    const host = document.getElementById('studentOpportunities');
    if (!host || !state.home) return;
    [...host.querySelectorAll('.opportunity-record:not([data-exp-match-ready])')].forEach(card => {
      const company = card.querySelector('.workflow-card-head strong')?.textContent?.trim() || '';
      const role = card.querySelector('.workflow-card-head p')?.textContent?.trim() || '';
      const item = state.home.opportunities.find(row => String(row.company || '').trim() === company && String(row.role || '').trim() === role);
      if (!item) return;
      card.dataset.expMatchReady = 'true';
      const details = document.createElement('div');
      details.className = 'exp-drive-details';
      const matched = item.eligibility?.matched_skills || [];
      const missing = item.eligibility?.missing_required || [];
      const deadline = item.deadline ? new Date(item.deadline) : null;
      details.innerHTML = `<div class="exp-drive-chips">${matched.slice(0,5).map(skill => `<span class="good">✓ ${esc(skill)}</span>`).join('')}${missing.slice(0,4).map(skill => `<span class="missing">Missing ${esc(skill)}</span>`).join('')}</div>${deadline && !Number.isNaN(deadline.getTime()) ? `<small>Apply by ${esc(deadline.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}))}</small>` : ''}`;
      card.appendChild(details);
    });
  }

  function scheduleOpportunityEnhance() {
    clearTimeout(opportunityTimer);
    opportunityTimer = setTimeout(enhanceOpportunities, 60);
  }

  async function loadRanking() {
    try {
      const data = await api('/api/student/rankings-view/profile?branch=all&year=all');
      const me = data.current;
      if (!me) return;
      state.ranking = { ...me, cohort_size: data.rows?.length || 0 };
      storeRankSnapshot(state.ranking, state.ranking.cohort_size);
      renderCommandCenter();
    } catch (error) {
      console.warn('Command Center ranking unavailable:', error.message);
    }
  }

  async function loadHome() {
    if (state.loading) return;
    state.loading = true;
    try {
      state.home = await api('/api/student/experience/home');
      renderCommandCenter();
      ensureMobileDock();
      scheduleOpportunityEnhance();
      setTimeout(loadRanking, 120);
    } catch (error) {
      console.warn('Student Command Center unavailable:', error.message);
    } finally {
      state.loading = false;
    }
  }

  function boot() {
    ensureMobileDock();
    const overview = document.getElementById('tab-overview');
    if (overview) loadHome();
    else {
      const observer = new MutationObserver(() => {
        if (document.getElementById('tab-overview')) {
          observer.disconnect();
          loadHome();
        }
      });
      observer.observe(document.body, { childList:true, subtree:true });
    }

    const notificationList = document.getElementById('studentNotifications');
    if (notificationList) new MutationObserver(scheduleNotificationDecorate).observe(notificationList, { childList:true, subtree:true });
    const opportunities = document.getElementById('studentOpportunities');
    if (opportunities) new MutationObserver(scheduleOpportunityEnhance).observe(opportunities, { childList:true, subtree:true });
    const tabRoot = document.getElementById('dashboardContent') || document.body;
    new MutationObserver(syncDock).observe(tabRoot, { attributes:true, subtree:true, attributeFilter:['class','hidden'] });
    const bell = document.getElementById('bellUnreadCount');
    if (bell) new MutationObserver(syncDock).observe(bell, { childList:true, attributes:true, attributeFilter:['hidden'] });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') document.querySelectorAll('.experience-modal.active').forEach(modal => modal.classList.remove('active'));
    });
    scheduleNotificationDecorate();
  }

  window.AITStudentExperience = { reload: loadHome, goTab, getState: () => state };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
